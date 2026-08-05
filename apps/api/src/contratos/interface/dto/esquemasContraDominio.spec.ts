import {
  EsquemaComodatario,
  EsquemaDireccionMac,
  EsquemaDni,
  EsquemaEquipos,
  EsquemaMetrosCano,
  EsquemaNumeroWhatsapp,
} from "@contratos/esquemas";
import { describe, expect, it } from "vitest";

import { Comodatario } from "../../domain/Comodatario";
import { Equipos } from "../../domain/Equipos";
import { DireccionMac } from "../../domain/value-objects/DireccionMac";
import { Dni } from "../../domain/value-objects/Dni";
import { MetrosCano } from "../../domain/value-objects/MetrosCano";
import { NumeroWhatsapp } from "../../domain/value-objects/NumeroWhatsapp";

/**
 * The test that stops the shared schemas and the domain from drifting apart.
 *
 * `@contratos/esquemas` restates the domain's validation rules so the React
 * client can apply them before anything is sent. That duplication is
 * deliberate (DESIGN.md §5.1), and it is only safe in **one direction**:
 *
 * > Everything the domain rejects, the schema must reject too.
 *
 * A schema that is slightly *stricter* than the domain costs a technician one
 * retype. A schema that is *looser* costs a customer a second visit to their
 * house, because the server refuses a contract the tablet already had them
 * sign — which DESIGN.md §5.1 calls the worst failure this system has.
 *
 * So the sweep below feeds the same inputs through both sides and fails on
 * any case the schema accepts and the domain refuses. Stricter cases are
 * allowed, and each one that exists today is named in `TOLERADOS` with the
 * reason, so a *new* one has to be looked at rather than absorbed silently.
 */

type Resultado = "acepta" | "rechaza";

interface CampoBajoContrato {
  readonly nombre: string;
  readonly dominio: (entrada: never) => unknown;
  readonly esquema: { safeParse(entrada: unknown): { success: boolean } };
  readonly entradas: readonly unknown[];
}

function comoDominio(campo: CampoBajoContrato, entrada: unknown): Resultado {
  try {
    (campo.dominio as (valor: unknown) => unknown)(entrada);
    return "acepta";
  } catch {
    return "rechaza";
  }
}

function comoEsquema(campo: CampoBajoContrato, entrada: unknown): Resultado {
  return campo.esquema.safeParse(entrada).success ? "acepta" : "rechaza";
}

/**
 * Written forms of a DNI, valid and not — including the ones the domain's own
 * unit tests use, so the two suites cannot disagree about what a DNI is.
 */
const DOCUMENTOS = [
  "",
  " ",
  "   ",
  "1",
  "12345",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "27.582.030",
  "27 582 030",
  "  27582030  ",
  "2758203X",
  "27582030.",
  "30123456789",
  "0",
  "00000000",
  "-1234567",
  "+1234567",
  "1.234.567",
] as const;

const DIRECCIONES_MAC = [
  "",
  "AC:8B:A9:12:34:56",
  "ac:8b:a9:12:34:56",
  "ac8ba9123456",
  "AC-8B-A9-12-34-56",
  "AC.8B.A9.12.34.56",
  "AC 8B A9 12 34 56",
  "  AC8BA9123456\n",
  "AC8BA91234",
  "AC8BA912345678",
  "AC:8B:A9:12:34:5G",
  "nope",
  "AC:8B:A9:12:34:",
  "::::::::::::",
  "000000000000",
  "ffffffffffff",
] as const;

const METROS = [
  0,
  6,
  7.5,
  -1,
  200,
  200.01,
  201,
  6.12,
  6.123,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
  "0",
  "6",
  "7,5",
  "7.5",
  " 7,5 ",
  "seis",
  "",
  "  ",
  "1e2",
  "0x10",
  "1_000",
  "7,5,5",
  ".5",
  "-0.5",
  "1e-3",
  "Infinity",
  "1e400",
] as const;

const TELEFONOS = [
  "",
  "3854123456",
  "03854123456",
  "0385154123456",
  "+5493854123456",
  "543854123456",
  "005493854123456",
  "+54 9 (385) 412-3456",
  "385 15 4123456",
  "0385 15 4123456",
  "54 385 412 3456",
  "385412",
  "38541234567890",
  "3854123456789",
  "+13854123456",
  "1385412345",
  "123",
  "15 4123456",
  "0000000000",
  "9993854123456",
] as const;

