/**
 * Regenerates the committed placeholder signature for the comodante.
 *
 *   pnpm --filter @contratos/api firmas:generar
 *
 * The output is byte-for-byte deterministic (see
 * `src/seed/placeholderSignaturePng.ts`), so re-running this must leave the
 * working tree clean. The unit suite asserts exactly that.
 */
import { writeFile } from "node:fs/promises";

import { buildPlaceholderSignaturePng } from "../../src/seed/placeholderSignaturePng";
import { COMODANTE_SIGNATURE_PNG_PATH } from "../../src/seed/seedContent";

const png = buildPlaceholderSignaturePng();
await writeFile(COMODANTE_SIGNATURE_PNG_PATH, png);

console.log(
  `Firma de prueba escrita en ${COMODANTE_SIGNATURE_PNG_PATH} (${png.length} bytes).`,
);
