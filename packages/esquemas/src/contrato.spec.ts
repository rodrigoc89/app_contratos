import { describe, expect, it } from "vitest";

import {
  EsquemaActualizarContrato,
  EsquemaComodatario,
  EsquemaCrearContrato,
  EsquemaEquipos,
  EsquemaDarDeBaja,
  EsquemaAnular,
  EsquemaRegistrarRestitucion,
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

/**
 * The three post-signature transitions (DESIGN.md §3). Each is `strictObject`
 * for the same reason `EsquemaConsultaDeContratos` is: a near-miss key that
 * parses as "field absent" is how `?estado=` silently returned every contract
 * (R-2.12). Here the stakes are higher — a dropped `motivo` would end a
 * contract with no recorded reason.
 *
 * `usuarioId` is deliberately NOT in any of these. The actor comes from the
 * verified token, never from the body: a request that could name its own
 * author would make the audit trail worth nothing.
 */
describe("EsquemaDarDeBaja", () => {
  it("accepts a reason and an ISO date", () => {
    const resultado = EsquemaDarDeBaja.safeParse({
      motivo: "Baja solicitada por el abonado",
      fecha: "2027-03-10",
    });

    expect(resultado.success).toBe(true);
  });

  it("refuses an empty or blank reason, naming the field", () => {
    for (const motivo of ["", "   "]) {
      const resultado = EsquemaDarDeBaja.safeParse({ motivo, fecha: "2027-03-10" });
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.path).toEqual(["motivo"]);
    }
  });

  it("refuses a date that is not a calendar date", () => {
    for (const fecha of ["10/03/2027", "2027-3-10", "ayer", ""]) {
      expect(EsquemaDarDeBaja.safeParse({ motivo: "Deuda", fecha }).success).toBe(false);
    }
  });

  it("refuses an actor supplied by the caller — that comes from the token", () => {
    const resultado = EsquemaDarDeBaja.safeParse({
      motivo: "Deuda",
      fecha: "2027-03-10",
      usuarioId: "usuario-que-no-soy",
    });

    expect(resultado.success).toBe(false);
  });
});

describe("EsquemaAnular", () => {
  it("accepts a reason and an ISO date", () => {
    expect(
      EsquemaAnular.safeParse({ motivo: "DNI mal cargado", fecha: "2026-08-20" }).success,
    ).toBe(true);
  });

  it("refuses a blank reason — an annulment with no reason is not one", () => {
    expect(EsquemaAnular.safeParse({ motivo: "  ", fecha: "2026-08-20" }).success).toBe(false);
  });
});

describe("EsquemaRegistrarRestitucion", () => {
  it("accepts just the date the equipment came back", () => {
    expect(EsquemaRegistrarRestitucion.safeParse({ fecha: "2027-04-01" }).success).toBe(true);
  });

  it("takes no reason: returning equipment is a fact, not a decision", () => {
    expect(
      EsquemaRegistrarRestitucion.safeParse({ fecha: "2027-04-01", motivo: "porque sí" }).success,
    ).toBe(false);
  });
});
