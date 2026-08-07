import { useCallback, useEffect, useRef, useState } from "react";

import type { ControladorDeActualizacion } from "../pwa/actualizacion";
import { registrarServiceWorker, type RegistrarSW } from "../pwa/registro";

export interface ResultadoUsePwaUpdate {
  /** Safe to show `AvisoDeActualizacion` — never true while `hayTrabajoEnCurso()` was true at the last check. */
  readonly disponible: boolean;
  readonly aplicar: () => void;
}

function estaDisponible(controlador: ControladorDeActualizacion): boolean {
  return controlador.estado.tipo === "disponible";
}

/**
 * DESIGN.md D9 — the thin React glue over the DOM-free
 * `ControladorDeActualizacion` and the injectable `RegistrarSW` port.
 * Registers exactly once per mount, and re-checks on `visibilitychange` so
 * an update suppressed mid-visit can surface as soon as work finishes —
 * without waiting for a full cold start (DESIGN.md D9: "Outside a visit,
 * the technician sees a discreet ... affordance").
 */
export function usePwaUpdate(
  registrar: RegistrarSW,
  controlador: ControladorDeActualizacion,
): ResultadoUsePwaUpdate {
  const [disponible, establecerDisponible] = useState(() => estaDisponible(controlador));
  const refAplicar = useRef<(recargar?: boolean) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    refAplicar.current = registrarServiceWorker(registrar, () => {
      controlador.notificarNuevaVersion();
      establecerDisponible(estaDisponible(controlador));
    });
    // Registers exactly once per mount — `registrar`/`controlador` are
    // ports supplied by the caller and are not expected to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function reevaluar(): void {
      controlador.reevaluar();
      establecerDisponible(estaDisponible(controlador));
    }
    document.addEventListener("visibilitychange", reevaluar);
    return () => document.removeEventListener("visibilitychange", reevaluar);
  }, [controlador]);

  return {
    disponible,
    aplicar: useCallback(() => void refAplicar.current(true), []),
  };
}
