import { EsquemaActualizarContrato, type DatosActualizarContrato, type DatosContratoDetalle } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";
import { conReintentoDeConcurrencia } from "../reintentoDeConcurrencia";
import { marcarTrabajoEnCurso } from "../../pwa/trabajoEnCurso";

const RETRASO_DEBOUNCE_MS = 800;

export interface ColaDeGuardado {
  /** Merges `parche` into the pending patch and (re)starts the debounce. */
  encolar(parche: DatosActualizarContrato): void;
  /** Cancels the debounce, flushes now, and waits for every chained flush. */
  vaciar(): Promise<void>;
  readonly hayPendiente: boolean;
}

/**
 * DESIGN.md D3 — a depth-1 coalescing autosave queue, one per contract.
 * `encolar` merges into a single pending patch (whole `comodatario`/`equipos`
 * halves, never individual fields) and debounces 800 ms. `enVuelo` is the
 * only object that decides whether a `PATCH` may be sent, so two requests
 * for the same contract can never overlap: the only path to `fetch` sets
 * `enVuelo` synchronously before the first `await`, and its settlement
 * re-checks `pendiente` — so N edits made while a request is in flight
 * collapse into exactly one further request, not N (spec scenario 5).
 */
export function crearColaDeGuardado(contratoId: string): ColaDeGuardado {
  let pendiente: DatosActualizarContrato | null = null;
  let enVuelo: Promise<void> | null = null;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const claveTrabajoEnCurso = `autosave:${contratoId}`;

  // DESIGN.md D9 — "any unflushed autosave" is exactly `pendiente !== null ||
  // enVuelo !== null`, the same condition `hayPendiente` already exposes.
  // Called after every mutation of either variable, so the registry can
  // never drift from what this queue itself considers unsaved.
  function actualizarTrabajoEnCurso(): void {
    marcarTrabajoEnCurso(claveTrabajoEnCurso, pendiente !== null || enVuelo !== null);
  }

  function cancelarTemporizador(): void {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  }

  function dispararSinEsperar(): void {
    // Fire-and-forget: this call has no caller waiting on it (a debounce
    // tick, or the success branch below re-checking `pendiente`). A caller
    // that needs to observe failure uses `vaciar()`, which awaits the same
    // attempt through `enVuelo` and propagates its rejection.
    void intentarEnviar().catch(() => {});
  }

  async function intentarEnviar(): Promise<void> {
    cancelarTemporizador();
    if (enVuelo !== null) {
      return enVuelo;
    }
    if (pendiente === null) {
      return;
    }

    // Validated once more here as a safety net (DESIGN.md D3, "the body is
    // validated ... before sending") — a half that does not parse is never
    // sent as a garbage `PATCH`.
    const validado = EsquemaActualizarContrato.safeParse(pendiente);
    if (!validado.success) {
      return;
    }

    const cuerpo = validado.data;
    pendiente = null;
    actualizarTrabajoEnCurso();

    const intento = conReintentoDeConcurrencia(() =>
      clienteHttp<DatosContratoDetalle>(`/contratos/${contratoId}`, {
        metodo: "PATCH",
        cuerpo,
      }),
    );

    enVuelo = intento.then(
      () => {
        enVuelo = null;
        actualizarTrabajoEnCurso();
        if (pendiente !== null) {
          dispararSinEsperar();
        }
      },
      (error: unknown) => {
        // Newer edits made while this attempt was in flight take priority
        // over the ones that just failed to save, so both stay queued —
        // for the next `encolar` debounce or an explicit `vaciar()` retry.
        // This never auto-retries itself.
        pendiente = { ...cuerpo, ...pendiente };
        enVuelo = null;
        actualizarTrabajoEnCurso();
        throw error;
      },
    );
    actualizarTrabajoEnCurso();

    return enVuelo;
  }

  return {
    encolar(parche) {
      pendiente = { ...pendiente, ...parche };
      actualizarTrabajoEnCurso();
      cancelarTemporizador();
      temporizador = setTimeout(dispararSinEsperar, RETRASO_DEBOUNCE_MS);
    },
    async vaciar() {
      await intentarEnviar();
      while (enVuelo !== null) {
        await enVuelo;
      }
    },
    get hayPendiente() {
      return pendiente !== null || enVuelo !== null;
    },
  };
}
