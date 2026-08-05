import type { Punto, SuperficieDeFirma } from "../logica/superficieDeFirma";

/**
 * Caps the backing-store multiplier. DESIGN.md D5: this is what keeps a
 * signature PNG well inside `LARGO_MAXIMO_IMAGEN_FIRMA` (400,000 chars) on a
 * high-density tablet display.
 */
const RELACION_DE_PIXELES_MAXIMA = 2;

function relacionDePixeles(): number {
  return Math.min(window.devicePixelRatio || 1, RELACION_DE_PIXELES_MAXIMA);
}

/**
 * Scales the canvas's backing store to the device pixel ratio without
 * touching its CSS size, then scales the 2D context to match — so every
 * drawing coordinate elsewhere in this module stays in CSS pixels.
 *
 * jsdom reports a zero-size `getBoundingClientRect` and a `null` 2D context
 * (no `canvas` npm package installed — out of scope for this slice); both
 * are tolerated here, never thrown, per DESIGN.md's own testing note.
 */
export function redimensionarSuperficie(canvas: HTMLCanvasElement): void {
  const relacion = relacionDePixeles();
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * relacion);
  canvas.height = Math.round(rect.height * relacion);
  canvas.getContext("2d")?.scale(relacion, relacion);
}

/**
 * DESIGN.md D5's real `SuperficieDeFirma`. Every method tolerates a `null`
 * 2D context — the one jsdom hands back in this monorepo's unit tests —
 * without throwing, matching `LienzoDeFirma`'s own tolerance.
 */
export function crearSuperficieDeCanvas(canvas: HTMLCanvasElement): SuperficieDeFirma {
  return {
    dibujarSegmento(a: Punto, b: Punto) {
      const contexto = canvas.getContext("2d");
      if (contexto === null) {
        return;
      }
      contexto.lineCap = "round";
      contexto.lineJoin = "round";
      contexto.beginPath();
      contexto.moveTo(a.x, a.y);
      contexto.lineTo(b.x, b.y);
      contexto.stroke();
    },

    limpiar() {
      // Uses the backing-store size (post-`devicePixelRatio` scaling), not
      // the CSS size — the context's own scale would otherwise leave a
      // sliver of the physical canvas uncleared on a high-density display.
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    },

    aPngDataUri() {
      return canvas.toDataURL("image/png");
    },
  };
}
