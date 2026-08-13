import { useEffect, useRef } from "react";

import {
  crearCapturaDeFirma,
  muestraDesdePuntero,
  type CapturaDeFirma,
} from "../../funcionalidades/firma/logica/capturaDeFirma";
import type { Punto, SuperficieDeFirma } from "../../funcionalidades/firma/logica/superficieDeFirma";
import { crearSuperficieDeCanvas, redimensionarSuperficie } from "../../funcionalidades/firma/infraestructura/superficieDeCanvas";
import { Boton } from "../atomos/Boton";

/** What `LienzoDeFirma` hands back after every stroke, clear or undo. */
export interface DatosLienzoDeFirma {
  readonly captura: CapturaDeFirma;
  /** `SuperficieDeFirma.aPngDataUri()` — unmodified, PR13/14 assemble the `firmar` body from it. */
  readonly imagenPng: string;
}

export interface PropiedadesLienzoDeFirma {
  /** The canvas's accessible name — also what tests and screen readers query it by. */
  readonly etiqueta: string;
  readonly onCambia?: (datos: DatosLienzoDeFirma) => void;
  /**
   * Injection seam for `SuperficieDeFirma` (DESIGN.md D5). Tests supply a
   * fake that records calls instead of touching a real canvas; production
   * leaves this unset and gets the real canvas-backed implementation.
   */
  readonly crearSuperficie?: (canvas: HTMLCanvasElement) => SuperficieDeFirma;
}

/**
 * DESIGN.md D5 — the React shell around the DOM-free `CapturaDeFirma` core
 * (PR10/PR11). Owns exactly what D5 assigns it and nothing legally
 * load-bearing: `touch-action: none` (without it the browser scrolls the
 * page instead of drawing — the single most common way a hand-built
 * signature pad fails on a tablet), `setPointerCapture` so a stroke survives
 * the finger leaving the canvas, `getCoalescedEvents()` fan-out so a fast
 * stroke keeps its intermediate points, and the `devicePixelRatio` backing
 * store scale so the capture is not blurry on the hardware this ships to.
 *
 * The pressure-inclusion rule, the point/stroke caps and the `t` clamping
 * all live in `capturaDeFirma.ts` (PR10) — this component only translates a
 * real `PointerEvent` into the plain `MuestraCrudaDePuntero` shape that core
 * already accepts. No rule is duplicated or reinterpreted here.
 */
