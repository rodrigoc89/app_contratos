import { describe, expect, it } from "vitest";

import { DomainError } from "./DomainError";
import { FechaCalendario } from "./FechaCalendario";

const CORDOBA = "America/Argentina/Cordoba";

describe("FechaCalendario", () => {
  describe("construction", () => {
    it("builds from year, month and day", () => {
      const fecha = FechaCalendario.crear(2026, 8, 4);

      expect(fecha.anio).toBe(2026);
      expect(fecha.mes).toBe(8);
      expect(fecha.dia).toBe(4);
    });

    it("builds from an ISO date string", () => {
      expect(FechaCalendario.desdeIso("2026-08-04").iso).toBe("2026-08-04");
    });

    it("rejects a month outside the calendar", () => {
      expect(() => FechaCalendario.crear(2026, 13, 1)).toThrow(DomainError);
    });

    it("rejects a day the month does not have", () => {
      expect(() => FechaCalendario.crear(2026, 2, 30)).toThrow(DomainError);
    });

    it("rejects the 29th of February on a non-leap year", () => {
      expect(() => FechaCalendario.crear(2026, 2, 29)).toThrow(DomainError);
    });

    it("accepts the 29th of February on a leap year", () => {
      expect(FechaCalendario.crear(2024, 2, 29).iso).toBe("2024-02-29");
    });

    it("rejects a malformed ISO string", () => {
      expect(() => FechaCalendario.desdeIso("04/08/2026")).toThrow(DomainError);
    });
  });

  describe("reading an instant as a calendar date", () => {
    it("uses the given timezone, not UTC", () => {
      // 21:30 in Argentina is already the next day in UTC. A contract signed
      // that evening must not be dated tomorrow.
      const instante = new Date("2026-08-04T21:30:00-03:00");

      expect(FechaCalendario.enZona(instante, CORDOBA).iso).toBe("2026-08-04");
      expect(instante.toISOString().slice(0, 10)).toBe("2026-08-05");
    });

    it("reads an early morning instant correctly", () => {
      const instante = new Date("2026-08-04T00:15:00-03:00");

      expect(FechaCalendario.enZona(instante, CORDOBA).iso).toBe("2026-08-04");
    });
  });

  describe("adding months", () => {
    it("adds the ten-year comodato term", () => {
      const firma = FechaCalendario.desdeIso("2026-08-04");

      expect(firma.sumarMeses(120).iso).toBe("2036-08-04");
    });

    it("rolls over the year boundary", () => {
      expect(FechaCalendario.desdeIso("2026-11-15").sumarMeses(3).iso).toBe(
        "2027-02-15",
      );
    });

    it("clamps to the last day when the target month is shorter", () => {
      expect(FechaCalendario.desdeIso("2026-01-31").sumarMeses(1).iso).toBe(
        "2026-02-28",
      );
    });

    it("clamps a leap day to the 28th on a non-leap year", () => {
      expect(FechaCalendario.desdeIso("2024-02-29").sumarMeses(12).iso).toBe(
        "2025-02-28",
      );
    });

    it("keeps the leap day when the target year is also a leap year", () => {
      expect(FechaCalendario.desdeIso("2024-02-29").sumarMeses(48).iso).toBe(
        "2028-02-29",
      );
    });
  });

  describe("comparison", () => {
    it("recognises an earlier date", () => {
      const antes = FechaCalendario.desdeIso("2026-08-04");
      const despues = FechaCalendario.desdeIso("2026-08-05");

      expect(antes.esAnteriorA(despues)).toBe(true);
      expect(despues.esAnteriorA(antes)).toBe(false);
    });

    it("treats the same date as equal", () => {
      const una = FechaCalendario.desdeIso("2026-08-04");
      const otra = FechaCalendario.crear(2026, 8, 4);

      expect(una.esIgualA(otra)).toBe(true);
      expect(una.esAnteriorA(otra)).toBe(false);
    });
  });

  describe("presentation for the printed contract", () => {
    it("formats as day/month/year", () => {
      expect(FechaCalendario.desdeIso("2026-08-04").formateado).toBe(
        "04/08/2026",
      );
    });

    it("names the month in Spanish, as the closing clause requires", () => {
      // "a los ___ días del mes de ___ del año 20__"
      expect(FechaCalendario.desdeIso("2026-08-04").nombreMes).toBe("agosto");
      expect(FechaCalendario.desdeIso("2026-12-01").nombreMes).toBe("diciembre");
    });
  });
});
