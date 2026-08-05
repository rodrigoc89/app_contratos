import {
  MAXIMO_PUNTOS_POR_TRAZO,
  MAXIMO_TRAZOS_POR_FIRMA,
  type DatosFirmaCapturada,
  type DatosPuntoFirma,
  type DatosTrazoFirma,
  type TipoDocumentoFirmado,
} from "@contratos/esquemas";

/**
 * DESIGN.md D5 — signature capture as a DOM-free core behind a surface port.
 * `CapturaDeFirma` never sees a `PointerEvent` or a canvas; it is driven by
 * `MuestraDePuntero`, a narrow sample the future `LienzoDeFirma` (PR12)
 * derives from real pointer events. That keeps every rule below testable
 * without jsdom, a `PointerEvent` polyfill, or a canvas: strokes, point
 * counts, and stroke counts are all plain arrays.
 *
 * Rules enforced here, each mirrored by a real bound in `@contratos/esquemas`
 * so this core can never produce a signature the server would reject on
 * shape alone (`firma-capture` spec, "Server-valid by construction"):
 *
 * - `t` is clamped to never regress within a stroke — a caller feeding a
 *   regressing sample (clock jitter, a stray coalesced event) gets a clamped
 *   point, not a corrupted or rejected one. `EsquemaTrazoFirma` requires
 *   non-decreasing `t` within a stroke.
 * - A stroke never exceeds `MAXIMO_PUNTOS_POR_TRAZO`; a signature never
 *   exceeds `MAXIMO_TRAZOS_POR_FIRMA` strokes. Samples past either cap are
 *   dropped — the stroke or the signature is not rejected outright.
 * - Samples closer than ~0.5 CSS px to the previous point in the same stroke
 *   are dropped as noise, not stored — this is what keeps a slow, careful
 *   signature from silently overflowing the point cap on jitter alone.
 */

const DISTANCIA_MINIMA_PX = 0.5;

/** One sample of the pointer crossing the canvas — no DOM, no pointer id. */
export interface MuestraDePuntero {
  readonly x: number;
  readonly y: number;
  /** Milliseconds since capture started, relative — never epoch (DESIGN.md D5). */
  readonly tiempoMs: number;
  /** Present only when the caller decided it is real measured pressure. */
  readonly presion?: number;
}

/**
 * The fields `muestraDesdePuntero` needs from a real `PointerEvent` (or a
 * test double standing in for one) — deliberately not the DOM type itself,
 * so this stays testable with a plain object and no jsdom.
 */
export interface MuestraCrudaDePuntero {
  readonly x: number;
  readonly y: number;
  readonly tiempoMs: number;
  readonly pointerType: string;
  readonly pressure: number;
}

/**
 * Decides whether a raw pointer reading carries real pressure evidence.
 *
 * Pointer Events report `pressure` as a constant `0.5` for mouse and for
 * most touch input — the spec's default for hardware with no pressure
 * sensor, not a measurement. Recording that as `presion` would be
 * fabricating forensic evidence, so it is included only when the input is a
 * pen (`pointerType === "pen"`) and the value is meaningfully present
 * (`pressure > 0`). Every other case omits the key entirely — never
 * `presion: undefined` (`exactOptionalPropertyTypes`).
 */
export function muestraDesdePuntero(cruda: MuestraCrudaDePuntero): MuestraDePuntero {
  const { x, y, tiempoMs, pointerType, pressure } = cruda;
  if (pointerType === "pen" && pressure > 0) {
    return { x, y, tiempoMs, presion: pressure };
  }
  return { x, y, tiempoMs };
}