export function LienzoDeFirma({ etiqueta, onCambia, crearSuperficie }: PropiedadesLienzoDeFirma) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const superficieRef = useRef<SuperficieDeFirma | null>(null);
  const capturaRef = useRef<CapturaDeFirma>(crearCapturaDeFirma());
  const puntoAnteriorRef = useRef<Punto | null>(null);
  const inicioDeTrazoRef = useRef<number | null>(null);

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }
    // A plain, never-reassigned `HTMLCanvasElement` binding — narrowing a
    // `.current` read does not carry into the nested listener below, since
    // the ref could in principle change before it runs.
    const canvas: HTMLCanvasElement = canvasRef.current;
    redimensionarSuperficie(canvas);
    superficieRef.current = (crearSuperficie ?? crearSuperficieDeCanvas)(canvas);

    // PR25 — a rotation changes the canvas's CSS box but never its backing
    // store on its own: `redimensionarSuperficie` clears the bitmap by
    // assigning `width`/`height`, so it can only run again paired with a
    // full replay from `capturaRef` (the source of truth for what was
    // actually drawn) — never alone, or a half-finished signature is erased
    // the moment the técnico tilts the tablet.
    function alRotarORedimensionar() {
      redimensionarSuperficie(canvas);
      redibujarTodo();
    }

    window.addEventListener("resize", alRotarORedimensionar);
    window.addEventListener("orientationchange", alRotarORedimensionar);
    return () => {
      window.removeEventListener("resize", alRotarORedimensionar);
      window.removeEventListener("orientationchange", alRotarORedimensionar);
    };
  }, [crearSuperficie]);

  function notificarCambio() {
    const superficie = superficieRef.current;
    onCambia?.({
      captura: capturaRef.current,
      imagenPng: superficie === null ? "" : superficie.aPngDataUri(),
    });
  }

  function puntoDelEvento(canvas: HTMLCanvasElement, evento: { readonly clientX: number; readonly clientY: number }): Punto {
    const rect = canvas.getBoundingClientRect();
    return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
  }

  /**
   * `t` is relative milliseconds since the current stroke's own first
   * sample — DESIGN.md D5: strokes are timestamped independently of one
   * another, `EsquemaTrazoFirma` only requires non-decreasing `t` *within*
   * a stroke.
   */
  function tiempoRelativoDelTrazo(esNuevoTrazo: boolean): number {
    const ahora = performance.now();
    if (esNuevoTrazo || inicioDeTrazoRef.current === null) {
      inicioDeTrazoRef.current = ahora;
    }
    return Math.round(ahora - inicioDeTrazoRef.current);
  }

  function muestraDelEvento(
    canvas: HTMLCanvasElement,
    nativo: Pick<PointerEvent, "clientX" | "clientY" | "pointerType" | "pressure">,
    esNuevoTrazo: boolean,
  ) {
    const { x, y } = puntoDelEvento(canvas, nativo);
    return muestraDesdePuntero({
      x,
      y,
      tiempoMs: tiempoRelativoDelTrazo(esNuevoTrazo),
      pointerType: nativo.pointerType,
      pressure: nativo.pressure,
    });
  }

  function dibujarHasta(punto: Punto) {
    const anterior = puntoAnteriorRef.current;
    if (anterior !== null) {
      superficieRef.current?.dibujarSegmento(anterior, punto);
    }
    puntoAnteriorRef.current = punto;
  }

  function manejarPointerDown(evento: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(evento.pointerId);
    }
    const muestra = muestraDelEvento(canvas, evento.nativeEvent, true);
    capturaRef.current.iniciarTrazo(muestra);
    dibujarHasta({ x: muestra.x, y: muestra.y });
  }

  function manejarPointerMove(evento: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas === null || puntoAnteriorRef.current === null) {
      // No stroke in progress — a hover/move with no prior pointerdown.
      return;
    }
    const nativo = evento.nativeEvent;
    const coalescidos =
      typeof nativo.getCoalescedEvents === "function" ? nativo.getCoalescedEvents() : [];
    const muestrasNativas = coalescidos.length > 0 ? coalescidos : [nativo];

    for (const muestraNativa of muestrasNativas) {
      const muestra = muestraDelEvento(canvas, muestraNativa, false);
      capturaRef.current.agregarPunto(muestra);
      dibujarHasta({ x: muestra.x, y: muestra.y });
    }
  }

  function manejarFinDeTrazo() {
    if (puntoAnteriorRef.current === null) {
      return;
    }
    capturaRef.current.terminarTrazo();
    puntoAnteriorRef.current = null;
    inicioDeTrazoRef.current = null;
    notificarCambio();
  }

  function redibujarTodo() {
    superficieRef.current?.limpiar();
    for (const trazo of capturaRef.current.trazos()) {
      let anterior: Punto | null = null;
      for (const punto of trazo) {
        if (anterior !== null) {
          superficieRef.current?.dibujarSegmento(anterior, punto);
        }
        anterior = punto;
      }
    }
  }

  function manejarBorrar() {
    capturaRef.current.limpiar();
    superficieRef.current?.limpiar();
    notificarCambio();
  }

  function manejarDeshacer() {
    capturaRef.current.deshacerUltimoTrazo();
    redibujarTodo();
    notificarCambio();
  }

  return (
    <div className="lienzo-de-firma">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={etiqueta}
        className="lienzo-de-firma__lienzo"
        /*
          `touch-action` stays inline because it must win unconditionally —
          without it the browser scrolls the page instead of drawing.

          The SIZE deliberately does not: it used to be `height: 100%` here,
          which no stylesheet could override, and which made the canvas
          consume its wrapper whole so Deshacer/Borrar fell outside the box
          and the next document's iframe covered them. The bound belongs in
          `organismos.css`, where the sheet can state it.
        */
        style={{ touchAction: "none" }}
        onPointerDown={manejarPointerDown}
        onPointerMove={manejarPointerMove}
        onPointerUp={manejarFinDeTrazo}
        onPointerCancel={manejarFinDeTrazo}
      />
      <div className="lienzo-de-firma__acciones">
        <Boton type="button" onClick={manejarDeshacer}>
          Deshacer
        </Boton>
        <Boton type="button" className="boton--destructivo" onClick={manejarBorrar}>
          Borrar
        </Boton>
      </div>
    </div>
  );
}