const CAMPOS: readonly CampoBajoContrato[] = [
  {
    nombre: "Dni",
    dominio: Dni.crear,
    esquema: EsquemaDni,
    entradas: DOCUMENTOS,
  },
  {
    nombre: "DireccionMac",
    dominio: DireccionMac.crear,
    esquema: EsquemaDireccionMac,
    entradas: DIRECCIONES_MAC,
  },
  {
    nombre: "MetrosCano",
    dominio: MetrosCano.crear,
    esquema: EsquemaMetrosCano,
    entradas: METROS,
  },
  {
    nombre: "NumeroWhatsapp",
    dominio: NumeroWhatsapp.crear,
    esquema: EsquemaNumeroWhatsapp,
    entradas: TELEFONOS,
  },
];

/**
 * Cases where the schema is deliberately stricter than the domain, keyed by
 * `campo:entrada` and carrying the reason. Asserted to be exhaustive in both
 * directions, so a *new* divergence fails the suite instead of joining it
 * quietly, and a stale entry fails once the domain catches up.
 */
const TOLERADOS: ReadonlyMap<string, string> = new Map<string, string>([
  // Empty, and that is the finding: across every written form below — 86 of
  // them, including all of the domain's own unit-test cases — the schema and
  // the domain agree on every single one, in both directions. Nothing here is
  // "tolerated" because nothing diverges. The map stays so that the first
  // divergence has to be written down and justified rather than discovered by
  // a customer.
]);

const clave = (campo: CampoBajoContrato, entrada: unknown): string =>
  `${campo.nombre}:${JSON.stringify(entrada)}`;

interface Divergencia {
  readonly clave: string;
  readonly dominio: Resultado;
  readonly esquema: Resultado;
}

const divergencias: Divergencia[] = [];

for (const campo of CAMPOS) {
  for (const entrada of campo.entradas) {
    const dominio = comoDominio(campo, entrada);
    const esquema = comoEsquema(campo, entrada);

    if (dominio !== esquema) {
      divergencias.push({ clave: clave(campo, entrada), dominio, esquema });
    }
  }
}

describe("the shared schemas never accept what the domain refuses", () => {
  it("has no case the schema lets through and the domain refuses", () => {
    const peligrosas = divergencias
      .filter((una) => una.esquema === "acepta")
      .map((una) => una.clave);

    // The direction that would have a customer sign a contract the server is
    // about to reject. There is no acceptable reason for it.
    expect(peligrosas).toEqual([]);
  });

  it("documents every case where it is stricter than the domain", () => {
    const sinDocumentar = divergencias
      .filter((una) => !TOLERADOS.has(una.clave))
      .map((una) => una.clave);

    expect(sinDocumentar).toEqual([]);
  });

  it("carries no stale exception for a case that no longer diverges", () => {
    const observadas = new Set(divergencias.map((una) => una.clave));
    const obsoletas = [...TOLERADOS.keys()].filter(
      (una) => !observadas.has(una),
    );

    expect(obsoletas).toEqual([]);
  });

  it("actually compared something, so a green suite is not an empty one", () => {
    const total = CAMPOS.reduce(
      (suma, campo) => suma + campo.entradas.length,
      0,
    );

    expect(total).toBeGreaterThan(80);
  });
});

/**
 * The composite schemas, checked the same way: a payload the schema lets
 * through has to survive `Comodatario.crear` and `Equipos.crear`, because
 * that is literally the next thing the controller does with it.
 */
describe("a payload that passes the schema builds the domain object", () => {
  it("builds a Comodatario", () => {
    const datos = EsquemaComodatario.parse({
      nombreCompleto: "  Juan Carlos Pérez ",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250",
      ciudad: "La Banda",
      whatsapp: "0385 15 4123456",
    });

    const comodatario = Comodatario.crear(datos);

    expect(comodatario.dni.valor).toBe("30123456");
    expect(comodatario.whatsapp.valor).toBe("+5493854123456");
    expect(comodatario.provincia).toBe("Santiago del Estero");
  });

  it("builds an Equipos", () => {
    const datos = EsquemaEquipos.parse({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: "7,5",
    });

    const equipos = Equipos.crear(datos);

    expect(equipos.antenaMac.valor).toBe("AC:8B:A9:12:34:56");
    expect(equipos.canoMetros.valor).toBe(7.5);
    expect(equipos.poeImpreso).toBe("SI");
  });

  /**
   * `Equipos.crear` types `poe` as a boolean and never checks it at runtime,
   * so a string "no" would be stored and printed as `SI`. The schema is the
   * only thing standing between a JSON body and that outcome — which is
   * exactly the kind of guarantee this package exists to provide.
   */
  it("refuses a non-boolean poe that the domain would have printed as SI", () => {
    expect(
      EsquemaEquipos.safeParse({
        antenaModelo: "LiteBeam 5AC Gen2",
        antenaMac: "ac8ba9123456",
        poe: "no",
        canoMetros: 6,
      }).success,
    ).toBe(false);

    expect(Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: "no" as unknown as boolean,
      canoMetros: 6,
    }).poeImpreso).toBe("SI");
  });

});
