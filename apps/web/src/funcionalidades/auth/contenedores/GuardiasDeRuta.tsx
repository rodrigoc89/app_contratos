import { Navigate, Outlet } from "react-router-dom";

import { obtenerMotivoUltimoCierre, obtenerSesionActual } from "../../../datos/sesion/estadoSesion";
import { usarSesionActual } from "../usarSesionActual";

/**
 * Requires a session to reach anything nested under it.
 *
 * Task 21, spec `web-auth-session` ("Session expires mid-form"): reads the
 * session reactively (`usarSesionActual`, `useSyncExternalStore`-backed)
 * rather than only at render time. A login/logout that routes through
 * `navigate(...)` would re-render this anyway, but `refresco.ts` clears the
 * session from a non-React call site mid-visit — without the subscription,
 * that clear never reached this component, and the técnico stayed on a
 * screen backed by a dead session until a manual reload. The redirect
 * carries `state.motivo` (`obtenerMotivoUltimoCierre()`) so `PaginaLogin`
 * can explain why — a mid-visit expiry reads differently from an explicit
 * logout.
 */
export function GuardiaDeSesion() {
  const sesion = usarSesionActual();
  if (sesion === null) {
    return <Navigate to="/login" replace state={{ motivo: obtenerMotivoUltimoCierre() }} />;
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
