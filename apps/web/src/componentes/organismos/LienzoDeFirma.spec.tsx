import { EsquemaImagenFirmaPng, EsquemaTrazoFirma } from "@contratos/esquemas";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Punto, SuperficieDeFirma } from "../../funcionalidades/firma/logica/superficieDeFirma";
import { LienzoDeFirma, type DatosLienzoDeFirma } from "./LienzoDeFirma";

/**
 * DESIGN.md D5 — `LienzoDeFirma` is a thin shell: the DOM-free rules (point
 * caps, `t` clamping, the pen-only pressure gate) already have exhaustive
 * proof in `capturaDeFirma.spec.ts` (PR10/PR11), with no DOM at all. What is
 * new and untested until this PR is the *wiring*: that real `PointerEvent`s
 * reach that core as the right samples, that `touch-action: none` is really
 * set, that pointer capture is really requested, and that the surface's
 * `aPngDataUri()` output reaches the caller unmangled — proven against the
 * real server-side schema, never a hand-written string. No canvas pixel is
 * asserted anywhere in this file.
 */

const PNG_DE_PRUEBA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function superficieFalsa(): {
  superficie: SuperficieDeFirma;
  segmentos: ReadonlyArray<readonly [Punto, Punto]>;
  vecesLimpiada: () => number;
  /** What the last `aPngDataUri` call was asked to render. */
  trazosExportados: () => ReadonlyArray<ReadonlyArray<Punto>> | null;
} {
  const segmentos: Array<readonly [Punto, Punto]> = [];
  let limpiezas = 0;
  let exportados: ReadonlyArray<ReadonlyArray<Punto>> | null = null;
  return {
    superficie: {
      dibujarSegmento(a, b) {
        segmentos.push([a, b]);
      },
      limpiar() {
        limpiezas += 1;
      },
      aPngDataUri(trazos) {
        exportados = trazos;
        return PNG_DE_PRUEBA;
      },
    },
    segmentos,
    vecesLimpiada: () => limpiezas,
    trazosExportados: () => exportados,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // jsdom does not implement setPointerCapture at all — polyfilled per test
  // below where needed, and removed again so it never leaks between tests.
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
});

