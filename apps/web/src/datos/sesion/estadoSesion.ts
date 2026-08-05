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
 */
let sesionActual: DatosSesion | null = null;

export function obtenerSesionActual(): DatosSesion | null {
  return sesionActual;
}

export function establecerSesion(sesion: DatosSesion): void {
  sesionActual = sesion;
}

export function limpiarSesion(): void {
  sesionActual = null;
}
