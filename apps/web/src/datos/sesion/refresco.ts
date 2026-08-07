import { EsquemaSesion, type DatosSesion, type DatosTokenDeRefresco } from "@contratos/esquemas";

import {
  borrarTokenDeRefrescoGuardado,
  guardarTokenDeRefresco,
  obtenerTokenDeRefrescoGuardado,
} from "./almacenSesion";
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

/**
 * Task 22 — the token source is "the in-memory session's, otherwise the
 * stored one". A cold start has no in-memory session by definition
 * (`estadoSesion.ts`'s module state resets on every reload), so this is
 * what lets `refrescarSesion()` — and its single-flight mutex above — serve
 * both a boot-time restore and a mid-visit 401 through the same function,
 * instead of a second code path that could double-present the token.
 */
async function ejecutarRefresco(): Promise<DatosSesion> {
  const sesion = obtenerSesionActual();
  const tokenDeRefresco = sesion?.tokenDeRefresco ?? obtenerTokenDeRefrescoGuardado();

  if (tokenDeRefresco === null) {
    throw new Error("No hay sesión activa para refrescar.");
  }

  const cuerpo: DatosTokenDeRefresco = { tokenDeRefresco };

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
    // in-memory session so no further request goes out with a token that
    // will never work.
    //
    // Task 20.3, spec `web-auth-session` ("Session expires mid-form"):
    // deliberately `limpiarSesion()`, never `cerrarSesion()` (D4, scenario
    // 9). A mid-visit expiry is not a decision the técnico made — the local
    // `borrador` draft (and the `contratoId` it carries, task 20.1) must
    // survive so `FormularioBorrador`'s resume (task 20.2) can restore it
    // after re-login. Only an explicit logout clears that draft. See
    // `refresco.spec.ts` for the test proving this stays true, and
    // `sesion.spec.ts` for `cerrarSesion`'s opposite guarantee.
    limpiarSesion();
    // Task 22, part (a): the presented token is now known-dead — leaving it
    // in the stored copy would present it again on the next boot, which
    // `RefrescarSesion.rechazarTokenMuerto` reads as reuse of an
    // already-rotated token and answers by revoking the whole family.
    borrarTokenDeRefrescoGuardado();
    throw new Error(`El refresco de sesión falló con estado ${respuesta.status}.`);
  }

  const datos: unknown = await respuesta.json();
  const nuevaSesion = EsquemaSesion.parse(datos);
  establecerSesion(nuevaSesion);
  // Task 22, part (a): persist the rotated token every time, not only at
  // login (`sesion.ts`'s `iniciarSesion`). Refresh tokens are single-use —
  // without this, the copy written at login is burned by the very first
  // refresh of the session, and a later cold-start restore would present a
  // dead token and be read as theft.
  guardarTokenDeRefresco(nuevaSesion.tokenDeRefresco);
  return nuevaSesion;
}
