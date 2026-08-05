import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { PlantillaContrato } from "./PlantillaContrato";

const DATOS = {
  id: "plantilla-2026-01",
  version: "2026-01",
  contenidoHtml: "<h1>CONTRATO DE COMODATO</h1>",
  vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
};

describe("PlantillaContrato", () => {
  it("carries the exact text a contract was signed against", () => {
    const plantilla = PlantillaContrato.crear(DATOS);

    expect(plantilla.id).toBe("plantilla-2026-01");
    expect(plantilla.version).toBe("2026-01");
    expect(plantilla.contenidoHtml).toContain("COMODATO");
    expect(plantilla.vigenteDesde.iso).toBe("2026-01-01");
  });

  it("rejects a version without content, which would render an empty contract", () => {
    expect(() =>
      PlantillaContrato.crear({ ...DATOS, contenidoHtml: "   " }),
    ).toThrow(DomainError);
  });

  it("rejects a version with no identifier", () => {
    expect(() => PlantillaContrato.crear({ ...DATOS, version: "" })).toThrow(
      DomainError,
    );
  });
});