describe("LienzoDeFirma", () => {
  it("sets touch-action: none on the canvas — without it the browser scrolls the page instead of drawing", () => {
    const { superficie } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma del comodatario" crearSuperficie={() => superficie} />);

    const lienzo = screen.getByRole("img", { name: "Firma del comodatario" });

    expect(lienzo.style.touchAction).toBe("none");
  });

  it("requests pointer capture on pointerdown so a stroke survives the finger leaving the canvas", () => {
    const solicitarCaptura = vi.fn();
    HTMLElement.prototype.setPointerCapture = solicitarCaptura;
    const { superficie } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} />);
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 7, clientX: 10, clientY: 10, pointerType: "touch" });

    expect(solicitarCaptura).toHaveBeenCalledWith(7);
  });

  it("feeds real pointer coordinates into the core and the surface — a schema-valid stroke, drawn segment by segment", () => {
    const { superficie, segmentos } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 10, clientY: 20, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 60, clientY: 20, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 60, clientY: 20, pointerType: "touch" });

    const trazos = ultimoCambio?.captura.trazos();
    expect(trazos).toHaveLength(1);
    const [trazo] = trazos ?? [];
    expect(trazo?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
    ]);
    // Real schema, not a hand-copied shape check — proves `t` is finite,
    // non-negative and non-decreasing within the stroke without this test
    // re-deriving that rule itself.
    expect(EsquemaTrazoFirma.safeParse(trazo).success).toBe(true);
    // Wired to the injected drawing surface too, not just the capture core.
    expect(segmentos).toEqual([[{ x: 10, y: 20 }, { x: 60, y: 20 }]]);
  });

  it("records pressure only for a pen pointer above zero — a mouse/touch sample carries no presion key", () => {
    const { superficie } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    // `pressure` is a `float` on the real `PointerEvent` (single-precision),
    // so only values with an exact float32 representation round-trip
    // through `fireEvent` unchanged — 0.5 and 0.75 both do.
    fireEvent.pointerDown(lienzo, {
      pointerId: 2,
      clientX: 0,
      clientY: 0,
      pointerType: "pen",
      pressure: 0.5,
    });
    fireEvent.pointerMove(lienzo, {
      pointerId: 2,
      clientX: 20,
      clientY: 0,
      pointerType: "pen",
      pressure: 0.75,
    });
    fireEvent.pointerUp(lienzo, { pointerId: 2, clientX: 20, clientY: 0, pointerType: "pen" });

    const [trazo] = ultimoCambio?.captura.trazos() ?? [];
    expect(trazo?.map((punto) => punto.presion)).toEqual([0.5, 0.75]);

    fireEvent.pointerDown(lienzo, { pointerId: 3, clientX: 0, clientY: 5, pointerType: "mouse" });
    fireEvent.pointerMove(lienzo, { pointerId: 3, clientX: 20, clientY: 5, pointerType: "mouse" });
    fireEvent.pointerUp(lienzo, { pointerId: 3, clientX: 20, clientY: 5, pointerType: "mouse" });

    const trazoRaton = ultimoCambio?.captura.trazos().at(-1);
    expect(trazoRaton?.every((punto) => !("presion" in punto))).toBe(true);
  });

  it("fans a coalesced pointermove event out into every intermediate sample, so a fast stroke keeps its points", () => {
    const { superficie } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });

    const eventoConCoalescencia = new PointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 30,
      clientY: 0,
      bubbles: true,
      cancelable: true,
    });
    vi.spyOn(eventoConCoalescencia, "getCoalescedEvents").mockReturnValue([
      new PointerEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 0 }),
      new PointerEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: 30, clientY: 0 }),
    ]);
    fireEvent(lienzo, eventoConCoalescencia);
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 30, clientY: 0, pointerType: "touch" });

    const [trazo] = ultimoCambio?.captura.trazos() ?? [];
    expect(trazo?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it("produces a PNG data URI that matches the real server-side schema — the surface's own output, unmangled", () => {
    const { superficie } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });

    expect(ultimoCambio?.imagenPng).toBe(PNG_DE_PRUEBA);
    expect(EsquemaImagenFirmaPng.safeParse(ultimoCambio?.imagenPng).success).toBe(true);
  });

  /**
   * The printed signature used to be the visible canvas exported whole, so
   * its size and stroke weight were whatever the tablet's viewport made them
   * — `.lienzo-de-firma__lienzo` is `height: 40vh`. The surface is handed the
   * captured strokes instead and re-draws them at the size the PDF prints
   * at; this proves the wiring, not the pixels.
   */
  it("exports from the captured strokes, not from whatever the viewport made the canvas", () => {
    const { superficie, trazosExportados } = superficieFalsa();
    // `onCambia` is what makes the export happen at all: `notificarCambio`
    // calls it optionally, and an optional call never evaluates its argument.
    render(
      <LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} onCambia={() => {}} />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 4, clientY: 8, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 40, clientY: 8, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 40, clientY: 8, pointerType: "touch" });

    expect(trazosExportados()?.map((trazo) => trazo.map(({ x, y }) => ({ x, y })))).toEqual([
      [
        { x: 4, y: 8 },
        { x: 40, y: 8 },
      ],
    ]);
  });

  it("borrar discards every stroke and clears the surface — scenario: clear and re-capture", async () => {
    const usuario = userEvent.setup();
    const { superficie, vecesLimpiada } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });
    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    expect(ultimoCambio?.captura.trazos()).toHaveLength(1);

    await usuario.click(screen.getByRole("button", { name: "Borrar" }));

    expect(ultimoCambio?.captura.trazos()).toEqual([]);
    expect(vecesLimpiada()).toBeGreaterThan(0);
  });

  it("deshacer removes only the most recently drawn stroke", async () => {
    const usuario = userEvent.setup();
    const { superficie } = superficieFalsa();
    let ultimoCambio: DatosLienzoDeFirma | undefined;
    render(
      <LienzoDeFirma
        etiqueta="Firma"
        crearSuperficie={() => superficie}
        onCambia={(datos) => {
          ultimoCambio = datos;
        }}
      />,
    );
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 20, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 20, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 20, pointerType: "touch" });
    expect(ultimoCambio?.captura.trazos()).toHaveLength(2);

    await usuario.click(screen.getByRole("button", { name: "Deshacer" }));

    const restantes = ultimoCambio?.captura.trazos();
    expect(restantes).toHaveLength(1);
    expect(restantes?.[0]?.[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("does not crash against jsdom's null 2D context when no fake surface is injected — the real canvas surface", () => {
    render(<LienzoDeFirma etiqueta="Firma" />);
    const lienzo = screen.getByRole("img", { name: "Firma" });

    expect(() => {
      fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
      fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
      fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    }).not.toThrow();
  });

  it("carries the bounded signature-canvas classes (design-system-migration PR13) — vh-boundedness itself is policed by guard 19 in convencionesDeUtilidades.spec.ts, not here", () => {
    const { superficie } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} />);
    const lienzo = screen.getByRole("img", { name: "Firma" });

    expect(lienzo.className).toMatch(/\bh-\[40vh\]/);
    expect(lienzo.className).not.toMatch(/\bh-auto\b/);
    expect(lienzo.className).not.toMatch(/\bmin-h-/);
  });

  /**
   * PR25 — a rotation on a real Android tablet changed the canvas's CSS box
   * without ever re-measuring the backing store, so the drawing surface
   * stretched a stale bitmap into the new box and the stroke stopped
   * tracking the finger. These three tests prove the seam, not pixels:
   * jsdom gives a zero-size rect and a null 2D context, so nothing here can
   * assert what the surface actually looks like on screen.
   */
  it("re-measures the canvas backing store on a window resize, not just once on mount — the rotation bug", () => {
    const { superficie } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} />);
    const lienzo = screen.getByRole<HTMLCanvasElement>("img", { name: "Firma" });
    expect(lienzo.width).toBe(0); // jsdom's default zero-size rect, at mount

    vi.spyOn(lienzo, "getBoundingClientRect").mockReturnValue({
      width: 600,
      height: 300,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 600,
      bottom: 300,
      toJSON: () => ({}),
    });
    fireEvent(window, new Event("resize"));

    expect(lienzo.width).toBe(600);
    expect(lienzo.height).toBe(300);
  });

  it("re-renders every captured stroke after a window resize, so a rotation never erases an in-progress signature", () => {
    const { superficie, segmentos, vecesLimpiada } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} />);
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 10, clientY: 0, pointerType: "touch" });
    const limpiezasAntes = vecesLimpiada();

    fireEvent(window, new Event("resize"));

    expect(vecesLimpiada()).toBeGreaterThan(limpiezasAntes);
    // The replayed segment comes from the captured points, not the DOM rect
    // — the same coordinates the customer actually drew, unmodified.
    expect(segmentos.at(-1)?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("also re-renders on orientationchange — the event that actually fires on a tablet rotation", () => {
    const { superficie, segmentos, vecesLimpiada } = superficieFalsa();
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficie} />);
    const lienzo = screen.getByRole("img", { name: "Firma" });

    fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 5, clientY: 5, pointerType: "touch" });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 15, clientY: 5, pointerType: "touch" });
    fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: 15, clientY: 5, pointerType: "touch" });
    const limpiezasAntes = vecesLimpiada();

    fireEvent(window, new Event("orientationchange"));

    expect(vecesLimpiada()).toBeGreaterThan(limpiezasAntes);
    expect(segmentos.at(-1)?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    ]);
  });
});

