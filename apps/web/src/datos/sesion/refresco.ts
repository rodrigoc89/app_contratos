import { EsquemaSesion, type DatosSesion, type DatosTokenDeRefresco } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./estadoSesion";

/**
 * A module-singleton mutex, not a React context — precisely so non-React
 * callers (the autosave queue, the delivery fetch, `clienteHttp`'s own 401
 * handler) all funnel through the same in-flight promise (DESIGN.md D4).
 *
 * Refresh tokens in this API are single-use and rotate
 * (`apps/api/src/identidad/application/RefrescarSesion.ts`): a successful
 * refresh burns the token it consumed and issues a new one in the same
 * family. If two concurrent refreshes both presented the same (now-stale)
 * token, the second would look like reuse of an already-rotated token —
 * `rechazarTokenMuerto` treats that as a theft signal and revokes the whole
 * family, forcing a full re-login in the middle of a customer's visit.
 *
 * The fix is not "handle it gracefully" — it is "never let it happen":
 * `refrescoEnCurso ??=` assigns synchronously, before any `await`, so N
 * calls made in the same tick all observe the same promise and only one
 * `POST /auth/refresh` is ever sent.
 */
let refrescoEnCurso: Promise<DatosSesion> | null = null;

export function refrescarSesion(): Promise<DatosSesion> {
  refrescoEnCurso ??= ejecutarRefresco().finally(() => {
    refrescoEnCurso = null;
  });
  return refrescoEnCurso;
}

async function ejecutarRefresco(): Promise<DatosSesion> {
  const sesion = obtenerSesionActual();

  if (sesion === null) {
    throw new Error("No hay sesión activa para refrescar.");
  }

  const cuerpo: DatosTokenDeRefresco = { tokenDeRefresco: sesion.tokenDeRefresco };

  // Deliberately a bare `fetch`, not `clienteHttp`: this request carries no
  // Bearer header and must never itself trigger the 401 → refresh
  // interceptor (that is exactly the "sinAutenticacion" rule for
  // `/auth/refresh`, applied here by construction rather than by an option
  // someone could forget to pass).
  const respuesta = await fetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    // A refused refresh means the session is over — expired, revoked, or
    // reused. Nothing about *why* changes what the client does: clear the
    // session so no further request goes out with a token that will never
    // work, and let the caller (clienteHttp's 401 handler) route to login.
    limpiarSesion();
    throw new Error(`El refresco de sesión falló con estado ${respuesta.status}.`);
  }

  const datos: unknown = await respuesta.json();
  const nuevaSesion = EsquemaSesion.parse(datos);
  establecerSesion(nuevaSesion);
  return nuevaSesion;
}
