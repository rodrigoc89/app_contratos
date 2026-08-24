import { useEffect, useRef, useState } from "react";

import type { ObservadorDeDocumento } from "../../funcionalidades/revision/logica/observadorDeDocumento";
import { confirmar, estadoInicialDePuerta, medir, type EstadoPuerta } from "../../funcionalidades/revision/logica/puertaDeLectura";
import { crearObservadorDeIframe } from "../../funcionalidades/revision/infraestructura/observadorDeIframe";
import { Boton } from "../atomos/Boton";

export interface PropiedadesVisorDeDocumento {
  /** Server-rendered document HTML (`GET /contratos/:id/previsualizacion`). */
  readonly html: string;
  /** The iframe's accessible title — also what tests query the frame by. */
  readonly titulo: string;
  readonly onCambiaEstado?: (estado: EstadoPuerta) => void;
  /**
   * Injection seam for `ObservadorDeDocumento` (DESIGN.md D2). Tests supply
   * a fake that emits scripted measurements; production leaves this unset
   * and gets the real iframe-based observer.
   */
  readonly crearObservador?: (iframe: HTMLIFrameElement) => ObservadorDeDocumento;
}

/**
 * DESIGN.md D2 — renders one document inside a sandboxed iframe and wires
 * its `ObservadorDeDocumento` to `puertaDeLectura`'s pure state machine.
 *
 * `sandbox="allow-same-origin"` only, deliberately: scripts inside the
 * server-rendered document stay disabled and this component reads
 * `contentDocument` directly. `allow-scripts` combined with
 * `allow-same-origin` is the documented sandbox escape — no script is ever
 * injected and nothing is read back via `postMessage`.
 */
export function VisorDeDocumento({ html, titulo, onCambiaEstado, crearObservador }: PropiedadesVisorDeDocumento) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [estado, establecerEstado] = useState<EstadoPuerta>(estadoInicialDePuerta());

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) {
      return;
    }

    const fabricarObservador = crearObservador ?? crearObservadorDeIframe;
    const observador = fabricarObservador(iframe);
    return observador.observar((medicion) => {
      establecerEstado((previo) => medir(previo, medicion));
    });
  }, [crearObservador]);

  /*
    `onCambiaEstado` is deliberately excluded from the dependency array below,
    and the exclusion is load-bearing in both directions.

    Why excluding it is *safe*: React runs the effect closure from the latest
    render, so on a real state change the callback that fires is always the
    one the parent passed most recently — never a stale capture. Excluding it
    drops only the *re*-notification for a state the previous callback already
    received, which carries no new information.

    Why including it is *harmful*: `PasoFirmaDual` — the only production
    caller — passes an inline arrow whose updater allocates a fresh object
    (`{ ...previo, [documento]: estado }`), so React can never bail out of the
    parent's re-render. Adding the dependency closes the cycle: effect →
    parent setState → new callback identity → effect → … It is not a spurious
    extra call, it is an unbounded render loop; with the dependency added the
    test run hangs rather than fails.

    Both halves are pinned by named tests in `VisorDeDocumento.spec.tsx`, so
    this comment cannot quietly drift away from the behaviour it describes.
  */
  useEffect(() => {
    onCambiaEstado?.(estado);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: see above. Adding `onCambiaEstado` here is an unbounded render loop, not a missing dependency.
  }, [estado]);

  const requiereConfirmacionExplicita =
    estado.estado === "pendiente" && estado.motivo === "cabe_sin_desplazar_falta_confirmar";

  return (
    <div className="mb-6">
      {/*
        Bounded to a FRACTION of the viewport height — never to content,
        never unbounded. `puertaDeLectura.ts` distinguishes "scrolled to the
        end" from "fits without scrolling — confirmation pending"; sizing
        this to content (`h-auto`) or leaving it unbounded (any `min-h-*`)
        would silently move every real two-page comodato onto the
        confirmation branch by making it fit without scrolling. `h-[45vh]`
        only — deliberately no `min-h-*` here (guard 17,
        estilos/convencionesDeUtilidades.spec.ts).
      */}
      <iframe
        ref={iframeRef}
        title={titulo}
        srcDoc={html}
        sandbox="allow-same-origin"
        className="block h-[45vh] w-full rounded-base border-2 border-borde-suave bg-fondo"
      />
      {requiereConfirmacionExplicita ? (
        <Boton type="button" onClick={() => establecerEstado((previo) => confirmar(previo))}>
          Leí el documento completo
        </Boton>
      ) : null}
    </div>
  );
}
