/**
 * Driver for the render verdict (design.md D2): renders a real probe
 * document through the real `GeneradorDeDocumentosPuppeteer`, runs
 * `fc-match`, `pdffonts` and `pdftotext` against the produced PDF, and feeds
 * their stdout to the pure parser in `renderVerdict.ts`.
 *
 *   pnpm --filter @contratos/api verify:render
 *
 * `fc-match`, `pdffonts` and `pdftotext` are NOT project dependencies — the
 * same "opportunistic system tool" status `pdftotext` already has in
 * `GeneradorDeDocumentosPuppeteer.integration.spec.ts`. A tool missing on
 * PATH is reported plainly as a failed layer; it is never silently skipped
 * and its stdout is never faked. Package presence (`dpkg -l`) is never a
 * substitute check — only actually running the tool against the actually
 * produced PDF counts.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { FirmanteComodante } from "../src/firmantes/domain/FirmanteComodante";
import { FechaCalendario } from "../src/shared/domain/FechaCalendario";
import type { EntradaGeneracion } from "../src/contratos/application/ports/GeneradorDeDocumentos";
import { Comodatario } from "../src/contratos/domain/Comodatario";
import { Equipos } from "../src/contratos/domain/Equipos";
import {
  FirmaCapturada,
  type TipoDocumentoFirmado,
} from "../src/contratos/domain/FirmaCapturada";
import { Plazo } from "../src/contratos/domain/Plazo";
import { AlmacenDeDocumentosEnDisco } from "../src/contratos/infrastructure/AlmacenDeDocumentosEnDisco";
import { GeneradorDeDocumentosPuppeteer } from "../src/contratos/infrastructure/GeneradorDeDocumentosPuppeteer";
import { buildSeedContent } from "../src/seed/seedContent";
import {
  REQUESTED_FONT_FAMILIES,
  buildRenderVerdict,
  evaluateFamilyResolution,
  evaluateGlyphEmbedding,
  evaluateTextRoundTrip,
  type LayerVerdict,
  type RenderVerdict,
  type RenderVerdictLayer,
} from "./renderVerdict";

const execFileAsync = promisify(execFile);

export interface ResultadoVerificarRender {
  readonly verdicto: RenderVerdict;
  /** Command names of every tool this run could not find on PATH. */
  readonly herramientasFaltantes: readonly string[];
}

/**
 * Renders the probe document, runs the three tools (skipping only the ones
 * genuinely absent from PATH) and returns the aggregate verdict. Always
 * cleans up its temp directory and closes the browser it launched, whether
 * it succeeds or throws.
 */
export async function verificarRender(): Promise<ResultadoVerificarRender> {
  const sonda = await renderizarDocumentoDeSonda();

  try {
    const herramientasFaltantes: string[] = [];
    const layers: LayerVerdict[] = [];

    const fcMatchDisponible = await esHerramientaDisponible("fc-match", [
      "-V",
    ]);
    if (fcMatchDisponible) {
      const resultados = await Promise.all(
        REQUESTED_FONT_FAMILIES.map(async (family) => ({
          family,
          stdout: await fcMatchStdout(family.primary),
        })),
      );
      layers.push(evaluateFamilyResolution(resultados));
    } else {
      herramientasFaltantes.push("fc-match");
      layers.push(veredictoHerramientaFaltante("family-resolution", "fc-match"));
    }

    const pdffontsDisponible = await esHerramientaDisponible("pdffonts", [
      "-v",
    ]);
    if (pdffontsDisponible) {
      const { stdout } = await execFileAsync("pdffonts", [
        sonda.rutaPdfAbsoluta,
      ]);
      layers.push(evaluateGlyphEmbedding(stdout));
    } else {
      herramientasFaltantes.push("pdffonts");
      layers.push(veredictoHerramientaFaltante("glyph-embedding", "pdffonts"));
    }

    const pdftotextDisponible = await esHerramientaDisponible("pdftotext", [
      "-v",
    ]);
    if (pdftotextDisponible) {
      const { stdout } = await execFileAsync("pdftotext", [
        sonda.rutaPdfAbsoluta,
        "-",
      ]);
      layers.push(evaluateTextRoundTrip(stdout));
    } else {
      herramientasFaltantes.push("pdftotext");
      layers.push(
        veredictoHerramientaFaltante("text-round-trip", "pdftotext"),
      );
    }

    return {
      verdicto: buildRenderVerdict(layers),
      herramientasFaltantes,
    };
  } finally {
    await sonda.limpiar();
  }
}

async function fcMatchStdout(family: string): Promise<string> {
  // `-f '%{family}\n'` prints the resolved family alone — verified live on
  // the implementing machine — instead of the default human-readable
  // `<file>: "<family>" "<style>"` form, which would need its own
  // quote-parsing regex for no benefit.
  const { stdout } = await execFileAsync("fc-match", [
    "-f",
    "%{family}\n",
    family,
  ]);
  return stdout;
}

