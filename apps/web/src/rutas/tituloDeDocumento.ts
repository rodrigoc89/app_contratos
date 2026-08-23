/**
 * DESIGN.md D3 — pure title composition: no React, no router, no DOM. The
 * per-route document title rides `RouteObject.handle`, read once by
 * `TituloDeDocumento` through `useMatches()`. `handle` is typed `unknown` by
 * react-router, so it is narrowed here with a type guard, never cast.
 */
export const NOMBRE_APP = "IES.NET Contratos";

/**
 * Suffixes a Spanish route label with the app name, `·`-separated — the
 * exact composition the per-route `document.title` requirement asserts.
 * Exported so a container that loads its title asynchronously (contract
 * number, `PaginaDetalleContrato`) can build the same suffix without
 * duplicating the separator or the app name.
 */
export function conSufijo(etiqueta: string): string {
  return `${etiqueta} · ${NOMBRE_APP}`;
}

interface ManejadorConTitulo {
  titulo: string;
}

function esManejadorConTitulo(manejador: unknown): manejador is ManejadorConTitulo {
  return (
    typeof manejador === "object" &&
    manejador !== null &&
    "titulo" in manejador &&
    typeof manejador.titulo === "string"
  );
}

/**
 * Deepest match wins: `manejadores` is `useMatches()`'s handles in match
 * order (root first, leaf last). Walking from the end returns the leaf's
 * own title before ever considering an ancestor's. A malformed handle
 * (non-object, or a `titulo` that isn't a string) is skipped, not thrown on
 * — a route with no opinion on its title must never crash the shell.
 */
export function tituloDeDocumento(manejadores: ReadonlyArray<unknown>): string {
  for (let indice = manejadores.length - 1; indice >= 0; indice -= 1) {
    const manejador = manejadores[indice];
    if (esManejadorConTitulo(manejador)) {
      return conSufijo(manejador.titulo);
    }
  }
  return NOMBRE_APP;
}
