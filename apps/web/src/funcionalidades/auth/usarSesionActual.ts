import { useSyncExternalStore } from "react";

import type { DatosSesion } from "@contratos/esquemas";

import { obtenerSesionActual, suscribirseASesion } from "../../datos/sesion/estadoSesion";

/**
 * React binding over `estadoSesion.ts`'s store (task 21). `obtenerSesionActual`
 * already satisfies `useSyncExternalStore`'s "stable snapshot" contract by
 * construction: `sesionActual` is a plain module variable, never rebuilt per
 * call, so the same reference comes back until `establecerSesion`/
 * `limpiarSesion` actually changes it — no memoization needed here.
 */
export function usarSesionActual(): DatosSesion | null {
  return useSyncExternalStore(suscribirseASesion, obtenerSesionActual);
}
