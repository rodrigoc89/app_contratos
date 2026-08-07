import type { DatosSesion } from "@contratos/esquemas";

/**
 * The current session, held in memory only.
 *
 * DESIGN.md D4: the access token lives in memory for the lifetime of the tab;
 * the refresh token additionally survives in `localStorage` so an OS-level
 * kill does not force re-login — that persistence layer is
 * `datos/sesion/almacenSesion.ts` (a later slice), which is also the file
 * added to D8's storage-API allowlist. This module is the seam both
 * `clienteHttp.ts` (Bearer header) and `refresco.ts` (the refresh mutex)
 * read and write through, independent of how — or whether — the session was
 * persisted to survive a reload.
 *
 * Task 21, spec `web-auth-session` ("Session expires mid-form"): also an
 * observable store, `useSyncExternalStore`-shaped. `refresco.ts` clears the
 * session from a non-React call site whenever a mid-visit refresh fails —
 * without a subscription, nothing tells `GuardiaDeSesion` to re-render, so
 * a técnico is left on a screen backed by a dead session until a manual
 * reload. `suscribirseASesion` below is that missing notification path;
 * `obtenerSesionActual` stays the snapshot getter it already was, and stays
 * safe as a `useSyncExternalStore` snapshot because `sesionActual` is never
 * rebuilt per call — the same reference is returned until it actually
 * changes.
 */
let sesionActual: DatosSesion | null = null;

/**
 * Why the session most recently ended. Read by `PaginaLogin` (task 21) to
 * show a técnico-facing reason distinguishing a mid-visit expiry from an
 * explicit logout — kept in memory only, alongside `sesionActual`, never
 * written through any storage API.
 */
export type MotivoCierreDeSesion = "sesion_expirada" | "cierre_explicito";

let motivoUltimoCierre: MotivoCierreDeSesion | null = null;

type EscuchaDeSesion = () => void;

const escuchas = new Set<EscuchaDeSesion>();

export function obtenerSesionActual(): DatosSesion | null {
  return sesionActual;
}

export function obtenerMotivoUltimoCierre(): MotivoCierreDeSesion | null {
  return motivoUltimoCierre;
}

export function establecerSesion(sesion: DatosSesion): void {
  sesionActual = sesion;
  motivoUltimoCierre = null;
  notificar();
}

/**
 * `sesion_expirada` is the default because both this file's own callers that
 * omit the argument are mid-visit expiries (`refresco.ts`'s failed-refresh
 * branch); `cerrarSesion()` (`sesion.ts`) is the one caller that passes
 * `cierre_explicito` for an intentional logout.
 */
export function limpiarSesion(motivo: MotivoCierreDeSesion = "sesion_expirada"): void {
  sesionActual = null;
  motivoUltimoCierre = motivo;
  notificar();
}

/**
 * `useSyncExternalStore`-compatible subscription: returns the unsubscribe
 * function directly, matching the hook's own `subscribe` contract exactly
 * so `usarSesionActual` can pass this in unwrapped.
 */
export function suscribirseASesion(escucha: EscuchaDeSesion): () => void {
  escuchas.add(escucha);
  return () => escuchas.delete(escucha);
}

function notificar(): void {
  for (const escucha of escuchas) {
    escucha();
  }
}
