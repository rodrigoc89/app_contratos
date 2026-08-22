import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../../src/shared/infrastructure/persistence/testDb";
import {
  determinarCodigoDeSalida,
  ejecutarVerificacionDeRestauracion,
} from "./verificarRestauracion";

/**
 * design.md D7's restore verifier: streams every `contrato_documentos` row's
 * file and compares it against the row's stored lowercase-hex sha256
 * (schema.prisma:279). A restore is mechanically proven, not assumed —
 * exactly the property `deploy/restore.sh` (task 9.2) hands off to.
 *
 * Task 8.2 (relocated here from Phase 8 — tasks.md's Re-slicing note 1) and
 * task 9.3 are two RED scenarios against this exact module, both satisfied
 * by the single GREEN in task 9.4.
 */
const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarBaseDeDatos(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearContratoBorrador(): Promise<string> {
  const contrato = await prisma.contrato.create({
    data: {
      comodatarioNombreCompleto: "Juan Carlos Pérez",
      comodatarioDni: "30123456",
      comodatarioDomicilioCalle: "Av. Belgrano 1250",
      comodatarioCiudad: "La Banda",
      comodatarioWhatsapp: "+543854123456",
      equipoAntenaModelo: "LiteBeam 5AC Gen2",
      equipoAntenaMac: "ac8ba9123456",
      equipoPoe: true,
      equipoCanoMetros: 6.5,
    },
  });
  return contrato.id;
}

async function crearFilaDocumento(
  contratoId: string,
  documento: "comodato" | "condiciones_generales",
  ruta: string,
  sha256: string,
): Promise<void> {
  await prisma.documentoContrato.create({
    data: { contratoId, documento, ruta, sha256 },
  });
}

/** Writes real bytes to disk and returns their real, lowercase-hex sha256 — the value a verifier that actually hashes the file would compute. */
async function escribirArchivo(
  directorioAlmacen: string,
  rutaRelativa: string,
  contenido: string,
): Promise<string> {
  const destino = join(directorioAlmacen, rutaRelativa);
  await mkdir(join(destino, ".."), { recursive: true });
  await writeFile(destino, contenido, "utf-8");
  return createHash("sha256").update(contenido, "utf-8").digest("hex");
}

describe("verificarRestauracion (restore hash verification, design.md D7)", () => {
  let directorioAlmacen: string;

  beforeEach(async () => {
    directorioAlmacen = await mkdtemp(join(tmpdir(), "verificar-restauracion-"));
  });

  it("reports every document as verified, and exit code 0, when every file's real bytes match its stored sha256", async () => {
    const contratoId = await crearContratoBorrador();
    const sha256Comodato = await escribirArchivo(directorioAlmacen, "1/comodato.pdf", "%PDF-fixture-comodato\n");
    const sha256Condiciones = await escribirArchivo(
      directorioAlmacen,
      "1/condiciones_generales.pdf",
      "%PDF-fixture-condiciones\n",
    );
    await crearFilaDocumento(contratoId, "comodato", "1/comodato.pdf", sha256Comodato);
    await crearFilaDocumento(contratoId, "condiciones_generales", "1/condiciones_generales.pdf", sha256Condiciones);

    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);

    expect(reporte.total).toBe(2);
    expect(reporte.verificados).toBe(2);
    expect(reporte.faltantes).toEqual([]);
    expect(reporte.desajustados).toEqual([]);
    expect(reporte.huerfanos).toEqual([]);
    expect(determinarCodigoDeSalida(reporte)).toBe(0);
  });

  // ------------------------------------------------------------- task 9.3

  it("reports a row whose file does not exist on disk as faltante, and exit code 1", async () => {
    const contratoId = await crearContratoBorrador();
    // No file is ever written for this row — the corrupted-fixture case.
    await crearFilaDocumento(contratoId, "comodato", "1/comodato.pdf", "0000000000000000000000000000000000000000000000000000000000000000".slice(0, 64));

    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);

    expect(reporte.total).toBe(1);
    expect(reporte.verificados).toBe(0);
    expect(reporte.faltantes).toEqual(["1/comodato.pdf"]);
    expect(reporte.desajustados).toEqual([]);
    expect(determinarCodigoDeSalida(reporte)).toBe(1);
  });

  it("reports a file whose real content does not match its stored sha256 as desajustado, and exit code 1", async () => {
    const contratoId = await crearContratoBorrador();
    await escribirArchivo(directorioAlmacen, "2/comodato.pdf", "%PDF-real-bytes-on-disk\n");
    // Deliberately the wrong hash — simulates a corrupted or truncated
    // restore, not what the real bytes above actually hash to.
    const shaEquivocado = createHash("sha256").update("not the real content", "utf-8").digest("hex");
    await crearFilaDocumento(contratoId, "comodato", "2/comodato.pdf", shaEquivocado);

    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);

    expect(reporte.total).toBe(1);
    expect(reporte.verificados).toBe(0);
    expect(reporte.faltantes).toEqual([]);
    expect(reporte.desajustados).toEqual(["2/comodato.pdf"]);
    expect(determinarCodigoDeSalida(reporte)).toBe(1);
  });

  it("reports total === 0 and exit code 1 when there is nothing to verify — a drill that checks nothing must not report success", async () => {
    // No contract, no document row, no file — the empty-database case.
    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);

    expect(reporte.total).toBe(0);
    expect(reporte.verificados).toBe(0);
    expect(reporte.faltantes).toEqual([]);
    expect(reporte.desajustados).toEqual([]);
    expect(reporte.huerfanos).toEqual([]);
    expect(determinarCodigoDeSalida(reporte)).toBe(1);
  });

  // ------------------------------------------------------------- task 8.2

  /**
   * design.md D7's ordering: `pg_dump` runs BEFORE the PDF-tree copy. A row
   * that commits after the dump completes but before the copy finishes is
   * therefore never in the restored database at all (the dump predates it)
   * — but its PDF, already written to disk by the time the copy step runs,
   * DOES end up in the restored document tree. The restored state is a
   * file on disk with NO row referencing it: exactly `huerfanos`, never
   * `faltantes` (there is no row to be "missing a file" — the row itself
   * was never backed up). This is the safe-orphan property `backup.sh`'s
   * ordering exists to guarantee, mechanically confirmed here.
   */
  it("reports an unreferenced file on disk as huerfano only, never as a missing row, and does not fail on it alone", async () => {
    const contratoId = await crearContratoBorrador();
    const sha256Comodato = await escribirArchivo(directorioAlmacen, "3/comodato.pdf", "%PDF-fixture-known-row\n");
    await crearFilaDocumento(contratoId, "comodato", "3/comodato.pdf", sha256Comodato);
    // Simulates the race: this file was copied into the backup, but its row
    // committed after the dump already ran, so no row for it exists at all.
    await escribirArchivo(directorioAlmacen, "4/comodato.pdf", "%PDF-orphan-written-after-dump\n");

    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);

    expect(reporte.total).toBe(1);
    expect(reporte.verificados).toBe(1);
    expect(reporte.faltantes).toEqual([]);
    expect(reporte.huerfanos).toEqual(["4/comodato.pdf"]);
    expect(determinarCodigoDeSalida(reporte)).toBe(0);
  });

  // ---------------------------------------------------- determinarCodigoDeSalida

  it("determinarCodigoDeSalida fails when faltantes or desajustados are present regardless of huerfanos", () => {
    expect(
      determinarCodigoDeSalida({
        total: 2,
        verificados: 1,
        faltantes: ["1/comodato.pdf"],
        desajustados: [],
        huerfanos: [],
      }),
    ).toBe(1);
    expect(
      determinarCodigoDeSalida({
        total: 2,
        verificados: 1,
        faltantes: [],
        desajustados: ["1/comodato.pdf"],
        huerfanos: ["9/comodato.pdf"],
      }),
    ).toBe(1);
  });
});
