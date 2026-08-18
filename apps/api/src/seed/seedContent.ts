import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../shared/domain/FechaCalendario";

/**
 * The contract text and the comodante signature, as committed files.
 *
 * The legal text lives in `prisma/plantillas/*.html` rather than inside a
 * TypeScript string for two reasons: it is eight kilobytes of clauses a
 * non-programmer may one day have to proof-read, and keeping it in its own
 * file makes a change to the wording visible as a diff of the wording, not as
 * a diff of a template literal.
 */

const RAIZ_API = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRECTORIO_PLANTILLAS = join(RAIZ_API, "prisma", "plantillas");
const DIRECTORIO_FIRMAS = join(RAIZ_API, "prisma", "firmas");

export const CONDICIONES_GENERALES_HTML_PATH = join(
  DIRECTORIO_PLANTILLAS,
  "v1-condiciones-generales.html",
);

export const COMODATO_HTML_PATH = join(
  DIRECTORIO_PLANTILLAS,
  "v1-comodato.html",
);

/**
 * The comodante's real handwritten signature, extracted from a 300 dpi scan:
 * black ink on transparency, cropped to the stroke and padded to the 3.5:1 box
 * `.firma-imagen` draws it in.
 *
 * This file is a private individual's signature. It stays in this repository
 * only because the repository is private, and it must never be copied into the
 * web bundle or any publicly readable storage — see `FirmanteComodante`, which
 * refuses to serialise the image for that reason.
 */
export const COMODANTE_SIGNATURE_PNG_PATH = join(
  DIRECTORIO_FIRMAS,
  "comodante-v1.png",
);

/**
 * The generated "FIRMA DE PRUEBA / NO VALIDA" image.
 *
 * Kept after the real signature landed so local development and demos can seed
 * a database without stamping a real person's handwriting onto throwaway
 * contracts. Using it means pointing `SIGNATORY_VERSION` back at
 * `PROVISIONAL_SIGNATORY_VERSION`, which `seedDatabase` refuses in production.
 */
export const PLACEHOLDER_SIGNATURE_PNG_PATH = join(
  DIRECTORIO_FIRMAS,
  "comodante-v0-prueba.png",
);

/**
 * Version of the contract text this seed publishes.
 *
 * Template versions are never edited, only superseded: changing a price in the
 * legal text means a new file, a new version string and a new `vigenteDesde`,
 * so contracts already signed keep rendering the wording they were signed
 * against.
 */
export const TEMPLATE_VERSION = "v1";
export const TEMPLATE_ID = "plantilla-contrato-v1";
/** Calendar date this version starts being the one in force. */
export const TEMPLATE_VALID_FROM = "2026-08-01";

/**
 * The version string that marks a signatory carrying the fake signature.
 *
 * It is deliberately not `v1`: every contract stores the signatory version it
 * was signed with, so if a test-signed contract ever reaches a real customer,
 * one query over `firmante_id` finds every affected contract for good.
 */
export const PROVISIONAL_SIGNATORY_VERSION = "v0-prueba";

/**
 * The signatory this seed publishes. The real signature was handed over and
 * loaded in August 2026, so this is no longer the provisional one.
 *
 * Still typed as `string` rather than as the literal: the production guard in
 * `seedDatabase` compares it against `PROVISIONAL_SIGNATORY_VERSION`, and
 * narrowing it to `"v1"` would make that comparison a type error instead of a
 * runtime check — silently deleting the guard the day someone points this back
 * at the placeholder.
 */
export const SIGNATORY_VERSION: string = "v1";
export const SIGNATORY_ID = "firmante-comodante-v1";
export const SIGNATORY_FULL_NAME = "SIEIRA GUILLERMO FEDERICO";
export const SIGNATORY_DNI = "27.582.030";

const PREFIJO_PNG = "data:image/png;base64,";

export interface SeedContent {
  readonly plantilla: PlantillaContrato;
  readonly firmante: FirmanteComodante;
}

export async function readComodanteSignaturePng(): Promise<Buffer> {
  return await readFile(COMODANTE_SIGNATURE_PNG_PATH);
}

/**
 * The signature as the templates consume it: a `data:` URI, because
 * `valoresDePlantilla()` hands the placeholder straight to `src="…"` and the
 * renderer is never allowed to fetch anything.
 */
export async function readComodanteSignatureDataUri(): Promise<string> {
  const png = await readComodanteSignaturePng();
  return PREFIJO_PNG + png.toString("base64");
}

/**
 * Reads the committed files and builds the domain entities from them.
 *
 * Going through `PlantillaContrato.crear` and `FirmanteComodante.crear` is the
 * point: an empty template file or a malformed DNI has to fail here, before a
 * row exists, rather than the first time a technician tries to sign.
 */
export async function buildSeedContent(): Promise<SeedContent> {
  const [condicionesGeneralesHtml, comodatoHtml, imagenFirmaPng] =
    await Promise.all([
      readFile(CONDICIONES_GENERALES_HTML_PATH, "utf8"),
      readFile(COMODATO_HTML_PATH, "utf8"),
      readComodanteSignatureDataUri(),
    ]);

  return {
    plantilla: PlantillaContrato.crear({
      id: TEMPLATE_ID,
      version: TEMPLATE_VERSION,
      condicionesGeneralesHtml,
      comodatoHtml,
      vigenteDesde: FechaCalendario.desdeIso(TEMPLATE_VALID_FROM),
    }),
    firmante: FirmanteComodante.crear({
      id: SIGNATORY_ID,
      version: SIGNATORY_VERSION,
      nombreCompleto: SIGNATORY_FULL_NAME,
      dni: SIGNATORY_DNI,
      imagenFirmaPng,
    }),
  };
}
