import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { EsquemaDni } from "@contratos/esquemas";

/**
 * D1 smoke test (see DESIGN.md): this file exists to prove that
 * `@contratos/esquemas` — raw TypeScript, no build step, resolved through
 * the pnpm workspace symlink — survives a real `vite build`. The app shell,
 * providers and routing land in PR2.
 *
 * `EsquemaDni` is called, not just imported, so a real Zod schema from the
 * shared package actually runs inside the bundle rather than sitting as an
 * unused import a bundler could silently tree-shake away.
 */
function EstadoDelEsquema() {
  const resultado = EsquemaDni.safeParse("20304050607");
  return (
    <p>{resultado.success ? "Esquema compartido listo" : "Esquema compartido no disponible"}</p>
  );
}

const contenedor = document.getElementById("app");

if (contenedor) {
  createRoot(contenedor).render(
    <StrictMode>
      <EstadoDelEsquema />
    </StrictMode>,
  );
}
