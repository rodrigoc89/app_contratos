import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design-system-migration PR2 (design.md's File Changes table, "LayoutTablet
 * rename → LayoutTecnico"). `LayoutTecnico` names the técnico role rather
 * than the device, pairing with its existing sibling `LayoutPanel` — see
 * `docs/sdd/contract-list-search/design.md` D13, the prior art for why the
 * device name was the problem in the first place.
 *
 * This guard is the rename's own safety net, independent of `pnpm typecheck`
 * (which only catches a missed *importer*, not a stray filename, class
 * token, or comment reference): no file under `src` may contain the literal
 * identifier `LayoutTablet` or its CSS class token `layout-tablet`, and no
 * filename may contain `LayoutTablet` either. Same recursive-walk shape as
 * `convencionDeAlmacenamiento.spec.ts` and `componentes/convencionDeCapas.spec.ts`.
 *
 * Scoped to `apps/web/src` only — this guard does not, and must not, reach
 * `docs/sdd/**`: those are historical records of an already-archived change
 * and are not rewritten by this migration.
 */

const DIRECTORIO_SRC = dirname(fileURLToPath(import.meta.url));
/** This guard's own path — necessarily names the banned string in its prose
 *  and regex source, so it must exclude itself from the scan below. */
const RUTA_PROPIA = fileURLToPath(import.meta.url);

const IDENTIFICADOR_LAYOUT_TABLET = /LayoutTablet\b/;
const TOKEN_CLASE_LAYOUT_TABLET = /layout-tablet\b/;

function archivosFuente(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return archivosFuente(ruta);
    }
    return [{ ruta, contenido: readFileSync(ruta, "utf8") }];
  });
}

describe("no LayoutTablet identifier, class token, or filename remains under src", () => {
  it("finds source files, so a passing suite is not an empty one", () => {
    expect(archivosFuente(DIRECTORIO_SRC).length).toBeGreaterThan(3);
  });

  it("rejects any filename containing LayoutTablet", () => {
    for (const { ruta } of archivosFuente(DIRECTORIO_SRC)) {
      if (ruta === RUTA_PROPIA) continue;
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");

      expect(rutaRelativa.includes("LayoutTablet"), `${rutaRelativa} still names LayoutTablet`).toBe(false);
    }
  });

  it("rejects the LayoutTablet identifier and its layout-tablet class token in any file", () => {
    for (const { ruta, contenido } of archivosFuente(DIRECTORIO_SRC)) {
      if (ruta === RUTA_PROPIA) continue;
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");

      expect(
        IDENTIFICADOR_LAYOUT_TABLET.test(contenido),
        `${rutaRelativa} still references the LayoutTablet identifier`,
      ).toBe(false);
      expect(
        TOKEN_CLASE_LAYOUT_TABLET.test(contenido),
        `${rutaRelativa} still references the layout-tablet class token`,
      ).toBe(false);
    }
  });
});
