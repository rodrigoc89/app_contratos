import { describe, expect, it } from "vitest";

import { columnaFechaDesde } from "../../../shared/infrastructure/persistence/columnaFecha";
import { FechaCalendario } from "../../../shared/domain/FechaCalendario";
import { plantillaContratoDesdeFila } from "./PlantillaContratoMapper";

describe("plantillaContratoDesdeFila", () => {
  it("maps a stored row to the domain PlantillaContrato", () => {
    const plantilla = plantillaContratoDesdeFila({
      id: "plantilla-2026-01",
      version: "2026-01",
      contenidoHtml: "<html>...</html>",
      vigenteDesde: columnaFechaDesde(FechaCalendario.desdeIso("2026-01-01")),
    });

    expect(plantilla.id).toBe("plantilla-2026-01");
    expect(plantilla.version).toBe("2026-01");
    expect(plantilla.contenidoHtml).toBe("<html>...</html>");
    expect(plantilla.vigenteDesde.iso).toBe("2026-01-01");
  });

  it("reads the vigente_desde column as UTC, regardless of host timezone", () => {
    // Exactly what Prisma hands back for a @db.Date column: UTC midnight.
    const comoLoDevuelvePrisma = new Date(Date.UTC(2026, 0, 1));

    const plantilla = plantillaContratoDesdeFila({
      id: "plantilla-2026-01",
      version: "2026-01",
      contenidoHtml: "<html>...</html>",
      vigenteDesde: comoLoDevuelvePrisma,
    });

    expect(plantilla.vigenteDesde.iso).toBe("2026-01-01");
  });
});
