/**
 * Mechanically proves a restore actually reconstructs what
 * `deploy/backup.sh` backed up (design.md D7): streams every
 * `contrato_documentos` row's file and compares its real sha256 against the
 * lowercase-hex hash the row already carries (schema.prisma:279, computed
 * server-side when the PDF was sealed). A backup nobody has ever restored is
 * a belief, not a backup — this turns the belief into a fact.
 *
 *   pnpm --filter @contratos/api verify:restore
 *
 * Called by `deploy/verify-restore.sh` after `deploy/restore.sh` (task 9.2)
 * restores a backup into a SCRATCH database and document directory — never
 * against production.
 *
 * Streams deliberately, on both axes a real archive is large on:
 *   - rows: paginated with keyset pagination (`cursor`/`id`), never a single
 *     `findMany()` of every document row at once — same reason
 *     `prisma/backfill/nombreDeBusqueda.ts` pages instead of loading
 *     everything.
 *   - files: each PDF is piped into the hash through a readable stream
 *     (`createReadStream` → `pipeline` → a `crypto.Hash`), never read whole
 *     into memory with `readFile`. Chromium-rendered contract PDFs are not
 *     tiny, and a real archive is not small — a verifier that reads every
 *     file whole would OOM on exactly the archive it exists to verify.
 *
 * `total`, `faltantes`, `desajustados`, `huerfanos` mirror design.md D7's
 * `ReporteDeRestauracion` interface exactly:
 *   - `faltantes`   — a row exists, its file is absent on disk  → fails.
 *   - `desajustados`— a file exists, its real sha256 differs    → fails.
 *   - `huerfanos`   — a file exists, no row references it       → warns
 *     only. `deploy/backup.sh` dumps the database BEFORE copying the PDF
 *     tree specifically so a race can only ever produce this outcome, never
 *     a missing row (task 8.2) — punishing it as a failure would punish the
 *     safe direction the backup was designed to take.
 *   - `total === 0` — nothing was checked at all → fails outright. A
 *     verifier that checks zero documents and exits 0 is worse than no
 *     verifier: it produces a green light nobody earned.
 *
 * Follows `prisma/backfill/nombreDeBusqueda.ts`'s established shape:
 * exported pure function(s) plus a thin `jiti` CLI entry point.
 */
// Prisma 7 no longer loads .env files automatically, and neither does Node.
// Same explicit load as prisma/seed.ts, prisma/backfill/nombreDeBusqueda.ts
// and prisma.config.ts, for the same reason.
import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import { crearPrismaClient } from "../../src/shared/infrastructure/persistence/prismaClient";

/** Keeps one page's memory footprint small, same rationale as the backfill script's `TAMANO_DE_PAGINA`. */
const TAMANO_DE_PAGINA = 200;

export interface ReporteDeRestauracion {
  readonly total: number;
  readonly verificados: number;
  readonly faltantes: readonly string[];
  readonly desajustados: readonly string[];
  readonly huerfanos: readonly string[];
}

interface FilaDeDocumento {
  readonly id: string;
  readonly ruta: string;
  readonly sha256: string;
}

/** The narrow slice of `PrismaClient` this module actually needs — real client in production, same instance the CLI entry point below builds. */
export interface ClientePrismaParaRestauracion {
  documentoContrato: {
    findMany(args: {
      take: number;
      skip?: number;
      cursor?: { id: string };
      orderBy: { id: "asc" };
      select: { id: true; ruta: true; sha256: true };
    }): Promise<FilaDeDocumento[]>;
  };
}

/** Pages through every `contrato_documentos` row, oldest id first, never loading the whole table into memory at once. */
async function* iterarDocumentos(
  prisma: ClientePrismaParaRestauracion,
): AsyncGenerator<FilaDeDocumento> {
  let cursorId: string | undefined;

  for (;;) {
    const filas = await prisma.documentoContrato.findMany({
      take: TAMANO_DE_PAGINA,
      ...(cursorId !== undefined ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, ruta: true, sha256: true },
    });

    if (filas.length === 0) {
      return;
    }

    for (const fila of filas) {
      yield fila;
    }

    cursorId = filas[filas.length - 1]!.id;

    if (filas.length < TAMANO_DE_PAGINA) {
      return;
    }
  }
}

/** Streams a file's bytes through sha256 — never reads it whole into memory. */
async function hashearArchivo(rutaAbsoluta: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(rutaAbsoluta), hash);
  return hash.digest("hex");
}

type ResultadoDeArchivo = "verificado" | "faltante" | "desajustado";

async function verificarArchivo(
  rutaAbsoluta: string,
  sha256Esperado: string,
): Promise<ResultadoDeArchivo> {
  let sha256Real: string;
  try {
    sha256Real = await hashearArchivo(rutaAbsoluta);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "faltante";
    }
    throw error;
  }
  return sha256Real.toLowerCase() === sha256Esperado.toLowerCase()
    ? "verificado"
    : "desajustado";
}

