import { createBrowserRouter } from "react-router-dom";

/**
 * Route-tree skeleton for this PR. `tecnico`-only routes, guards and the
 * oficina/admin landing (DESIGN.md D4, D10) land in PR5; this only proves
 * the router mounts and renders through the shared providers.
 */
export const enrutador = createBrowserRouter([
  {
    path: "/",
    element: "Visita en curso",
  },
]);
