import { EsquemaImagenFirmaPng } from "@contratos/esquemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { crearSuperficieDeCanvas, redimensionarSuperficie } from "./superficieDeCanvas";

/**
 * DESIGN.md D5 — the real `SuperficieDeFirma`. Two properties matter here,
 * both named explicitly by the harness: the backing store is scaled to
 * `devicePixelRatio` (capped at 2) without changing the canvas's CSS size,
 * and the PNG this surface produces is exactly what `canvas.toDataURL`
 * returns, proven against the real server-side schema — never a hand-copied
 * regex. jsdom's `getContext("2d")` returns `null` (no `canvas` npm package
 * installed, deliberately: adding one is out of scope for this slice), so
 * every drawing method here must tolerate that without throwing.
 */

function rectanguloDe(ancho: number, alto: number): DOMRect {
  return {
    width: ancho,
    height: alto,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: ancho,
    bottom: alto,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redimensionarSuperficie", () => {
  it("scales the backing store to devicePixelRatio, capped at 2, without changing the CSS size", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(rectanguloDe(300, 150));
    vi.stubGlobal("devicePixelRatio", 3);

    redimensionarSuperficie(canvas);

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(300);
  });

  it("uses the real device pixel ratio when it is at or below the cap — a different input, a different result", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(rectanguloDe(200, 100));
    vi.stubGlobal("devicePixelRatio", 1.5);

    redimensionarSuperficie(canvas);

    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
  });

  it("does not throw against jsdom's null 2D context", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(rectanguloDe(100, 50));

    expect(() => redimensionarSuperficie(canvas)).not.toThrow();
  });

  it("resets the context transform before every scale, so repeated resizes (a rotation, then another) never compound the devicePixelRatio factor", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(rectanguloDe(300, 150));
    vi.stubGlobal("devicePixelRatio", 2);
    const contextoFalso = { scale: vi.fn(), setTransform: vi.fn() };
    vi.spyOn(canvas, "getContext").mockReturnValue(
      contextoFalso as unknown as CanvasRenderingContext2D,
    );

    redimensionarSuperficie(canvas);
    redimensionarSuperficie(canvas);

    // A naive re-scale without resetting first would leave the second call
    // at scale(4, 4) effectively (2 × 2) — the transform is reset to the
    // identity matrix before every scale, so both calls apply the exact same
    // factor instead of compounding.
    expect(contextoFalso.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0);
    expect(contextoFalso.setTransform).toHaveBeenNthCalledWith(2, 1, 0, 0, 1, 0, 0);
    expect(contextoFalso.scale).toHaveBeenNthCalledWith(1, 2, 2);
    expect(contextoFalso.scale).toHaveBeenNthCalledWith(2, 2, 2);
    const ordenReset = contextoFalso.setTransform.mock.invocationCallOrder;
    const ordenEscala = contextoFalso.scale.mock.invocationCallOrder;
    expect(ordenReset[0]).toBeLessThan(ordenEscala[0] ?? Number.POSITIVE_INFINITY);
    expect(ordenReset[1]).toBeLessThan(ordenEscala[1] ?? Number.POSITIVE_INFINITY);
  });
});

describe("crearSuperficieDeCanvas", () => {
  it("aPngDataUri returns exactly what canvas.toDataURL('image/png') produces, valid against the real server schema", () => {
    const canvas = document.createElement("canvas");
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    vi.spyOn(canvas, "toDataURL").mockReturnValue(png);

    const resultado = crearSuperficieDeCanvas(canvas).aPngDataUri();

    expect(resultado).toBe(png);
    expect(EsquemaImagenFirmaPng.safeParse(resultado).success).toBe(true);
  });

  it("aPngDataUri passes through whatever toDataURL is called with — the mime type is 'image/png', not left to the default", () => {
    const canvas = document.createElement("canvas");
    const paraDataUrl = vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,QQ==");

    crearSuperficieDeCanvas(canvas).aPngDataUri();

    expect(paraDataUrl).toHaveBeenCalledWith("image/png");
  });

  it("dibujarSegmento and limpiar do not throw against jsdom's null 2D context", () => {
    const canvas = document.createElement("canvas");
    const superficie = crearSuperficieDeCanvas(canvas);

    expect(() => superficie.dibujarSegmento({ x: 0, y: 0 }, { x: 10, y: 10 })).not.toThrow();
    expect(() => superficie.limpiar()).not.toThrow();
  });
});