/** Every relative file path actually present under the document store, forward-slash-normalised so it compares directly against a `ruta` column value (`${numero}/${documento}.pdf`, always forward slashes). Lightweight: only filenames are read, never file contents — the store can hold a real archive's worth of files without this pass costing meaningful memory. */
async function listarArchivosDelAlmacen(
  directorioAlmacen: string,
): Promise<Set<string>> {
  let entradas: string[];
  try {
    entradas = await readdir(directorioAlmacen, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Set();
    }
    throw error;
  }

  const archivos = new Set<string>();
  for (const entrada of entradas) {
    const absoluta = join(directorioAlmacen, entrada);
    const info = await stat(absoluta);
    if (info.isFile()) {
      archivos.add(relative(directorioAlmacen, absoluta).split(sep).join("/"));
    }
  }
  return archivos;
}

/**
 * Exported so an integration test can drive the exact same routine the CLI
 * entry point below runs, matching `ejecutarBackfillDeNombreDeBusqueda`'s
 * convention.
 */
export async function ejecutarVerificacionDeRestauracion(
  prisma: ClientePrismaParaRestauracion,
  directorioAlmacen: string,
): Promise<ReporteDeRestauracion> {
  const rutasConocidas = new Set<string>();
  let total = 0;
  let verificados = 0;
  const faltantes: string[] = [];
  const desajustados: string[] = [];

  for await (const fila of iterarDocumentos(prisma)) {
    total += 1;
    const rutaNormalizada = fila.ruta.split(sep).join("/");
    rutasConocidas.add(rutaNormalizada);

    const resultado = await verificarArchivo(
      join(directorioAlmacen, fila.ruta),
      fila.sha256,
    );

    if (resultado === "faltante") {
      faltantes.push(fila.ruta);
    } else if (resultado === "desajustado") {
      desajustados.push(fila.ruta);
    } else {
      verificados += 1;
    }
  }

  const archivosEnDisco = await listarArchivosDelAlmacen(directorioAlmacen);
  const huerfanos = [...archivosEnDisco]
    .filter((ruta) => !rutasConocidas.has(ruta))
    .sort();

  return { total, verificados, faltantes, desajustados, huerfanos };
}

/**
 * `faltantes` and `desajustados` fail the drill (task 9.3): a restore that
 * cannot mechanically prove a document survived did not survive.
 * `huerfanos` alone never fails it (task 8.2's safe-orphan property).
 * `total === 0` fails it outright, even with no other findings — a drill
 * that verified nothing must not report success.
 */
export function determinarCodigoDeSalida(reporte: ReporteDeRestauracion): 0 | 1 {
  if (reporte.total === 0) {
    return 1;
  }
  if (reporte.faltantes.length > 0 || reporte.desajustados.length > 0) {
    return 1;
  }
  return 0;
}

// ── CLI entry point ──────────────────────────────────────────────────────

function imprimirReporte(reporte: ReporteDeRestauracion): void {
  console.log("=== Verificación de restauración (design.md D7) ===");
  console.log(`Documentos verificados: ${reporte.total} totales, ${reporte.verificados} coinciden con su sha256.`);

  if (reporte.faltantes.length > 0) {
    console.log(`Faltantes (fila sin archivo): ${reporte.faltantes.length}`);
    for (const ruta of reporte.faltantes) {
      console.log(`  - ${ruta}`);
    }
  }

  if (reporte.desajustados.length > 0) {
    console.log(`Desajustados (archivo con sha256 distinto al esperado): ${reporte.desajustados.length}`);
    for (const ruta of reporte.desajustados) {
      console.log(`  - ${ruta}`);
    }
  }

  if (reporte.huerfanos.length > 0) {
    console.log(
      `ATENCIÓN: ${reporte.huerfanos.length} archivo(s) huérfano(s) (sin fila que los referencie) — solo advertencia, no hace fallar la restauración (design.md D7: dump antes que copia, la única carrera posible es un huérfano inofensivo):`,
    );
    for (const ruta of reporte.huerfanos) {
      console.log(`  - ${ruta}`);
    }
  }

  if (reporte.total === 0) {
    console.log(
      "ATENCIÓN: no se verificó ningún documento — un simulacro que no verifica nada no puede reportar éxito.",
    );
  }
}

// Only run as a CLI entry point — importing the exports above for a test
// must not also connect to whatever DATABASE_URL the test process happens
// to have.
if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = crearPrismaClient();
  const directorioAlmacen = process.env.ALMACEN_DOCUMENTOS_RUTA ?? "var/documentos";

  try {
    const reporte = await ejecutarVerificacionDeRestauracion(prisma, directorioAlmacen);
    imprimirReporte(reporte);
    process.exitCode = determinarCodigoDeSalida(reporte);
  } finally {
    await prisma.$disconnect();
  }
}
