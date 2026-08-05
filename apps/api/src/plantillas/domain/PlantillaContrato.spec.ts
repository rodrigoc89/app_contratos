import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { PlantillaContrato } from "./PlantillaContrato";

const DATOS = {
  id: "plantilla-2026-01",
  version: "2026-01",
  condicionesGeneralesHtml: "<h1>CONDICIONES GENERALES DE USO</h1>",
  comodatoHtml: "<h1>CONTRATO DE COMODATO</h1>",
  vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
};

describe("PlantillaContrato", () => {
  it("carries the exact text a contract was signed against", () => {
    const plantilla = PlantillaContrato.crear(DATOS);

    expect(plantilla.id).toBe("plantilla-2026-01");
    expect(plantilla.version).toBe("2026-01");
    expect(plantilla.vigenteDesde.iso).toBe("2026-01-01");
  });

  it("carries a separate legal text for each of the two documents", () => {
    const plantilla = PlantillaContrato.crear(DATOS);

    expect(plantilla.contenidoDe("condiciones_generales")).toContain(
      "CONDICIONES GENERALES",
    );
    expect(plantilla.contenidoDe("comodato")).toContain("COMODATO");
  });

  describe("required content", () => {
    it("rejects a version without the general conditions text", () => {
      expect(() =>
        PlantillaContrato.crear({ ...DATOS, condicionesGeneralesHtml: "   " }),
      ).toThrow(DomainError);
    });

    it("rejects a version without the comodato text", () => {
      expect(() =>
        PlantillaContrato.crear({ ...DATOS, comodatoHtml: "" }),
      ).toThrow(DomainError);
    });

    it("names which document is missing", () => {
      expect(() =>
        PlantillaContrato.crear({ ...DATOS, comodatoHtml: "" }),
      ).toThrow(/comodato/i);
    });

    it("rejects a version with no identifier", () => {
      expect(() => PlantillaContrato.crear({ ...DATOS, version: "" })).toThrow(
        DomainError,
      );
    });
  });
});
