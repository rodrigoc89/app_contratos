import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The guard that keeps this package importable from a Vite bundle.
 *
 * `tsconfig.json` sets `types: []` and a DOM-free `lib`, which stops *global*
 * Node and DOM types from leaking in — but it does **not** stop an explicit
 * `import { readFile } from "node:fs"`, because TypeScript resolves that
 * through `@types/node` regardless. Verified by trying it: `tsc --noEmit`
 * passes. So the rule needs a test rather than a compiler flag.
 *
 * This is the one file in the package that touches Node, and it does so as a
 * build-time check over the package's own sources — never as something the
 * shipped code depends on.
 */

const DIRECTORIO = dirname(fileURLToPath(import.meta.url));

/** Every module the package actually publishes — its own specs excluded. */
function fuentesPublicadas(): ReadonlyArray<{ nombre: string; contenido: string }> {
  return readdirSync(DIRECTORIO)
    .filter((nombre) => nombre.endsWith(".ts") && !nombre.endsWith(".spec.ts"))
    .map((nombre) => ({
      nombre,
      contenido: readFileSync(join(DIRECTORIO, nombre), "utf8"),
    }));
}

/** `import … from "x"` / `export … from "x"` / `import("x")`. */
const ESPECIFICADORES = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function especificadoresDe(contenido: string): string[] {
  return [...contenido.matchAll(ESPECIFICADORES)].flatMap((coincidencia) =>
    coincidencia[1] === undefined ? [] : [coincidencia[1]],
  );
}

describe("the package stays browser-safe", () => {
  it("finds its own sources, so a passing suite is not an empty one", () => {
    expect(fuentesPublicadas().length).toBeGreaterThan(3);
  });

  it("imports nothing but zod and its own relative modules", () => {
    for (const { nombre, contenido } of fuentesPublicadas()) {
      for (const especificador of especificadoresDe(contenido)) {
        const permitido =
          especificador === "zod" || especificador.startsWith("./");

        expect(
          permitido,
          `${nombre} importa "${especificador}", que no está disponible en el navegador`,
        ).toBe(true);
      }
    }
  });

  it("reads nothing from the process environment", () => {
    for (const { nombre, contenido } of fuentesPublicadas()) {
      expect(contenido, `${nombre} lee del entorno del proceso`).not.toMatch(
        /\bprocess\s*\.\s*env\b/,
      );
    }
  });

  it("uses no Node globals", () => {
    for (const { nombre, contenido } of fuentesPublicadas()) {
      expect(contenido, `${nombre} usa un global de Node`).not.toMatch(
        /\b(?:__dirname|__filename|Buffer\s*\.|require\s*\()/,
      );
    }
  });
});
