import { describe, expect, it } from "vitest";

import { EsquemaFirmaCapturada, MAXIMO_PUNTOS_POR_TRAZO, MAXIMO_TRAZOS_POR_FIRMA } from "@contratos/esquemas";

import { crearCapturaDeFirma, muestraDesdePuntero, type CapturaDeFirma, type MuestraDePuntero } from "./capturaDeFirma";

/**
 * Spec `firma-capture` + DESIGN.md D5. `capturaDeFirma` is the DOM-free core:
 * no canvas, no `PointerEvent`, no jsdom. It is driven by plain
 * `MuestraDePuntero` samples a caller (the future `LienzoDeFirma`, PR12)
 * derives from real pointer events — the shape of that derivation is proven
 * here too, through `muestraDesdePuntero`, without needing a DOM event at
 * all.
 *
 * Scenario 10 ("nine points refused, ten accepted") and the pressure rule
 * (scenario 11) are proven against the *real* `EsquemaFirmaCapturada` from
 * `@contratos/esquemas`, not a hand-copied rule — a signature this core
 * produces is fed straight through the same schema the server enforces.
 */

const PNG_MARCADOR = "data:image/png;base64,QQ==";

function muestra(x: number, y: number, tiempoMs: number, presion?: number): MuestraDePuntero {
  return presion === undefined ? { x, y, tiempoMs } : { x, y, tiempoMs, presion };
}

function firmaCandidata(captura: CapturaDeFirma): unknown {
  return {
    documento: "condiciones_generales",
    imagenPng: PNG_MARCADOR,
    trazos: captura.trazos(),
  };
}

describe("crearCapturaDeFirma", () => {
  it("starts with no strokes and no points", () => {
    const captura = crearCapturaDeFirma();
    expect(captura.trazos()).toHaveLength(0);
    expect(captura.cantidadPuntos).toBe(0);
  });

  it("agregarPunto without an open stroke is a no-op — there is nothing to add to", () => {
    const captura = crearCapturaDeFirma();
    captura.agregarPunto(muestra(1, 1, 1));
    expect(captura.trazos()).toHaveLength(0);
    expect(captura.cantidadPuntos).toBe(0);
  });

  it("terminarTrazo does not discard the stroke that was just captured", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 0));
    captura.agregarPunto(muestra(5, 0, 10));
    captura.terminarTrazo();
    expect(captura.trazos()).toHaveLength(1);
    expect(captura.trazos()[0]).toHaveLength(2);
  });

  it("scenario 10 — nine points across the whole signature are refused by the real server schema", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 0));
    for (let i = 1; i < 9; i += 1) {
      captura.agregarPunto(muestra(i * 5, 0, i * 10));
    }
    expect(captura.cantidadPuntos).toBe(9);

    const resultado = EsquemaFirmaCapturada.safeParse(firmaCandidata(captura));
    expect(resultado.success).toBe(false);
  });

  it("scenario 10 — a tenth point makes the same signature accepted by the real server schema", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 0));
    for (let i = 1; i < 10; i += 1) {
      captura.agregarPunto(muestra(i * 5, 0, i * 10));
    }
    expect(captura.cantidadPuntos).toBe(10);

    const resultado = EsquemaFirmaCapturada.safeParse(firmaCandidata(captura));
    expect(resultado.success).toBe(true);
  });

  it("a stroke cannot exceed the server's per-stroke point cap; extra samples are dropped, not rejected", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 0));
    for (let i = 1; i <= MAXIMO_PUNTOS_POR_TRAZO + 5; i += 1) {
      captura.agregarPunto(muestra(i, 0, i));
    }
    const [trazo] = captura.trazos();
    expect(trazo).toHaveLength(MAXIMO_PUNTOS_POR_TRAZO);
  });

  it("a signature cannot exceed the server's stroke cap; extra strokes are dropped", () => {
    const captura = crearCapturaDeFirma();
    for (let i = 0; i < MAXIMO_TRAZOS_POR_FIRMA + 3; i += 1) {
      captura.iniciarTrazo(muestra(i, 0, i));
    }
    expect(captura.trazos()).toHaveLength(MAXIMO_TRAZOS_POR_FIRMA);
  });

  it("samples closer than ~0.5 CSS px to the previous point in the same stroke are dropped as noise", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 0));
    captura.agregarPunto(muestra(0.1, 0, 10));
    expect(captura.trazos()[0]).toHaveLength(1);

    captura.agregarPunto(muestra(5, 0, 20));
    expect(captura.trazos()[0]).toHaveLength(2);
  });

  it("a regressing sample's time is clamped to the previous point's time within a stroke, never rejected", () => {
    const captura = crearCapturaDeFirma();
    captura.iniciarTrazo(muestra(0, 0, 100));
    captura.agregarPunto(muestra(5, 0, 40));

    const [trazo] = captura.trazos();
    expect(trazo?.[0]?.t).toBe(100);
    expect(trazo?.[1]?.t).toBe(100);
  });
});

describe("muestraDesdePuntero", () => {
  it("omits presión for mouse input, even though the browser reports a constant 0.5", () => {
    const resultado = muestraDesdePuntero({ x: 1, y: 2, tiempoMs: 10, pointerType: "mouse", pressure: 0.5 });
    expect(resultado).not.toHaveProperty("presion");
  });

  it("omits presión for touch input, for the same reason", () => {
    const resultado = muestraDesdePuntero({ x: 1, y: 2, tiempoMs: 10, pointerType: "touch", pressure: 0.5 });
    expect(resultado).not.toHaveProperty("presion");
  });

  it("records presión for a real pen reading above zero", () => {
    const resultado = muestraDesdePuntero({ x: 1, y: 2, tiempoMs: 10, pointerType: "pen", pressure: 0.73 });
    expect(resultado.presion).toBe(0.73);
  });

  it("omits presión even for a pen when the reported pressure is zero — not meaningfully present", () => {
    const resultado = muestraDesdePuntero({ x: 1, y: 2, tiempoMs: 10, pointerType: "pen", pressure: 0 });
    expect(resultado).not.toHaveProperty("presion");
  });
});