describe("LienzoDeFirma — destructive action (PR25)", () => {
  it("marks Borrar as destructive in the DOM, so the danger colour is bound to the action and not to its position", () => {
    render(<LienzoDeFirma etiqueta="Firma" />);

    const borrar = screen.getByRole("button", { name: "Borrar" });
    const deshacer = screen.getByRole("button", { name: "Deshacer" });

    // Borrar discards every stroke the customer already made; Deshacer
    // removes one. Only the unrecoverable one carries the warning.
    // design-system-migration PR7 — the BEM `.boton--destructivo` modifier
    // is replaced by Boton's cva `destructivo` variant, which colours by
    // its own prop rather than a class a caller could paste onto the wrong
    // button; `bg-error` is its resolved marker.
    expect(borrar).toHaveClass("bg-error");
    expect(deshacer).not.toHaveClass("bg-error");

    // The shared base class must survive alongside the variant — the atom
    // used to overwrite an incoming className outright.
    expect(borrar).toHaveClass("inline-flex");
  });
});

/**
 * The canvas used to be sized by an inline `height: 100%` against a wrapper
 * pinned to `40vh`, so it consumed the wrapper whole and `__acciones`
 * (Deshacer/Borrar) was laid out past the bottom of its own parent. Normal
 * flow reserves no space for overflow, so the NEXT document's iframe was
 * placed over them. Measured with `elementFromPoint` at each button's centre,
 * against the running app:
 *
 *   ✗ Deshacer  tapado por <iframe class="visor-documento__iframe">
 *   ✗ Borrar    tapado por <iframe class="visor-documento__iframe">
 *
 * On the phone AND on the tablet — it was never phone-specific.
 *
 * An inline height is what makes this unfixable from the stylesheet: inline
 * wins over any rule, so the bound has to live in CSS for the sheet to be
 * able to state it.
 */
describe("LienzoDeFirma — la superficie se acota desde la hoja, no en línea", () => {
  it("sets no inline height, so the stylesheet's bound is the one that applies", () => {
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficieFalsa().superficie} />);

    const lienzo = screen.getByRole("img", { name: "Firma" });
    expect(lienzo.style.height).toBe("");
    expect(lienzo.style.width).toBe("");
  });

  it("still disables native touch gestures inline — that one has to win", () => {
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficieFalsa().superficie} />);

    expect(screen.getByRole("img", { name: "Firma" }).style.touchAction).toBe("none");
  });

  /** The buttons are inside the wrapper; nothing may push them out of it. */
  it("keeps the actions inside the same element as the canvas", () => {
    render(<LienzoDeFirma etiqueta="Firma" crearSuperficie={() => superficieFalsa().superficie} />);

    const lienzo = screen.getByRole("img", { name: "Firma" });
    const envoltorio = lienzo.parentElement;
    const acciones = screen.getByRole("button", { name: "Deshacer" }).parentElement;

    // `data-lienzo-de-firma` (design-system-migration PR13) — same
    // `data-*` hook pattern `[data-cabecera-de-sesion]` established: a
    // Tailwind wrapper carries no stable BEM class name to assert on.
    expect(envoltorio?.hasAttribute("data-lienzo-de-firma")).toBe(true);
    expect(envoltorio?.contains(acciones ?? null)).toBe(true);
  });
});
