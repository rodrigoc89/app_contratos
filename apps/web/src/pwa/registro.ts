/**
 * The registration function `vite-plugin-pwa`'s `virtual:pwa-register`
 * module exports, narrowed to the one shape this app uses. Kept as a type
 * only — never imported as a value here — so this file has no static
 * dependency on a Vite virtual module, which cannot resolve outside a real
 * Vite build (and therefore cannot resolve under Vitest either). The real
 * `registerSW` is imported and passed in from `main.tsx`, the one place in
 * this app that already carries no spec of its own.
 */
export type RegistrarSW = (opciones: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
}) => (recargar?: boolean) => Promise<void>;

/**
 * DESIGN.md D9 — registers the service worker and reports every "a new
 * version is waiting" event through `alNecesitarActualizar`, unconditionally.
 * The decision of whether that is safe to act on lives entirely in
 * `crearControladorDeActualizacion` (`actualizacion.ts`), not here: this
 * function only transports the event and returns the apply function exactly
 * as the registrar gave it back.
 */
export function registrarServiceWorker(
  registrar: RegistrarSW,
  alNecesitarActualizar: () => void,
): (recargar?: boolean) => Promise<void> {
  return registrar({ immediate: true, onNeedRefresh: alNecesitarActualizar });
}
