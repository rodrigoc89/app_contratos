import { useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { cerrarSesion } from "../../../datos/sesion/sesion";

/**
 * DESIGN.md D10: `oficina`/`admin` land here after a successful login. The
 * `oficina` route tree is an explicit non-goal of this change — this
 * screen exists so a working login never reads as a broken one.
 */
export function PanelNoDisponible() {
  const navegar = useNavigate();

  async function manejarCerrarSesion() {
    await cerrarSesion();
    navegar("/login", { replace: true });
  }

  return (
    <div>
      <p>El panel de oficina no está disponible todavía.</p>
      <Boton onClick={manejarCerrarSesion}>Cerrar sesión</Boton>
    </div>
  );
}
