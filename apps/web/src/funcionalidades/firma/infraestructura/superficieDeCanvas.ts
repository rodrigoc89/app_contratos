import { planificarImagenDeFirma } from "../logica/imagenDeFirma";
import type { Punto, SuperficieDeFirma } from "../logica/superficieDeFirma";

/**
 * Caps the backing-store multiplier of the *visible* canvas.
 *
 * DESIGN.md D5 introduced this cap as what kept a signature PNG inside
 * `LARGO_MAXIMO_IMAGEN_FIRMA` (400,000 chars), because the PNG used to be the
 * visible canvas exported whole. It no longer is: `aPngDataUri` draws the
 * strokes into a fixed 1200×343 frame (`logica/imagenDeFirma.ts`), so the
 * exported size is now constant and this cap governs only how sharp the
 * surface looks while the customer is signing. Keeping it still pays for
 * itself — an uncapped backing store on a DPR-3 tablet is three times the
 * pixels to clear and repaint on every rotation, for no visible gain.
 */
const RELACION_DE_PIXELES_MAXIMA = 2;

/**
 * The on-screen pen, in CSS pixels.
 *
 * Nothing used to set `lineWidth` at all, so the customer signed with the
 * canvas 2D default of 1 px: a hairline on the tablet as well as on the PDF.
 * This is feedback only — the *printed* weight is
 * `PlanDeImagenDeFirma.grosorDeTrazo`, chosen for the size the image prints
 * at and deliberately not derived from whatever the viewport made this canvas.
 */
const GROSOR_DE_TRAZO_EN_PANTALLA_PX = 3;

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
  const contexto = canvas.getContext("2d");
  // Resetting to the identity matrix before scaling again matters: the spec
  // says setting `width`/`height` resets the context, but not every engine
  // re-applies that reset when the numeric value happens not to change (two
  // resize events quantizing to the same backing-store size, for instance).
  // Without this reset, calling this function twice — e.g. on two rotations
  // in a row — would compound the devicePixelRatio scale instead of leaving
  // it fixed (PR25).
  contexto?.setTransform(1, 0, 0, 1, 0, 0);
  contexto?.scale(relacion, relacion);
}

/**
 * DESIGN.md D5's real `SuperficieDeFirma`. Every method tolerates a `null`
 * 2D context — the one jsdom hands back in this monorepo's unit tests —
 * without throwing, matching `LienzoDeFirma`'s own tolerance.
 *
 * `crearLienzoDeSalida` is the off-screen canvas the printed image is drawn
 * on, injectable for the same reason `SuperficieDeFirma` itself is: jsdom has
 * no 2D context, so the wiring is provable without one.
 */
export function crearSuperficieDeCanvas(
  canvas: HTMLCanvasElement,
  crearLienzoDeSalida: () => HTMLCanvasElement = () =>
    canvas.ownerDocument.createElement("canvas"),
): SuperficieDeFirma {
  return {
    dibujarSegmento(a: Punto, b: Punto) {
      const contexto = canvas.getContext("2d");
      if (contexto === null) {
        return;
      }
      contexto.lineCap = "round";
      contexto.lineJoin = "round";
      contexto.lineWidth = GROSOR_DE_TRAZO_EN_PANTALLA_PX;
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

    aPngDataUri(trazos) {
      const plan = planificarImagenDeFirma(trazos);
      const salida = crearLienzoDeSalida();
      // Assigning width/height also resets the context, which is exactly
      // what a freshly created canvas wants: a fully transparent bitmap.
      // Nothing paints a background here, and nothing should — the
      // comodante's PNG is transparent too, and a white rectangle would
      // print as a patch over the template's own paper.
      salida.width = plan.ancho;
      salida.height = plan.alto;

      const contexto = salida.getContext("2d");
      if (contexto === null) {
        // jsdom only: no `canvas` npm package is installed, so there is no 2D
        // context to draw on and no image to produce. A real browser never
        // returns `null` for a fresh 2D context. Falling back to the visible
        // canvas keeps this method total instead of throwing mid-signature.
        return canvas.toDataURL("image/png");
      }

      contexto.lineCap = "round";
      contexto.lineJoin = "round";
      contexto.lineWidth = plan.grosorDeTrazo;
      for (const trazo of plan.trazos) {
        const [primero, ...resto] = trazo;
        // A one-point stroke draws nothing, exactly as on screen: the visible
        // surface only ever strokes *between* two samples, so a stray tap
        // must not appear on the PDF having been invisible on the tablet.
        if (primero === undefined || resto.length === 0) {
          continue;
        }
        contexto.beginPath();
        contexto.moveTo(primero.x, primero.y);
        for (const punto of resto) {
          contexto.lineTo(punto.x, punto.y);
        }
        contexto.stroke();
      }

      return salida.toDataURL("image/png");
    },
  };
}
