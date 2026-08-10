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

  useEffect(() => {
    onCambiaEstado?.(estado);
    // `onCambiaEstado` is intentionally excluded from the dependency array:
    // callers pass an inline arrow in the common case, and re-running this
    // effect on every parent render (rather than only on a real state
    // change) would make `onCambiaEstado` fire spuriously.
  }, [estado]);

  const requiereConfirmacionExplicita =
    estado.estado === "pendiente" && estado.motivo === "cabe_sin_desplazar_falta_confirmar";

  return (
    <div className="visor-documento">
      <iframe
        ref={iframeRef}
        title={titulo}
        srcDoc={html}
        sandbox="allow-same-origin"
        className="visor-documento__iframe"
      />
      {requiereConfirmacionExplicita ? (
        <Boton type="button" onClick={() => establecerEstado((previo) => confirmar(previo))}>
          Leí el documento completo
        </Boton>
      ) : null}
    </div>
  );
}
