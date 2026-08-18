import type { DatosPuntoFirma, DatosTrazoFirma } from "@contratos/esquemas";
import { describe, expect, it } from "vitest";

import {
  ALTO_IMAGEN_DE_FIRMA_PX,
  ANCHO_IMAGEN_DE_FIRMA_PX,
  GROSOR_DE_TRAZO_IMPRESO_PX,
  planificarImagenDeFirma,
  type PlanDeImagenDeFirma,
} from "./imagenDeFirma";

/**
 * The customer's signature printed as a hairline beside the comodante's, and
 * three separate causes compounded to produce it — every one of them fixed
 * by this planner rather than by resampling the captured bitmap:
 *
 * 1. Nothing ever set `lineWidth`, so the stroke was the canvas 2D default of
 *    1 CSS px. Inside the template's 20 mm-high box that is 0.0625 mm
 *    (≈0.18 pt), against the comodante's measured 0.408 mm (≈1.16 pt).
 * 2. Nothing cropped to the ink. `canvas.toDataURL()` exported the WHOLE
 *    canvas, most of it empty, while the comodante's PNG is cropped tight
 *    (ink 99.8 % of its width).
 * 3. The canvas is `height: 40vh` over a ~656 px container, so its aspect —
 *    and therefore the printed width of the exported image — swung between
 *    41.0 mm (landscape tablet), 25.6 mm (portrait) and 19.3 mm (phone),
 *    against the comodante's 69.97 mm.
 *
 * The reference throughout is `apps/api/prisma/firmas/comodante-v1.png`:
 * 1200×343 (aspect 3.499), 8-bit RGBA, 75,917 bytes. `seedContent.spec.ts`
 * already guards that side of the page ("fits the box the template draws it
 * in"); this is its counterpart for the side the customer signs.
 */

/** `.firma-imagen` in both contract templates: `height: 20mm; max-width: 70mm`. */
const ALTO_IMPRESO_MM = 20;
const ANCHO_MAXIMO_IMPRESO_MM = 70;

/** The comodante's stroke, measured on the sealed PDF. */
const GROSOR_DEL_COMODANTE_MM = 0.408;

/** float64 slack for the one comparison that lands exactly on a boundary. */
const EPSILON = 1e-9;

function punto(x: number, y: number, t: number): DatosPuntoFirma {
  return { x, y, t };
}

/**
 * Ink confined to a small region of a large canvas — the real shape of the
 * defect: a signature drawn in the middle of a 1312×600 backing store.
 * Extent 200×50 CSS px, so an aspect of 4.0 — wider than the 3.5 frame, which
 * makes the horizontal axis the constrained one.
 */
function trazosEnUnaEsquina(): readonly DatosTrazoFirma[] {
  return [
    [punto(500, 300, 0), punto(560, 280, 10), punto(620, 320, 20), punto(700, 290, 30)],
    [punto(520, 330, 0), punto(690, 330, 12)],
  ];
}

/**
 * A compact signature — extent 100×100, an aspect of 1.0, narrower than the
 * frame, which makes the vertical axis the constrained one.
 */
function trazosCompactos(): readonly DatosTrazoFirma[] {
  return [
    [punto(10, 10, 0), punto(110, 60, 8), punto(10, 110, 16), punto(110, 110, 24)],
  ];
}