async function esHerramientaDisponible(
  comando: string,
  argumentos: readonly string[],
): Promise<boolean> {
  try {
    await execFileAsync(comando, [...argumentos]);
    return true;
  } catch (error) {
    // ENOENT is "no such binary on PATH". Any other failure (a usage error
    // from the version flag, a non-zero exit) still proves the binary
    // exists, which is all this check needs to know.
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function veredictoHerramientaFaltante(
  layer: RenderVerdictLayer,
  comando: string,
): LayerVerdict {
  return {
    layer,
    pass: false,
    reason: `"${comando}" is not installed on PATH — this layer could not be evaluated on this host.`,
  };
}

// ── Probe document ───────────────────────────────────────────────────────

interface ResultadoDeSonda {
  readonly rutaPdfAbsoluta: string;
  readonly limpiar: () => Promise<void>;
}

/**
 * Synthetic 1x1 red PNG — the same fixture
 * `GeneradorDeDocumentosPuppeteer.integration.spec.ts` uses. Never a real
 * signature, so a probe render never touches real personal data even though
 * it runs the same code path a real signing does.
 */
const FIRMA_DE_SONDA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Never a real contract number — this document is never stored anywhere. */
const NUMERO_DE_SONDA = 900_000_001;

const DOCUMENTOS_A_FIRMAR: readonly TipoDocumentoFirmado[] = [
  "condiciones_generales",
  "comodato",
];

/**
 * Renders one probe contract through the real template content
 * (`buildSeedContent()` reads the actual committed `.html` files this render
 * verdict exists to check) with synthetic, clearly-not-real customer data,
 * and returns the absolute path to the produced `comodato.pdf` plus a
 * cleanup callback.
 */
async function renderizarDocumentoDeSonda(): Promise<ResultadoDeSonda> {
  const { plantilla } = await buildSeedContent();
  const raiz = await mkdtemp(join(tmpdir(), "verificar-render-"));
  const almacen = new AlmacenDeDocumentosEnDisco(raiz);
  const generador = new GeneradorDeDocumentosPuppeteer({ almacen });

  const limpiar = async (): Promise<void> => {
    await generador.cerrar();
    await rm(raiz, { recursive: true, force: true });
  };

  try {
    const fecha = FechaCalendario.desdeIso("2026-01-01");
    // 14 points, matching MINIMO_PUNTOS_FIRMA — the probe never captures a
    // real signature, only enough synthetic stroke data to pass validation.
    const trazoDeSonda = Array.from({ length: 14 }, (_, i) => ({
      x: i,
      y: i,
      t: i * 16,
    }));

    const entrada: EntradaGeneracion = {
      numero: NUMERO_DE_SONDA,
      fechaFirma: fecha,
      plazo: Plazo.estandarDesde(fecha),
      comodatario: Comodatario.crear({
        // Deliberately not a real name — this string exists only to carry
        // every character layer 3 must prove survives the ToUnicode map:
        // lowercase and uppercase "ñ", plus "á é í ó ú" (design.md D2).
        nombreCompleto: "SONDA DE VERIFICACIÓN DE RENDER — áéíóú Ññ",
        dni: "00.000.000",
        domicilioCalle: "Sin domicilio (sonda de verificación)",
        ciudad: "La Banda",
        whatsapp: "3854000000",
      }),
      equipos: Equipos.crear({
        antenaModelo: "SONDA",
        antenaMac: "000000000000",
        poe: true,
        canoMetros: 1,
      }),
      firmas: DOCUMENTOS_A_FIRMAR.map((documento) =>
        FirmaCapturada.crear({
          documento,
          imagenPng: FIRMA_DE_SONDA,
          trazos: [trazoDeSonda],
        }),
      ),
      plantilla,
      firmante: FirmanteComodante.crear({
        id: "firmante-sonda-verificar-render",
        version: "sonda-verificar-render",
        nombreCompleto: "SONDA DE VERIFICACIÓN",
        dni: "00.000.000",
        imagenFirmaPng: FIRMA_DE_SONDA,
      }),
    };

    const documentos = await generador.generar(entrada);
    const comodato = documentos.find((doc) => doc.documento === "comodato");
    if (comodato === undefined) {
      throw new Error(
        "El render de sonda no produjo el documento 'comodato'.",
      );
    }

    return {
      rutaPdfAbsoluta: join(raiz, comodato.ruta),
      limpiar,
    };
  } catch (error) {
    await limpiar();
    throw error;
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────

const NOMBRE_DE_CAPA: Readonly<Record<RenderVerdictLayer, string>> = {
  "family-resolution": "resolución de familia (fc-match)",
  "glyph-embedding": "incrustación de glifos (pdffonts)",
  "text-round-trip": "ida y vuelta de texto (pdftotext)",
};

function imprimirResultado(resultado: ResultadoVerificarRender): void {
  console.log("=== Verificación de render (design.md D2) ===");

  for (const capa of resultado.verdicto.layers) {
    const estado = capa.pass ? "APROBADA" : "RECHAZADA";
    console.log(`Capa "${NOMBRE_DE_CAPA[capa.layer]}": ${estado}`);
    console.log(`  ${capa.reason}`);
  }

  if (resultado.herramientasFaltantes.length > 0) {
    console.log(
      `Herramientas no encontradas en PATH: ${resultado.herramientasFaltantes.join(", ")}. La capa correspondiente no pudo evaluarse en este host.`,
    );
  }

  console.log(
    `Veredicto final: ${resultado.verdicto.pass ? "APROBADO" : "RECHAZADO"}`,
  );
}

// Only run as a CLI entry point — importing the function above for a test
// must not also launch a real browser as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const resultado = await verificarRender();
    imprimirResultado(resultado);

    if (!resultado.verdicto.pass) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("La verificación de render falló con un error inesperado:");
    console.error(error);
    process.exitCode = 1;
  }
}
