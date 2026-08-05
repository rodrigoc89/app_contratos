import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { ContextoDeFirma } from "./ContextoDeFirma";

const DATOS = {
  tecnicoId: "tecnico-07",
  dispositivoId: "tablet-lenovo-03",
  capturadoEn: new Date("2026-08-04T21:30:00-03:00"),
  ip: "190.55.12.9",
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  geo: { latitud: -27.7951, longitud: -64.2615 },
};

describe("ContextoDeFirma", () => {
  it("records who captured the signature and on what device", () => {
    const contexto = ContextoDeFirma.crear(DATOS);

    expect(contexto.tecnicoId).toBe("tecnico-07");
    expect(contexto.dispositivoId).toBe("tablet-lenovo-03");
  });

  it("records the instant, which the server clock owns", () => {
    expect(ContextoDeFirma.crear(DATOS).capturadoEn.toISOString()).toBe(
      "2026-08-05T00:30:00.000Z",
    );
  });

  it("records the network and device fingerprint when available", () => {
    const contexto = ContextoDeFirma.crear(DATOS);

    expect(contexto.ip).toBe("190.55.12.9");
    expect(contexto.userAgent).toBe("Mozilla/5.0 (Linux; Android 14)");
  });

  it("records the location when the customer's device grants it", () => {
    const contexto = ContextoDeFirma.crear(DATOS);

    expect(contexto.geo?.latitud).toBeCloseTo(-27.7951);
    expect(contexto.geo?.longitud).toBeCloseTo(-64.2615);
  });

  it("accepts a capture without optional evidence, which must never block a signature", () => {
    const contexto = ContextoDeFirma.crear({
      tecnicoId: "tecnico-07",
      dispositivoId: "tablet-lenovo-03",
      capturadoEn: DATOS.capturadoEn,
    });

    expect(contexto.ip).toBeNull();
    expect(contexto.userAgent).toBeNull();
    expect(contexto.geo).toBeNull();
  });

  describe("required evidence", () => {
    it("rejects a capture with no technician, since someone is accountable", () => {
      expect(() => ContextoDeFirma.crear({ ...DATOS, tecnicoId: " " })).toThrow(
        DomainError,
      );
    });

    it("rejects a capture with no device", () => {
      expect(() =>
        ContextoDeFirma.crear({ ...DATOS, dispositivoId: "" }),
      ).toThrow(DomainError);
    });

    it("rejects an invalid instant", () => {
      expect(() =>
        ContextoDeFirma.crear({ ...DATOS, capturadoEn: new Date("nope") }),
      ).toThrow(DomainError);
    });

    it("rejects an impossible latitude", () => {
      expect(() =>
        ContextoDeFirma.crear({
          ...DATOS,
          geo: { latitud: 120, longitud: 0 },
        }),
      ).toThrow(DomainError);
    });

    it("rejects an impossible longitude", () => {
      expect(() =>
        ContextoDeFirma.crear({
          ...DATOS,
          geo: { latitud: 0, longitud: -200 },
        }),
      ).toThrow(DomainError);
    });
  });
});
