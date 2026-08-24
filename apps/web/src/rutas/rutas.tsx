import type { RouteObject } from "react-router-dom";

import { LayoutPanel } from "../componentes/plantillas/LayoutPanel";
import { LayoutTecnico } from "../componentes/plantillas/LayoutTecnico";
import { CabeceraDeSesion } from "../funcionalidades/auth/contenedores/CabeceraDeSesion";
import { GuardiaDeRolTecnico, GuardiaDeRoles, GuardiaDeSesion } from "../funcionalidades/auth/contenedores/GuardiasDeRuta";
import { InicioTecnico } from "../funcionalidades/auth/contenedores/InicioTecnico";
import { PaginaLogin } from "../funcionalidades/auth/contenedores/PaginaLogin";
import { PanelNoDisponible } from "../funcionalidades/auth/contenedores/PanelNoDisponible";
import { PaginaDetalleContrato } from "../funcionalidades/contratos/contenedores/PaginaDetalleContrato";
import { PaginaListaContratos } from "../funcionalidades/contratos/contenedores/PaginaListaContratos";
import { TituloDeDocumento } from "./TituloDeDocumento";

/**
 * The real route tree (DESIGN.md D4, D9, D10, D13), replacing PR2's
 * placeholder. Exported separately from `enrutador.tsx` so tests can mount
 * it with `createMemoryRouter` instead of the real browser history.
 *
 * `GuardiaDeRolTecnico` (→ `/`, inside `LayoutTecnico`) and
 * `GuardiaDeRoles permitidos={["oficina", "admin"]}` (→ `/contratos`,
 * `LayoutPanel`) are siblings directly under `GuardiaDeSesion`, the same as
 * `/panel-no-disponible` — that sibling placement is what lets a role
 * mismatch on either branch redirect to the OTHER role's actual home
 * instead of a shared dead end.
 *
 * DESIGN.md D3 — a new pathless root wraps every existing entry, rendering
 * `TituloDeDocumento` (`<Outlet />` plus one `document.title` effect). Each
 * leaf declares `handle: { titulo }`; the deepest match wins
 * (`tituloDeDocumento.ts`). `/panel-no-disponible` declares no `titulo` on
 * purpose — that screen must not name a home that does not exist. The
 * `/panel/contratos/:id` `titulo` is a placeholder title shown before the
 * contract loads: `PaginaDetalleContrato` overwrites it with the real
 * contract number once the query resolves (`conSufijo`, same suffix).
 */
export const rutas: RouteObject[] = [
  {
    element: <TituloDeDocumento />,
    children: [
      { path: "/login", element: <PaginaLogin />, handle: { titulo: "Ingresar" } },
      {
        element: <GuardiaDeSesion />,
        children: [
          { path: "/panel-no-disponible", element: <PanelNoDisponible /> },
          {
            element: <GuardiaDeRolTecnico />,
            children: [
              {
                /*
                  `LayoutTecnico` existed but nothing ever mounted it, so the
                  técnico's screens rendered with no shell — and therefore
                  with no way to sign out. On a tablet that passes between
                  technicians that is the half of the logout gap that
                  mattered most: `cerrarSesion` is what clears the local
                  draft.
                */
                path: "/",
                element: (
                  <LayoutTecnico cabecera={<CabeceraDeSesion />}>
                    <InicioTecnico />
                  </LayoutTecnico>
                ),
                handle: { titulo: "Inicio" },
              },
            ],
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
                handle: { titulo: "Listado" },
              },
              {
                /*
                  Declared after `/contratos` and never as its child: the
                  detail replaces the list rather than nesting inside it, so
                  the office reads one screen at a time. Inside the same
                  role guard, so it inherits the `oficina`/`admin` gate with
                  no second rule to keep in sync.
                */
                path: "/panel/contratos/:id",
                element: (
                  <LayoutPanel cabecera={<CabeceraDeSesion />}>
                    <PaginaDetalleContrato />
                  </LayoutPanel>
                ),
                handle: { titulo: "Contrato" },
              },
            ],
          },
        ],
      },
    ],
  },
];
