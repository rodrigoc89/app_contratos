import { Navigate, Outlet } from "react-router-dom";

import { obtenerSesionActual } from "../../../datos/sesion/estadoSesion";

/**
 * Requires a session to reach anything nested under it. Read at render
 * time — no reactive state needed here: every transition that changes the
 * session (login, logout) already routes through `navigate(...)`, which by
 * itself re-renders whatever the router matches next against the session
 * as it now stands.
 */
export function GuardiaDeSesion() {
  if (obtenerSesionActual() === null) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

/**
 * DESIGN.md D10 — role gating has a visible behaviour, not just a redirect.
 * An `oficina`/`admin` session that authenticated successfully is not
 * bounced back to login and not shown a permission error; it lands on
 * `/panel-no-disponible`. Only reachable once `GuardiaDeSesion` above has
 * already confirmed a session exists.
 */
export function GuardiaDeRolTecnico() {
  const sesion = obtenerSesionActual();
  if (sesion !== null && sesion.usuario.rol !== "tecnico") {
    return <Navigate to="/panel-no-disponible" replace />;
  }
  return <Outlet />;
}
