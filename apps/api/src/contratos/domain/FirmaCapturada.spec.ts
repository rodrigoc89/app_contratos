import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FirmaCapturada, MINIMO_PUNTOS_FIRMA } from "./FirmaCapturada";

const IMAGEN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

/** A plausible stroke: `puntos` samples spaced 16 ms apart, as a 60 Hz pen. */
const trazo = (puntos: number, desde = 0): { x: number; y: number; t: number }[] =>
  Array.from({ length: puntos }, (_, i) => ({
    x: 10 + i,
    y: 20 + (i % 5),
    t: desde + i * 16,
  }));

const firmaValida = () =>
  FirmaCapturada.crear({
    documento: "comodato",
    imagenPng: IMAGEN,
    trazos: [trazo(12), trazo(8, 400)],
  });

describe("FirmaCapturada", () => {
  describe("a genuine signature", () => {
    it("keeps which document it belongs to", () => {
      expect(firmaValida().documento).toBe("comodato");
    });

    it("keeps the rendered image for the PDF", () => {
      expect(firmaValida().imagenPng).toBe(IMAGEN);
    });

    it("keeps every stroke as forensic evidence", () => {
      expect(firmaValida().cantidadTrazos).toBe(2);
      expect(firmaValida().cantidadPuntos).toBe(20);
    });

    it("knows how long the person took to sign", () => {
      // First sample at 0 ms, last at 400 + 7*16 = 512 ms.
      expect(firmaValida().duracionMs).toBe(512);
    });

    it("accepts the general conditions document too", () => {
      const firma = FirmaCapturada.crear({
        documento: "condiciones_generales",
        imagenPng: IMAGEN,
        trazos: [trazo(15)],
      });

      expect(firma.documento).toBe("condiciones_generales");
    });

    it("records pen pressure when the tablet reports it", () => {
      const firma = FirmaCapturada.crear({
        documento: "comodato",
        imagenPng: IMAGEN,
        trazos: [trazo(12).map((p) => ({ ...p, presion: 0.5 }))],
      });

      expect(firma.trazos[0]?.[0]?.presion).toBe(0.5);
    });
  });

  describe("rejects what is not a signature", () => {
    it("rejects a tap, which is a finger touching the screen and nothing more", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [[{ x: 10, y: 10, t: 0 }]],
        }),
      ).toThrow(DomainError);
    });

    it("states the minimum, so the UI can ask for a real signature", () => {
      expect(MINIMO_PUNTOS_FIRMA).toBeGreaterThan(1);
    });

    it("rejects a capture with no strokes at all", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [],
        }),
      ).toThrow(DomainError);
    });

    it("rejects an empty stroke", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [trazo(12), []],
        }),
      ).toThrow(DomainError);
    });

    it("rejects a missing image, since the PDF has nothing to print", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: "  ",
          trazos: [trazo(12)],
        }),
      ).toThrow(DomainError);
    });

    it("rejects a point with non-finite coordinates", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [[...trazo(11), { x: Number.NaN, y: 1, t: 999 }]],
        }),
      ).toThrow(DomainError);
    });

    it("rejects timestamps that go backwards inside a stroke", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [[...trazo(11), { x: 1, y: 1, t: 5 }]],
        }),
      ).toThrow(DomainError);
    });

    it("explains that it needs a real signature", () => {
      expect(() =>
        FirmaCapturada.crear({
          documento: "comodato",
          imagenPng: IMAGEN,
          trazos: [[{ x: 1, y: 1, t: 0 }]],
        }),
      ).toThrow(/firma/i);
    });
  });

  describe("immutability of the evidence", () => {
    it("does not let the caller mutate the strokes afterwards", () => {
      const firma = firmaValida();
      const trazos = firma.trazos as unknown as unknown[];

      expect(() => trazos.push([])).toThrow();
      expect(firma.cantidadTrazos).toBe(2);
    });
  });
});
