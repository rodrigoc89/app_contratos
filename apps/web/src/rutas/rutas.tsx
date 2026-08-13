import type { RouteObject } from "react-router-dom";

import { LayoutPanel } from "../componentes/plantillas/LayoutPanel";
import { CabeceraDeSesion } from "../funcionalidades/auth/contenedores/CabeceraDeSesion";
import { GuardiaDeRolTecnico, GuardiaDeRoles, GuardiaDeSesion } from "../funcionalidades/auth/contenedores/GuardiasDeRuta";
import { InicioTecnico } from "../funcionalidades/auth/contenedores/InicioTecnico";
import { PaginaLogin } from "../funcionalidades/auth/contenedores/PaginaLogin";
import { PanelNoDisponible } from "../funcionalidades/auth/contenedores/PanelNoDisponible";
import { PaginaDetalleContrato } from "../funcionalidades/contratos/contenedores/PaginaDetalleContrato";
import { PaginaListaContratos } from "../funcionalidades/contratos/contenedores/PaginaListaContratos";

/**
 * The real route tree (DESIGN.md D4, D9, D10, D13), replacing PR2's
 * placeholder. Exported separately from `enrutador.tsx` so tests can mount
 * it with `createMemoryRouter` instead of the real browser history.
 *
 * `GuardiaDeRolTecnico` (→ `/`, `LayoutTablet` untouched) and
 * `GuardiaDeRoles permitidos={["oficina", "admin"]}` (→ `/contratos`,
 * `LayoutPanel`) are siblings directly under `GuardiaDeSesion`, the same as
 * `/panel-no-disponible` — that sibling placement is what lets a role
 * mismatch on either branch redirect to the OTHER role's actual home
 * instead of a shared dead end.
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
      {
        element: <GuardiaDeRoles permitidos={["oficina", "admin"]} />,
        children: [
          {
            path: "/panel",
            element: (
              <LayoutPanel cabecera={<CabeceraDeSesion />}>
                <PaginaListaContratos />
              </LayoutPanel>
            ),
          },
          {
            /*
              Declared after `/contratos` and never as its child: the detail
              replaces the list rather than nesting inside it, so the office
              reads one screen at a time. Inside the same role guard, so it
              inherits the `oficina`/`admin` gate with no second rule to keep
              in sync.
            */
            path: "/panel/contratos/:id",
            element: (
              <LayoutPanel cabecera={<CabeceraDeSesion />}>
                <PaginaDetalleContrato />
              </LayoutPanel>
            ),
          },
        ],
      },
    ],
  },
];
