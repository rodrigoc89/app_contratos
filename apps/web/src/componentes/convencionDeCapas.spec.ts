import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Enforces DESIGN.md D10's container/presentational split: nothing under
 * `componentes/` may import `datos/`, `@tanstack/react-query` or
 * `almacenamiento/`. Presentational components take props and emit
 * callbacks; containers live in `funcionalidades/*\/contenedores/` and own
 * the data layer.
 *
 * Same shape as `packages/esquemas/src/paqueteNavegable.spec.ts`: the rule
 * is enforced by a test over the real files, not left as an intention. An
 * empty `componentes/` tree passes trivially — the loop below has nothing
 * to iterate — so this stays green from the moment it is written.
 */

const DIRECTORIO = dirname(fileURLToPath(import.meta.url));
const PROHIBIDOS = ["datos/", "@tanstack/react-query", "almacenamiento/"];
const ESPECIFICADORES = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

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

function especificadoresDe(contenido: string): string[] {
  return [...contenido.matchAll(ESPECIFICADORES)].flatMap((coincidencia) =>
    coincidencia[1] === undefined ? [] : [coincidencia[1]],
  );
}

describe("componentes/ stays presentational", () => {
  it("imports neither the data layer, the query client library, nor local storage utilities", () => {
    for (const { ruta, contenido } of archivosFuente(DIRECTORIO)) {
      for (const especificador of especificadoresDe(contenido)) {
        const prohibido = PROHIBIDOS.some((patron) => especificador.includes(patron));
        expect(prohibido, `${ruta} importa "${especificador}", prohibido bajo componentes/`).toBe(
          false,
        );
      }
    }
  });
});
