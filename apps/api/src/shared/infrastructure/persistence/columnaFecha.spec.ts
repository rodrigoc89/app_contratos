import { afterEach, describe, expect, it } from "vitest";

import { FechaCalendario } from "../../domain/FechaCalendario";
import {
  columnaFechaDesde,
  columnaFechaDesdeOrNull,
  fechaCalendarioDesdeColumna,
  fechaCalendarioDesdeColumnaOrNull,
} from "./columnaFecha";

describe("columnaFecha", () => {
  const tzOriginal = process.env.TZ;

  afterEach(() => {
    if (tzOriginal === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = tzOriginal;
    }
  });

  // Etc/GMT+12 is UTC-12 (the furthest west a machine's clock can be),
  // Pacific/Kiritimati is UTC+14 (the furthest east). Every real deployment
  // and every CI runner sits somewhere between these two.
  const zonasDePrueba = ["UTC", "Etc/GMT+12", "Pacific/Kiritimati"] as const;

  it.each(zonasDePrueba)(
    "keeps 2026-08-04 as 2026-08-04 through a round trip, regardless of host timezone (%s)",
    (zona) => {
      process.env.TZ = zona;

      const original = FechaCalendario.desdeIso("2026-08-04");
      const columna = columnaFechaDesde(original);
      const restaurada = fechaCalendarioDesdeColumna(columna);

      expect(restaurada.iso).toBe("2026-08-04");
    },
  );

  it("writes a @db.Date column as UTC midnight, never a local instant", () => {
    process.env.TZ = "Etc/GMT+12";

    const columna = columnaFechaDesde(FechaCalendario.desdeIso("2026-08-04"));

    expect(columna.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("reads exactly what Prisma hands back for a @db.Date column", () => {
    // node-postgres/Prisma deserialise a `date` column as a Date at UTC
    // midnight — this is what a real query result looks like, built without
    // going through columnaFechaDesde at all.
    const comoLoDevuelvePrisma = new Date(Date.UTC(2026, 7, 4));

    expect(fechaCalendarioDesdeColumna(comoLoDevuelvePrisma).iso).toBe(
      "2026-08-04",
    );
  });

  it("passes null through unchanged in both directions", () => {
    expect(columnaFechaDesdeOrNull(null)).toBeNull();
    expect(fechaCalendarioDesdeColumnaOrNull(null)).toBeNull();
  });

  it("does not pass null through when there is a date", () => {
    const fecha = FechaCalendario.desdeIso("2026-01-01");

    expect(columnaFechaDesdeOrNull(fecha)).not.toBeNull();
    expect(
      fechaCalendarioDesdeColumnaOrNull(columnaFechaDesdeOrNull(fecha)),
    ).not.toBeNull();
  });
});
