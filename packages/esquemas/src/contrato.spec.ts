import { describe, expect, it } from "vitest";

import {
  EsquemaActualizarContrato,
  EsquemaComodatario,
  EsquemaCrearContrato,
  EsquemaEquipos,
} from "./contrato";

const comodatario = () => ({
  nombreCompleto: "Juan Carlos Pérez",
  dni: "30.123.456",
  domicilioCalle: "Av. Belgrano 1250",
  ciudad: "La Banda",
  whatsapp: "385 4123456",
});

const equipos = () => ({
  antenaModelo: "LiteBeam 5AC Gen2",
  antenaMac: "ac8ba9123456",
  poe: true,
  canoMetros: 6,
});

describe("EsquemaComodatario", () => {
  it("accepts the data a technician fills in at the customer's house", () => {
    expect(EsquemaComodatario.safeParse(comodatario()).success).toBe(true);
  });

  it("trims the free-text fields", () => {
    const analizado = EsquemaComodatario.parse({
      ...comodatario(),
      nombreCompleto: "  Juan Carlos Pérez  ",
    });

    expect(analizado.nombreCompleto).toBe("Juan Carlos Pérez");
  });

  it.each([
    "nombreCompleto",
    "dni",
    "domicilioCalle",
    "ciudad",
    "whatsapp",
  ] as const)("requires %s", (campo) => {
    const { [campo]: _omitido, ...incompleto } = comodatario();

    expect(EsquemaComodatario.safeParse(incompleto).success).toBe(false);
  });

  /**
   * The province is fixed by the domain (`Comodatario.provincia`), not typed.
   * Accepting it here would invite a client to believe it can choose one.
   */
  it("ignores a province the client tried to choose", () => {
    const analizado = EsquemaComodatario.parse({
      ...comodatario(),
      provincia: "Buenos Aires",
    });

    expect(analizado).not.toHaveProperty("provincia");
  });

  it("reports the offending field by path, never its value", () => {
    const resultado = EsquemaComodatario.safeParse({
      ...comodatario(),
      dni: "no-es-un-dni",
    });

    expect(resultado.success).toBe(false);
    if (resultado.success) {
      return;
    }
    expect(resultado.error.issues[0]?.path).toEqual(["dni"]);
    expect(JSON.stringify(resultado.error.issues)).not.toContain(
      "no-es-un-dni",
    );
  });
});

describe("EsquemaEquipos", () => {
  it("accepts a complete set of equipment", () => {
    expect(EsquemaEquipos.safeParse(equipos()).success).toBe(true);
  });

  it("requires poe to be answered, because blank is not the same as NO", () => {
    const { poe: _omitido, ...sinPoe } = equipos();

    expect(EsquemaEquipos.safeParse(sinPoe).success).toBe(false);
  });

  it("accepts zero metres of tubing, since not every install needs it", () => {
    expect(EsquemaEquipos.safeParse({ ...equipos(), canoMetros: 0 }).success).toBe(
      true,
    );
  });
});

describe("EsquemaCrearContrato", () => {
  it("accepts a complete draft", () => {
    expect(
      EsquemaCrearContrato.safeParse({
        comodatario: comodatario(),
        equipos: equipos(),
      }).success,
    ).toBe(true);
  });

  it("requires both halves", () => {
    expect(
      EsquemaCrearContrato.safeParse({ comodatario: comodatario() }).success,
    ).toBe(false);
  });

  /**
   * The server owns the number, the date, the template version and the
   * signatory (DESIGN.md §2). A client that sent them must not be able to
   * influence anything, so they are dropped rather than merged.
   */
  it("drops anything the server owns", () => {
    const analizado = EsquemaCrearContrato.parse({
      comodatario: comodatario(),
      equipos: equipos(),
      numero: 9999,
      estado: "vigente",
      fechaFirma: "2020-01-01",
    });

    expect(analizado).toEqual({
      comodatario: EsquemaComodatario.parse(comodatario()),
      equipos: EsquemaEquipos.parse(equipos()),
    });
  });
});

describe("EsquemaActualizarContrato", () => {
  it("accepts a customer-only correction", () => {
    expect(
      EsquemaActualizarContrato.safeParse({ comodatario: comodatario() }).success,
    ).toBe(true);
  });

  it("accepts an equipment-only correction", () => {
    expect(
      EsquemaActualizarContrato.safeParse({ equipos: equipos() }).success,
    ).toBe(true);
  });

  it("rejects an empty body, which is always a client bug", () => {
    expect(EsquemaActualizarContrato.safeParse({}).success).toBe(false);
  });

  it("still validates whatever it was given", () => {
    expect(
      EsquemaActualizarContrato.safeParse({
        equipos: { ...equipos(), antenaMac: "no-es-una-mac" },
      }).success,
    ).toBe(false);
  });
});
