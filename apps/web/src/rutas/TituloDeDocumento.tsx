import { useEffect } from "react";
import { Outlet, useMatches } from "react-router-dom";

import { tituloDeDocumento } from "./tituloDeDocumento";

/**
 * DESIGN.md D3 — the pathless root of `rutas`. Renders nothing of its own
 * but `<Outlet />`: its only job is reading every matched route's
 * `handle` through `useMatches()` and assigning `document.title` from the
 * deepest one that declares a string `titulo` (`tituloDeDocumento`, pure,
 * tested separately). One effect for the whole tree, instead of a
 * `usarTituloDeDocumento(titulo)` hook duplicated at every leaf.
 */
export function TituloDeDocumento() {
  const coincidencias = useMatches();

  useEffect(() => {
    document.title = tituloDeDocumento(coincidencias.map((coincidencia) => coincidencia.handle));
  }, [coincidencias]);

  return <Outlet />;
}
