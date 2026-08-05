import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * `pdftotext` (poppler-utils) is not a project dependency — it is only used
 * here, opportunistically, to give the font/glyph check real teeth instead of
 * just "the PDF is non-trivially large". Skips itself where the binary is
 * missing (e.g. a stripped-down CI image) rather than failing the suite over
 * tooling this project does not otherwise need.
 */
async function tienePdftotext(): Promise<boolean> {
  try {
    await execFileAsync("pdftotext", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

import { FirmanteComodante } from "../../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { EntradaGeneracion } from "../application/ports/GeneradorDeDocumentos";
import { Comodatario } from "../domain/Comodatario";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada, type TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { Plazo } from "../domain/Plazo";
import { AlmacenDeDocumentosEnDisco } from "./AlmacenDeDocumentosEnDisco";
import { GeneradorDeDocumentosPuppeteer } from "./GeneradorDeDocumentosPuppeteer";

/** A real, valid 1x1 red PNG — small enough to inline, decodable by Chromium. */
const FIRMA_PNG_VALIDA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Deliberately corrupt base64 — Chromium's `decode()` must reject this. */
const FIRMA_PNG_CORRUPTA = "data:image/png;base64,AAAAAAAA";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");

const firmaDe = (documento: TipoDocumentoFirmado, imagen: string) =>
  FirmaCapturada.crear({
    documento,
    imagenPng: imagen,
    trazos: [Array.from({ length: 14 }, (_, i) => ({ x: i, y: i, t: i * 16 }))],
  });

function entrada(sobreescribir: Partial<EntradaGeneracion> = {}): EntradaGeneracion {
  return {
    numero: 2026001,
    fechaFirma: FIRMA,
    plazo: Plazo.estandarDesde(FIRMA),
    comodatario: Comodatario.crear({
      nombreCompleto: "Juan Carlos Pérez Ñáñez",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250 & Ruta 9",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
    firmas: [
      firmaDe("condiciones_generales", FIRMA_PNG_VALIDA),
      firmaDe("comodato", FIRMA_PNG_VALIDA),
    ],
    plantilla: PlantillaContrato.crear({
      id: "plantilla-2026-01",
      version: "2026-01",
      condicionesGeneralesHtml: [
        "<html><body>",
        "<h1>CONDICIONES GENERALES DE USO Nº {{numero}}</h1>",
        "<p>{{comodatarioNombre}} — DNI {{comodatarioDni}}</p>",
        "<p>Domicilio: {{comodatarioDomicilio}}, {{comodatarioCiudad}}, {{comodatarioProvincia}}</p>",
        '<img src="{{firmaComodatarioCondiciones}}" width="120">',
        "</body></html>",
      ].join(""),
      comodatoHtml: [
        "<html><body>",
        "<h1>CONTRATO DE COMODATO Nº {{numero}}</h1>",
        "<p>ANTENA {{antenaModelo}} MAC {{antenaMac}} POE {{poe}} CAÑO {{canoMetros}}m</p>",
        "<p>Plazo {{plazoMeses}} meses desde {{fechaInicio}} hasta {{fechaVencimiento}}</p>",
        '<img src="{{firmaComodante}}" width="120">',
        '<img src="{{firmaComodatarioComodato}}" width="120">',
        "</body></html>",
      ].join(""),
      vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
    }),
    firmante: FirmanteComodante.crear({
      id: "firmante-sieira-v1",
      version: "v1",
      nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
      dni: "27.582.030",
      imagenFirmaPng: FIRMA_PNG_VALIDA,
    }),
    ...sobreescribir,
  };
}

describe("GeneradorDeDocumentosPuppeteer (integration, real Chromium)", () => {
  let raiz: string;
  let almacen: AlmacenDeDocumentosEnDisco;
  let generador: GeneradorDeDocumentosPuppeteer;
  let conPdftotext: boolean;

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), "documentos-contrato-"));
    almacen = new AlmacenDeDocumentosEnDisco(raiz);
    generador = new GeneradorDeDocumentosPuppeteer({ almacen });
    conPdftotext = await tienePdftotext();
  });

  afterAll(async () => {
    await generador.cerrar();
    await rm(raiz, { recursive: true, force: true });
  });

  it("renders both real PDFs, hashed and stored under paths relative to the store", async () => {
    const documentos = await generador.generar(entrada({ numero: 2026001 }));

    expect(documentos).toHaveLength(2);
    expect(documentos.map((d) => d.documento).sort()).toEqual([
      "comodato",
      "condiciones_generales",
    ]);

    for (const documento of documentos) {
      // Relative to the store, never absolute, never escaping it.
      expect(documento.ruta.startsWith("/")).toBe(false);
      expect(documento.ruta).not.toContain("..");
      expect(documento.ruta).toBe(`2026001/${documento.documento}.pdf`);

      const rutaEnDisco = join(raiz, documento.ruta);
      const bytes = await readFile(rutaEnDisco);

      // A real PDF file, actually on disk.
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(500);

      // The returned hash matches what the bytes on disk hash to right now —
      // not what the HTML would have hashed to, the finished file.
      const hashRecalculado = createHash("sha256").update(bytes).digest("hex");
      expect(documento.sha256).toBe(hashRecalculado);
      expect(documento.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("renders Spanish accented text so it can be extracted back, proving real glyphs were drawn (not missing-font boxes)", async () => {
    const documentos = await generador.generar(entrada({ numero: 2026002 }));
    if (!conPdftotext) {
      // Environment has no poppler-utils; the font/fallback investigation
      // for this was done manually (see report) instead of in-suite.
      return;
    }

    const condiciones = documentos.find(
      (d) => d.documento === "condiciones_generales",
    );
    expect(condiciones).toBeDefined();

    const rutaEnDisco = join(raiz, condiciones!.ruta);
    const { stdout } = await execFileAsync("pdftotext", [rutaEnDisco, "-"]);

    expect(stdout).toContain("Juan Carlos Pérez Ñáñez");
    expect(stdout).toContain("DNI 30.123.456");
  });

  it("rejects, and writes nothing to the store, when a signature image is corrupt", async () => {
    const numero = 2026099;

    await expect(
      generador.generar(
        entrada({
          numero,
          firmas: [
            firmaDe("condiciones_generales", FIRMA_PNG_CORRUPTA),
            firmaDe("comodato", FIRMA_PNG_VALIDA),
          ],
        }),
      ),
    ).rejects.toThrow();

    await expect(readFile(join(raiz, `${numero}/comodato.pdf`))).rejects.toThrow();
    await expect(
      readFile(join(raiz, `${numero}/condiciones_generales.pdf`)),
    ).rejects.toThrow();
  });

  it("reuses the same browser for a second, independent contract", async () => {
    const documentos = await generador.generar(entrada({ numero: 2026003 }));
    expect(documentos).toHaveLength(2);
  });
});
