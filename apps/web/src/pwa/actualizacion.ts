/**
 * DESIGN.md D9 — a DOM-free decision core, deliberately kept apart from
 * `vite-plugin-pwa`'s virtual module and from React state. It answers one
 * question: given that a new service-worker version is waiting, is it safe
 * to tell the technician right now?
 *
 * "Applies on the next cold start" needs no code here at all — it falls
 * straight out of `registerType: "prompt"` + `skipWaiting: false` +
 * `clientsClaim: false` (`configuracionPwa.ts`): a waiting worker that is
 * never sent the skip-waiting message activates on its own the next time
 * every tab of the old version is closed. This controller only ever
 * decides whether to SHOW the affordance and let the technician tap it —
 * it never calls `updateSW()` on its own, so the worst case if nothing here
 * ran at all is exactly that natural cold-start activation.
 */
export type EstadoActualizacion =
  | { readonly tipo: "sin_novedad" }
  | { readonly tipo: "esperando_fin_de_visita" }
  | { readonly tipo: "disponible" };

export interface ControladorDeActualizacion {
  /** The service worker reported a new, waiting version. */
  notificarNuevaVersion(): void;
  /** Re-checks `hayTrabajoEnCurso()` against the last known notification, without waiting for a new one. */
  reevaluar(): void;
  readonly estado: EstadoActualizacion;
}

export function crearControladorDeActualizacion(
  hayTrabajoEnCurso: () => boolean,
): ControladorDeActualizacion {
  let versionPendiente = false;
  let estado: EstadoActualizacion = { tipo: "sin_novedad" };

  function evaluar(): void {
    if (!versionPendiente) {
      estado = { tipo: "sin_novedad" };
      return;
    }
    estado = hayTrabajoEnCurso() ? { tipo: "esperando_fin_de_visita" } : { tipo: "disponible" };
  }

  return {
    notificarNuevaVersion() {
      versionPendiente = true;
      evaluar();
    },
    reevaluar: evaluar,
    get estado() {
      return estado;
    },
  };
}
