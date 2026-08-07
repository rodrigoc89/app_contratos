import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * DESIGN.md D8, part 2 — reachability. Construction alone (D8 part 1:
 * `DatosBorradorLocal` mirrors `EsquemaCrearContrato`, which has no slot for
 * a signature) only protects the local-draft path; nothing else stops a
 * direct `localStorage`/`sessionStorage`/`indexedDB` call anywhere else in
 * the app. This test makes every storage-API call site a visible, reviewed
 * decision instead of an accident: only `almacenamiento/**` and a short
 * explicit allowlist may reference a storage API at all. Adding a call site
 * requires editing `PERMITIDOS` below — a visible diff, never silent.
 *
 * Brought forward from its originally planned PR8 slice: this PR
 * (`datos/sesion/almacenSesion.ts`, the refresh token's localStorage
 * persistence per D4) is the first to add a storage call site, so the guard
 * exists from the first line of code it needs to constrain, rather than
 * being written after the fact to fit an already-established allowlist.
 * Same shape as `packages/esquemas/src/paqueteNavegable.spec.ts` and
 * `componentes/convencionDeCapas.spec.ts`.
 */

const DIRECTORIO_SRC = dirname(fileURLToPath(import.meta.url));

/**
 * Modules outside `almacenamiento/**` allowed to touch a storage API
 * directly. `datos/dispositivo.ts` (the `dispositivoId`, D8/R8) joined this
 * list in PR14, when `firmar`'s device identifier was first built.
 */
const PERMITIDOS = new Set(["datos/sesion/almacenSesion.ts", "datos/dispositivo.ts"]);

/**
 * Matches actual API *usage* — `localStorage.getItem(...)`,
 * `sessionStorage["clave"]` — not the bare word inside a doc-comment
 * explaining the rule (several modules mention `localStorage` in prose,
 * e.g. `datos/sesion/estadoSesion.ts`'s rationale comment). Requiring a
 * following `.` or `[` is what tells usage apart from prose.
 */
const API_DE_ALMACENAMIENTO = /\b(?:localStorage|sessionStorage|indexedDB)\s*[.[]/;

function archivosFuente(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return archivosFuente(ruta);
    }
    const esFuente = /\.(ts|tsx)$/.test(nombre) && !nombre.includes(".spec.");
    return esFuente ? [{ ruta, contenido: readFileSync(ruta, "utf8") }] : [];
  });
}

describe("storage APIs stay confined to almacenamiento/** and an explicit allowlist", () => {
  it("finds source files, so a passing suite is not an empty one", () => {
    expect(archivosFuente(DIRECTORIO_SRC).length).toBeGreaterThan(3);
  });

  it("rejects a direct storage-API call outside the allowed set", () => {
    for (const { ruta, contenido } of archivosFuente(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      const enAlmacenamiento = rutaRelativa.startsWith("almacenamiento/");
      const enListaPermitida = PERMITIDOS.has(rutaRelativa);

      if (enAlmacenamiento || enListaPermitida) {
        continue;
      }

      expect(
        API_DE_ALMACENAMIENTO.test(contenido),
        `${rutaRelativa} usa una API de almacenamiento fuera de almacenamiento/** y de la lista permitida`,
      ).toBe(false);
    }
  });
});
