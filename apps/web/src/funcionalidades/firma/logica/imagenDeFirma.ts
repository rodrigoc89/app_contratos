import type { Punto } from "./superficieDeFirma";

/**
 * Turns captured strokes into the geometry of the PNG that goes on the PDF.
 *
 * ## Why this exists
 *
 * The customer's signature printed as a hairline beside the comodante's.
 * Three causes compounded, and all three are answered here:
 *
 * 1. **No `lineWidth` anywhere.** The on-screen surface stroked at the canvas
 *    2D default of 1 CSS px, and that same bitmap was exported. Inside the
 *    template's 20 mm-high `.firma-imagen` box, 1 px of a ~600 px-tall canvas
 *    is 0.0625 mm — 0.18 pt — against the comodante's measured 0.408 mm.
 * 2. **No crop to the ink.** `canvas.toDataURL()` exported the whole canvas,
 *    mostly empty. The comodante's PNG is cropped tight: its ink covers
 *    99.8 % of the file's width.
 * 3. **A viewport-dependent aspect.** `.lienzo-de-firma__lienzo` is
 *    `height: 40vh` over a ~656 px-wide container, so the exported image was
 *    born at 3.2:1 on a landscape tablet, 2.0:1 in portrait and 1.5:1 on a
 *    phone. With `width: auto` the template derives the printed width from
 *    that intrinsic aspect, so the same signature printed 41.0 mm, 25.6 mm or
 *    19.3 mm wide against the comodante's 69.97 mm.
 *
 * ## Why re-draw rather than resample
 *
 * The strokes are still in hand at export time, so the image can be *drawn*
 * at the size it will print instead of a captured bitmap being scaled into
 * it. That is the same operation the comodante's asset went through, it has
 * no resampling artefacts, and the stroke weight becomes a property of the
 * print size rather than of whatever tablet was in the room.
 *
 * ## The frame
 *
 * 1200×343 — the exact dimensions of `apps/api/prisma/firmas/comodante-v1.png`
 * (aspect 3.499), so both signatures on the page are the same picture size.
 * `.firma-imagen` is `height: 20mm; max-width: 70mm; width: auto`, so a 3.5:1
 * image prints 20 mm tall and 69.97 mm wide — the full box, never letterboxed.
 * One output pixel is therefore 20/343 = 0.0583 mm, which puts a 7 px stroke
 * at 0.408 mm (1.16 pt): the comodante's measured weight, and 6.5× the old
 * landscape-tablet hairline.
 *
 * Fixing the frame also takes the export off the `devicePixelRatio` budget:
 * 1200×343 is 412k pixels where the old whole-canvas export was up to 787k
 * on a DPR-2 tablet. The reference PNG at these dimensions is 75,917 bytes —
 * 101,223 base64 chars, a quarter of `LARGO_MAXIMO_IMAGEN_FIRMA` (400,000).
 * Measured against a deliberately dense worst case — six antialiased 7 px
 * strokes crossing the whole frame, 14,406 stamps — a PNG of this size
 * deflates to ~57 kB, or 76.5k base64 chars: 19 % of the cap.
 *
 * ## Coordinate frames — the deliberate decision
 *
 * `trazos` stays in canvas CSS px (`superficieDeFirma.ts`) and this planner
 * never writes back into it: the plan carries a *separate* set of points, in
 * output-image pixels, for drawing only. So the printed image no longer
 * shares a coordinate frame with the forensic strokes.
 *
 * That is intended, and it costs nothing, because they never shared a
 * *scale* to begin with: the canvas is `40vh` on hardware of unknown size, so
 * a stroke's CSS-px coordinates were already meaningless as absolute
 * measurements, and the template then scaled the image to 20 mm regardless.
 * What the strokes carry as evidence is order, shape and timing — all three
 * preserved exactly, because DESIGN.md's signature-capture section makes the
 * `trazos` the forensic record and the image merely "what gets printed on the
 * PDF". Nothing in this system overlays one on the other. Anything that ever
 * wants to would have to re-derive the transform below, not assume it.
 */

