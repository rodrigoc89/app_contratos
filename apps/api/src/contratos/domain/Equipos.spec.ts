import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { Equipos } from "./Equipos";

const DATOS = {
  antenaModelo: "LiteBeam 5AC Gen2",
  antenaMac: "ac8ba9123456",
  poe: true,
  canoMetros: 6,
};

describe("Equipos", () => {
  it("builds the fixed set the contract lists in clause PRIMERA", () => {
    const equipos = Equipos.crear(DATOS);

    expect(equipos.antenaModelo).toBe("LiteBeam 5AC Gen2");
    expect(equipos.antenaMac.valor).toBe("AC:8B:A9:12:34:56");
    expect(equipos.poe).toBe(true);
    expect(equipos.canoMetros.valor).toBe(6);
  });

  it("accepts an installation without PoE", () => {
    expect(Equipos.crear({ ...DATOS, poe: false }).poe).toBe(false);
  });

  it("accepts an installation without mast tubing", () => {
    expect(Equipos.crear({ ...DATOS, canoMetros: 0 }).canoMetros.valor).toBe(0);
  });

  it("renders PoE the way the printed contract reads it", () => {
    expect(Equipos.crear(DATOS).poeImpreso).toBe("SI");
    expect(Equipos.crear({ ...DATOS, poe: false }).poeImpreso).toBe("NO");
  });

  it("trims the antenna model", () => {
    expect(Equipos.crear({ ...DATOS, antenaModelo: " LiteBeam " }).antenaModelo).toBe(
      "LiteBeam",
    );
  });

  describe("required fields", () => {
    it("rejects an empty antenna model", () => {
      expect(() => Equipos.crear({ ...DATOS, antenaModelo: "  " })).toThrow(
        DomainError,
      );
    });

    it("propagates an invalid MAC address", () => {
      expect(() => Equipos.crear({ ...DATOS, antenaMac: "nope" })).toThrow(
        DomainError,
      );
    });

    it("propagates invalid mast metres", () => {
      expect(() => Equipos.crear({ ...DATOS, canoMetros: -3 })).toThrow(
        DomainError,
      );
    });

    it("names the offending field", () => {
      expect(() => Equipos.crear({ ...DATOS, antenaModelo: "" })).toThrow(
        /antena/i,
      );
    });
  });
});