export interface CapturaDeFirma {
  /** Starts a new stroke. A no-op once `MAXIMO_TRAZOS_POR_FIRMA` is reached. */
  iniciarTrazo(muestra: MuestraDePuntero): void;
  /** Appends to the current stroke. A no-op without an open stroke. */
  agregarPunto(muestra: MuestraDePuntero): void;
  /** Marks the current stroke as finished. The stroke is not discarded. */
  terminarTrazo(): void;
  /**
   * Discards the most recently added stroke, whether finished or still open.
   * A no-op when there is nothing captured yet. Strokes are timestamped
   * independently of one another (`t` only has to be non-decreasing within a
   * single stroke), so removing one never touches the timestamps of any
   * stroke that remains.
   */
  deshacerUltimoTrazo(): void;
  /**
   * Discards every stroke. The result is `trazos() === []`, the same shape
   * the server rejects for having zero strokes — never a signature that
   * merely looks empty.
   */
  limpiar(): void;
  /** Every captured stroke, in the shape `EsquemaTrazoFirma` expects. */
  trazos(): readonly DatosTrazoFirma[];
  /** Total points across every stroke — the signal "listo" gates on. */
  readonly cantidadPuntos: number;
}

function distanciaPx(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function puntoDesdeMuestra(muestra: MuestraDePuntero, tMinimo: number): DatosPuntoFirma {
  const t = Math.max(muestra.tiempoMs, tMinimo);
  return muestra.presion === undefined ? { x: muestra.x, y: muestra.y, t } : { x: muestra.x, y: muestra.y, t, presion: muestra.presion };
}

export function crearCapturaDeFirma(): CapturaDeFirma {
  const trazosInternos: DatosPuntoFirma[][] = [];

  function trazoActual(): DatosPuntoFirma[] | undefined {
    return trazosInternos.at(-1);
  }

  return {
    iniciarTrazo(muestra) {
      if (trazosInternos.length >= MAXIMO_TRAZOS_POR_FIRMA) {
        return;
      }
      trazosInternos.push([puntoDesdeMuestra(muestra, 0)]);
    },

    agregarPunto(muestra) {
      const trazo = trazoActual();
      if (trazo === undefined || trazo.length >= MAXIMO_PUNTOS_POR_TRAZO) {
        return;
      }

      const ultimo = trazo.at(-1);
      if (ultimo !== undefined && distanciaPx(ultimo, muestra) < DISTANCIA_MINIMA_PX) {
        return;
      }

      trazo.push(puntoDesdeMuestra(muestra, ultimo?.t ?? 0));
    },

    terminarTrazo() {
      // The stroke is already complete in `trazosInternos` — points are
      // appended directly as they arrive. This is kept as an explicit,
      // named lifecycle boundary for the caller (glue code reacting to
      // `pointerup`), not because anything needs finalizing here yet.
    },

    deshacerUltimoTrazo() {
      trazosInternos.pop();
    },

    limpiar() {
      trazosInternos.length = 0;
    },

    trazos() {
      return trazosInternos.map((trazo) => [...trazo]);
    },

    get cantidadPuntos() {
      return trazosInternos.reduce((total, trazo) => total + trazo.length, 0);
    },
  };
}

/** One document's captured signature, ready to fold into `firmas[]`. */
export interface FirmaDelDocumento {
  readonly documento: TipoDocumentoFirmado;
  readonly captura: CapturaDeFirma;
  /** `data:image/png;base64,…` from the canvas surface (`SuperficieDeFirma`, PR12). */
  readonly imagenPng: string;
}

/**
 * Assembles both documents' captures into the `firmas[]` shape
 * `POST /contratos/:id/firmar` expects. The result is parsed against the
 * real `EsquemaFirmarContrato` before it is ever sent — a signature rejected
 * after the customer already signed is the worst failure this system can
 * produce (DESIGN.md D5), so the client refuses it first.
 */
export function ensamblarFirmas(
  firmas: readonly FirmaDelDocumento[],
): readonly DatosFirmaCapturada[] {
  return firmas.map(({ documento, captura, imagenPng }) => ({
    documento,
    imagenPng,
    trazos: [...captura.trazos()],
  }));
}
