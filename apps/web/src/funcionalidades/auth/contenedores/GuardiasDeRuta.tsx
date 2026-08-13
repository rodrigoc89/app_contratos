import { Navigate, Outlet } from "react-router-dom";

import { obtenerMotivoUltimoCierre, obtenerSesionActual } from "../../../datos/sesion/estadoSesion";
import { rutaInicialPara, type Rol } from "../logica/rutaInicialPara";
import { usarRestauracionDeSesion } from "../usarRestauracionDeSesion";
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
 *
 * Task 22 — a third boot state. Before deciding "session" or "no session",
 * this also asks `usarRestauracionDeSesion()` whether a stored refresh
 * token is still being verified from a cold start. Rendering nothing while
 * `restaurando` is true is what stops a técnico with a live stored session
 * from ever seeing the login screen flash before the app replaces it.
 */
export function GuardiaDeSesion() {
  const restaurando = usarRestauracionDeSesion();
  const sesion = usarSesionActual();

  if (restaurando) {
    return null;
  }
  if (sesion === null) {
    return <Navigate to="/login" replace state={{ motivo: obtenerMotivoUltimoCierre() }} />;
  }
  return <Outlet />;
}

/**
 * DESIGN.md D9 (revision: role gating resolves a home, not a dead end) —
 * one generalized role guard. Renders the nested route when the session
 * role is allowed, and otherwise redirects to `rutaInicialPara(rol)` —
 * resolving where that role actually belongs instead of bouncing every
 * mismatch to the same `/panel-no-disponible` (the previous behaviour,
 * which made a successful `oficina` login read as a broken app). Only
 * reachable once `GuardiaDeSesion` above has already confirmed a session
 * exists.
 *
 * Deliberately keeps the non-reactive `obtenerSesionActual()`, unchanged
 * from before this generalization: `GuardiaDeSesion` above it is already
 * reactive and owns session-death redirects; switching this guard to
 * `usarSesionActual()` while generalizing it would be an unrelated
 * behaviour change smuggled into a refactor.
 */
export function GuardiaDeRoles({ permitidos }: { readonly permitidos: readonly Rol[] }) {
  const sesion = obtenerSesionActual();
  if (sesion !== null && !permitidos.includes(sesion.usuario.rol)) {
    return <Navigate to={rutaInicialPara(sesion.usuario.rol)} replace />;
  }
  return <Outlet />;
}

/**
 * A thin wrapper over `GuardiaDeRoles` (DESIGN.md D9): `rutas.tsx`'s single
 * call site compiles untouched, and the tablet route tree it gates is
 * behaviourally byte-identical to before this change.
 */
export function GuardiaDeRolTecnico() {
  return <GuardiaDeRoles permitidos={["tecnico"]} />;
}
