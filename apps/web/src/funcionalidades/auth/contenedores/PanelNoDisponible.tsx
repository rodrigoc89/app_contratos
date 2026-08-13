import { useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { cerrarSesion } from "../../../datos/sesion/sesion";

/**
 * R-3.2 (DESIGN.md D10) — `oficina`/`admin` no longer land here: PR2 gives
 * them `/contratos` directly. This screen survives as `rutaInicialPara`'s
 * unknown-role fallback only, so its copy stopped naming the office —
 * naming it now would be false the moment any recognized role has its own
 * home. It exists so an unrecognized role never reads as a broken login.
 */
export function PanelNoDisponible() {
  const navegar = useNavigate();

  async function manejarCerrarSesion() {
    await cerrarSesion();
    // Task 21: carries the explicit-logout reason so `PaginaLogin` shows a
    // confirmation distinct from a mid-visit expiry, same as the reactive
    // redirect `GuardiaDeSesion` would otherwise perform on its own.
    navegar("/login", { replace: true, state: { motivo: "cierre_explicito" } });
  }

  return (
    <div className="panel-no-disponible">
      <p>Todavía no hay un panel disponible para su rol.</p>
      <Boton onClick={manejarCerrarSesion}>Cerrar sesión</Boton>
    </div>
  );
}