interface Limites {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function limitesDe(plan: PlanDeImagenDeFirma): Limites {
  const puntos = plan.trazos.flat();
  return {
    minX: Math.min(...puntos.map(({ x }) => x)),
    maxX: Math.max(...puntos.map(({ x }) => x)),
    minY: Math.min(...puntos.map(({ y }) => y)),
    maxY: Math.max(...puntos.map(({ y }) => y)),
  };
}

describe("planificarImagenDeFirma", () => {
  it("crops to the ink, so a signature drawn in one corner still fills the printed frame", () => {
    const plan = planificarImagenDeFirma(trazosEnUnaEsquina());

    const { minX, maxX } = limitesDe(plan);
    // The ink spanned 200 of the canvas's ~1312 px — 15 % of it. After the
    // crop it spans the frame's whole usable width, the way the comodante's
    // does (99.8 % of its own).
    expect((maxX - minX) / plan.ancho).toBeGreaterThan(0.98);
  });

  it("pads symmetrically instead of stretching, so the ink keeps the shape the customer drew", () => {
    const plan = planificarImagenDeFirma(trazosEnUnaEsquina());

    const { minX, maxX, minY, maxY } = limitesDe(plan);
    // Input extent 200×50 — an aspect of 4.0. Uniform scale means the output
    // ink carries the same aspect; anything else is a distorted signature.
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(4, 1);
    // Padding split evenly: the leftover height is the same above and below.
    expect(minY).toBeCloseTo(plan.alto - maxY, 5);
    expect(minX).toBeCloseTo(plan.ancho - maxX, 5);
  });

  it("constrains the other axis when the signature is compact rather than wide", () => {
    const plan = planificarImagenDeFirma(trazosCompactos());

    const { minX, maxX, minY, maxY } = limitesDe(plan);
    // A 1:1 signature cannot fill a 3.5:1 frame; it fills the height and gets
    // padded horizontally, which is what keeps the *frame* at 3.5:1 so the
    // template gives it the full 70 mm box instead of a narrow strip.
    expect((maxY - minY) / plan.alto).toBeGreaterThan(0.97);
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(1, 1);
    expect(minX).toBeCloseTo(plan.ancho - maxX, 5);
  });

  it("is born at the frame's own 3.5:1 aspect, not at the viewport's", () => {
    for (const trazos of [trazosEnUnaEsquina(), trazosCompactos(), []]) {
      const plan = planificarImagenDeFirma(trazos);

      expect(plan.ancho / plan.alto).toBeCloseTo(3.5, 1);
      // The template gives the image `height: 20mm; max-width: 70mm; width:
      // auto`, so a 3.5:1 image prints at exactly the box's full width.
      const anchoImpresoMm = ALTO_IMPRESO_MM * (plan.ancho / plan.alto);
      expect(anchoImpresoMm).toBeLessThanOrEqual(ANCHO_MAXIMO_IMPRESO_MM);
      expect(anchoImpresoMm).toBeGreaterThan(69);
    }
  });

  it("prints a stroke as heavy as the comodante's, not the canvas 2D default", () => {
    const plan = planificarImagenDeFirma(trazosEnUnaEsquina());

    // The printed height is fixed at 20 mm by the template, so one output
    // pixel is 20/alto mm no matter what the tablet's viewport was.
    const mmPorPixel = ALTO_IMPRESO_MM / plan.alto;

    expect(plan.grosorDeTrazo * mmPorPixel).toBeCloseTo(GROSOR_DEL_COMODANTE_MM, 2);
    // The defect, stated as a number: the canvas default of 1 CSS px landed
    // at 0.0625 mm in the same box.
    expect(plan.grosorDeTrazo * mmPorPixel).toBeGreaterThan(0.0625 * 5);
  });

  it("keeps half the stroke inside the frame at every edge, so no cap is clipped", () => {
    const plan = planificarImagenDeFirma(trazosEnUnaEsquina());

    const { minX, maxX, minY, maxY } = limitesDe(plan);
    // The constrained axis lands exactly ON the margin, so this compares
    // against it with a float64 slack: `anchoTinta * (anchoUtil / anchoTinta)`
    // is `anchoUtil` in arithmetic and `anchoUtil ± 1e-13` in a double.
    const margen = plan.grosorDeTrazo / 2 - EPSILON;
    expect(minX).toBeGreaterThanOrEqual(margen);
    expect(minY).toBeGreaterThanOrEqual(margen);
    expect(maxX).toBeLessThanOrEqual(plan.ancho - margen);
    expect(maxY).toBeLessThanOrEqual(plan.alto - margen);
  });

  it("stays inside the signature-image budget for every input, because the frame is fixed", () => {
    const planes = [trazosEnUnaEsquina(), trazosCompactos(), []].map(planificarImagenDeFirma);

    for (const plan of planes) {
      // Not derived from the canvas any more, so no viewport and no
      // devicePixelRatio can inflate it. The reference PNG at exactly these
      // dimensions is 75,917 bytes — 101,223 base64 chars, a quarter of
      // `LARGO_MAXIMO_IMAGEN_FIRMA` (400,000), and this one carries fewer
      // strokes than the comodante's.
      expect(plan.ancho).toBe(ANCHO_IMAGEN_DE_FIRMA_PX);
      expect(plan.alto).toBe(ALTO_IMAGEN_DE_FIRMA_PX);
      expect(plan.grosorDeTrazo).toBe(GROSOR_DE_TRAZO_IMPRESO_PX);
      expect(plan.ancho * plan.alto).toBeLessThanOrEqual(1200 * 343);
    }
  });

  it("leaves the forensic stroke data byte-identical — the image is derived, never the evidence", () => {
    const trazos = trazosEnUnaEsquina();
    const antes = structuredClone(trazos);

    planificarImagenDeFirma(trazos);

    // DESIGN.md's signature-capture section: the image is "for the PDF", the
    // timestamped strokes are the forensic evidence. Transforming the first
    // is legitimate; touching the second is not.
    expect(trazos).toEqual(antes);
  });

  it("carries every stroke and every point through, in order", () => {
    const trazos = trazosEnUnaEsquina();

    const plan = planificarImagenDeFirma(trazos);

    expect(plan.trazos.map((trazo) => trazo.length)).toEqual(trazos.map((trazo) => trazo.length));
  });

  it("declares the frame even with nothing drawn, rather than a zero-sized image", () => {
    const plan = planificarImagenDeFirma([]);

    expect(plan.trazos).toEqual([]);
    expect(plan.ancho).toBeGreaterThan(0);
    expect(plan.alto).toBeGreaterThan(0);
  });

  it("survives degenerate ink — a flat line, and a single repeated point — with finite coordinates", () => {
    const linea = planificarImagenDeFirma([
      [punto(0, 40, 0), punto(300, 40, 5), punto(600, 40, 10)],
    ]);
    const unSoloPunto = planificarImagenDeFirma([[punto(80, 80, 0), punto(80, 80, 4)]]);

    for (const plan of [linea, unSoloPunto]) {
      for (const { x, y } of plan.trazos.flat()) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(plan.ancho);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(plan.alto);
      }
    }
    // A flat line has no height to scale, so the width is what fills.
    const { minX, maxX } = limitesDe(linea);
    expect((maxX - minX) / linea.ancho).toBeGreaterThan(0.98);
  });
});
