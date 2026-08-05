import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Plazo, PLAZO_ESTANDAR_MESES } from "./Plazo";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");

describe("Plazo", () => {
  it("uses a ten-year standard term, as agreed with the business", () => {
    expect(PLAZO_ESTANDAR_MESES).toBe(120);
  });

  describe("derivation", () => {
    it("derives the expiry from the start date and the term", () => {
      const plazo = Plazo.estandarDesde(FIRMA);

      expect(plazo.fechaInicio.iso).toBe("2026-08-04");
      expect(plazo.meses).toBe(120);
      expect(plazo.fechaVencimiento.iso).toBe("2036-08-04");
    });

    it("derives the expiry for a non-standard term too", () => {
      const plazo = Plazo.crear(FIRMA, 18);

      expect(plazo.fechaVencimiento.iso).toBe("2028-02-04");
    });

    it("clamps the expiry when the target month is shorter", () => {
      const plazo = Plazo.crear(FechaCalendario.desdeIso("2026-08-31"), 6);

      expect(plazo.fechaVencimiento.iso).toBe("2027-02-28");
    });
  });

  describe("invariants", () => {
    it("rejects a term of zero months", () => {
      expect(() => Plazo.crear(FIRMA, 0)).toThrow(DomainError);
    });

    it("rejects a negative term", () => {
      expect(() => Plazo.crear(FIRMA, -12)).toThrow(DomainError);
    });

    it("rejects a fractional term, since the contract reads in whole months", () => {
      expect(() => Plazo.crear(FIRMA, 12.5)).toThrow(DomainError);
    });

    it("explains what is wrong", () => {
      expect(() => Plazo.crear(FIRMA, 0)).toThrow(/plazo|mes/i);
    });
  });

  describe("expiry awareness, for the office report", () => {
    it("knows it has not expired before the expiry date", () => {
      const plazo = Plazo.estandarDesde(FIRMA);

      expect(plazo.estaVencidoAl(FechaCalendario.desdeIso("2036-08-03"))).toBe(
        false,
      );
    });

    it("is not yet expired on the expiry date itself", () => {
      const plazo = Plazo.estandarDesde(FIRMA);

      expect(plazo.estaVencidoAl(FechaCalendario.desdeIso("2036-08-04"))).toBe(
        false,
      );
    });

    it("is expired the day after the expiry date", () => {
      const plazo = Plazo.estandarDesde(FIRMA);

      expect(plazo.estaVencidoAl(FechaCalendario.desdeIso("2036-08-05"))).toBe(
        true,
      );
    });
  });
});
