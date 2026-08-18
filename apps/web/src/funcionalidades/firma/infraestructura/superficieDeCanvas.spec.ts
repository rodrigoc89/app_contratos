import { EsquemaImagenFirmaPng, type DatosTrazoFirma } from "@contratos/esquemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planificarImagenDeFirma } from "../logica/imagenDeFirma";
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
  vi.restoreAllMocks();
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

const PNG_DE_PRUEBA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Ink confined to one small region of a big canvas — the printed defect. */
const TRAZOS: readonly DatosTrazoFirma[] = [
  [
    { x: 500, y: 300, t: 0 },
    { x: 560, y: 280, t: 10 },
    { x: 700, y: 290, t: 20 },
  ],
  [
    { x: 520, y: 330, t: 0 },
    { x: 690, y: 330, t: 12 },
  ],
];

interface ContextoEspiado {
  lineCap: string;
  lineJoin: string;
  lineWidth: number;
  readonly beginPath: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
  readonly lineTo: ReturnType<typeof vi.fn>;
  readonly stroke: ReturnType<typeof vi.fn>;
  readonly clearRect: ReturnType<typeof vi.fn>;
}

function contextoEspiado(): ContextoEspiado {
  return {
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  };
}

function conContexto(canvas: HTMLCanvasElement, contexto: ContextoEspiado): HTMLCanvasElement {
  vi.spyOn(canvas, "getContext").mockReturnValue(contexto as unknown as CanvasRenderingContext2D);
  return canvas;
}

/** The off-screen canvas `aPngDataUri` draws the printed image on. */
function lienzoDeSalidaSimulado() {
  const contexto = contextoEspiado();
  const salida = conContexto(document.createElement("canvas"), contexto);
  const paraDataUrl = vi.spyOn(salida, "toDataURL").mockReturnValue(PNG_DE_PRUEBA);
  return { contexto, crearLienzoDeSalida: () => salida, paraDataUrl };
}

describe("crearSuperficieDeCanvas", () => {
  /**
   * The dominant cause of the hairline: nothing ever set `lineWidth`, so both
   * the on-screen stroke and the exported one were the canvas 2D default of
   * 1 CSS px.
   */
  it("dibujarSegmento strokes with a declared width, never the 1px canvas default", () => {
    const contexto = contextoEspiado();
    const canvas = conContexto(document.createElement("canvas"), contexto);

    crearSuperficieDeCanvas(canvas).dibujarSegmento({ x: 0, y: 0 }, { x: 10, y: 10 });

    expect(contexto.lineWidth).toBeGreaterThan(1);
    expect(contexto.lineCap).toBe("round");
  });

  it("aPngDataUri renders the strokes into an off-screen canvas of the printed frame, not the live one", () => {
    const { contexto, crearLienzoDeSalida, paraDataUrl } = lienzoDeSalidaSimulado();
    const enPantalla = document.createElement("canvas");
    const deLaPantalla = vi.spyOn(enPantalla, "toDataURL");

    const resultado = crearSuperficieDeCanvas(enPantalla, crearLienzoDeSalida).aPngDataUri(TRAZOS);

    const plan = planificarImagenDeFirma(TRAZOS);
    const salida = crearLienzoDeSalida();
    expect(resultado).toBe(PNG_DE_PRUEBA);
    expect(EsquemaImagenFirmaPng.safeParse(resultado).success).toBe(true);
    expect(paraDataUrl).toHaveBeenCalledWith("image/png");
    expect([salida.width, salida.height]).toEqual([plan.ancho, plan.alto]);
    expect(contexto.lineWidth).toBe(plan.grosorDeTrazo);
    // The whole point: the exported image is no longer whatever the tablet's
    // viewport happened to make the on-screen canvas.
    expect(deLaPantalla).not.toHaveBeenCalled();
  });

  it("aPngDataUri replays every captured stroke at the cropped, centred coordinates the plan gives", () => {
    const { contexto, crearLienzoDeSalida } = lienzoDeSalidaSimulado();

    crearSuperficieDeCanvas(document.createElement("canvas"), crearLienzoDeSalida).aPngDataUri(
      TRAZOS,
    );

    const plan = planificarImagenDeFirma(TRAZOS);
    // One path per stroke, opened at its first point and continued through
    // the rest — in capture order, which is what makes the picture the
    // customer's hand and not a scatter of segments.
    expect(contexto.beginPath).toHaveBeenCalledTimes(plan.trazos.length);
    expect(contexto.stroke).toHaveBeenCalledTimes(plan.trazos.length);
    expect(contexto.moveTo.mock.calls).toEqual(
      plan.trazos.map((trazo) => [trazo[0]?.x, trazo[0]?.y]),
    );
    expect(contexto.lineTo.mock.calls).toEqual(
      plan.trazos.flatMap((trazo) => trazo.slice(1).map(({ x, y }) => [x, y])),
    );
    // Cropped: ink that spanned 200 px of the capture canvas now spans the
    // whole frame, instead of being exported as a speck in an empty rectangle.
    const xs = [...contexto.moveTo.mock.calls, ...contexto.lineTo.mock.calls].flatMap(
      ([x]: readonly number[]) => (x === undefined ? [] : [x]),
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(plan.ancho * 0.98);
  });

  it("dibujarSegmento and limpiar do not throw against jsdom's null 2D context", () => {
    const canvas = document.createElement("canvas");
    const superficie = crearSuperficieDeCanvas(canvas);

    expect(() => superficie.dibujarSegmento({ x: 0, y: 0 }, { x: 10, y: 10 })).not.toThrow();
    expect(() => superficie.limpiar()).not.toThrow();
  });

  it("aPngDataUri falls back to the live canvas when there is no 2D context at all — jsdom's case, never a browser's", () => {
    const canvas = document.createElement("canvas");
    const paraDataUrl = vi.spyOn(canvas, "toDataURL").mockReturnValue(PNG_DE_PRUEBA);

    const resultado = crearSuperficieDeCanvas(canvas).aPngDataUri(TRAZOS);

    expect(resultado).toBe(PNG_DE_PRUEBA);
    expect(paraDataUrl).toHaveBeenCalledWith("image/png");
  });
});