/** The reference PNG's own width — see the note above. */
export const ANCHO_IMAGEN_DE_FIRMA_PX = 1200;

/** 1200 / 3.5, rounded — the aspect `.firma-imagen`'s 20×70 mm box draws. */
export const ALTO_IMAGEN_DE_FIRMA_PX = 343;

/**
 * 0.4 mm at 20/343 mm per pixel is 6.86 px; 7 prints at 0.4082 mm, which is
 * the comodante's measured 0.408 mm to three decimals.
 */
export const GROSOR_DE_TRAZO_IMPRESO_PX = 7;

/** The geometry of one signature image: the frame, the pen, and the ink. */
export interface PlanDeImagenDeFirma {
  readonly ancho: number;
  readonly alto: number;
  /** `lineWidth`, in output-image pixels. */
  readonly grosorDeTrazo: number;
  /**
   * The captured strokes mapped into output-image pixels — a new array, for
   * drawing only. The `trazos` handed in are never read for anything but
   * their `x`/`y`, and never modified.
   */
  readonly trazos: ReadonlyArray<ReadonlyArray<Punto>>;
}

interface Extension {
  readonly minX: number;
  readonly minY: number;
  readonly ancho: number;
  readonly alto: number;
}

function extensionDeLaTinta(puntos: readonly Punto[]): Extension {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { x, y } of puntos) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, ancho: maxX - minX, alto: maxY - minY };
}

/**
 * The largest uniform scale that fits `extension` inside `ancho`×`alto`.
 *
 * Uniform on purpose: stretching each axis to fill the frame would fit the
 * box perfectly and print a signature the customer did not make. An axis with
 * no extent at all — a perfectly flat line, or every point on top of the next
 * — constrains nothing, and a signature with neither falls back to 1 rather
 * than to a division by zero.
 */
function escalaDeAjuste(extension: Extension, ancho: number, alto: number): number {
  const porAncho = extension.ancho > 0 ? ancho / extension.ancho : Number.POSITIVE_INFINITY;
  const porAlto = extension.alto > 0 ? alto / extension.alto : Number.POSITIVE_INFINITY;
  const escala = Math.min(porAncho, porAlto);
  return Number.isFinite(escala) ? escala : 1;
}

/**
 * Crops to the ink, scales it into the printed frame without distorting it,
 * and centres it — leaving half a stroke of room at every edge so a round cap
 * is never cut in half by the frame it sits in.
 */
export function planificarImagenDeFirma(
  trazos: ReadonlyArray<ReadonlyArray<Punto>>,
): PlanDeImagenDeFirma {
  const marco = {
    ancho: ANCHO_IMAGEN_DE_FIRMA_PX,
    alto: ALTO_IMAGEN_DE_FIRMA_PX,
    grosorDeTrazo: GROSOR_DE_TRAZO_IMPRESO_PX,
  } as const;

  const puntos = trazos.flat();
  if (puntos.length === 0) {
    return { ...marco, trazos: [] };
  }

  const tinta = extensionDeLaTinta(puntos);
  const escala = escalaDeAjuste(
    tinta,
    marco.ancho - marco.grosorDeTrazo,
    marco.alto - marco.grosorDeTrazo,
  );

  // Whatever the fitted axis leaves over is split evenly, so the signature
  // sits in the middle of the box the template draws rather than against one
  // of its edges.
  const desplazamientoX = (marco.ancho - tinta.ancho * escala) / 2 - tinta.minX * escala;
  const desplazamientoY = (marco.alto - tinta.alto * escala) / 2 - tinta.minY * escala;

  return {
    ...marco,
    trazos: trazos.map((trazo) =>
      trazo.map(({ x, y }) => ({ x: x * escala + desplazamientoX, y: y * escala + desplazamientoY })),
    ),
  };
}
