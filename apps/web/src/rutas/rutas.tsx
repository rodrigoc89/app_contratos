import type { RouteObject } from "react-router-dom";

import { GuardiaDeRolTecnico, GuardiaDeSesion } from "../funcionalidades/auth/contenedores/GuardiasDeRuta";
import { InicioTecnico } from "../funcionalidades/auth/contenedores/InicioTecnico";
import { PaginaLogin } from "../funcionalidades/auth/contenedores/PaginaLogin";
import { PanelNoDisponible } from "../funcionalidades/auth/contenedores/PanelNoDisponible";

/**
 * The real route tree (DESIGN.md D4, D10), replacing PR2's placeholder.
 * Exported separately from `enrutador.tsx` so tests can mount it with
 * `createMemoryRouter` instead of the real browser history.
 */
export const rutas: RouteObject[] = [
  { path: "/login", element: <PaginaLogin /> },
  {
    element: <GuardiaDeSesion />,
    children: [
      { path: "/panel-no-disponible", element: <PanelNoDisponible /> },
      {
        element: <GuardiaDeRolTecnico />,
        children: [{ path: "/", element: <InicioTecnico /> }],
      },
    ],
  },
];
