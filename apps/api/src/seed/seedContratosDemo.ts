import type { ContratoRepository } from "../contratos/application/ports/ContratoRepository";
import { Comodatario } from "../contratos/domain/Comodatario";
import { ContextoDeFirma } from "../contratos/domain/ContextoDeFirma";
import { Contrato, type EstadoContrato } from "../contratos/domain/Contrato";
import { Equipos } from "../contratos/domain/Equipos";
import {
  FirmaCapturada,
  type TipoDocumentoFirmado,
} from "../contratos/domain/FirmaCapturada";
import { FechaCalendario } from "../shared/domain/FechaCalendario";
import type { SeedAction } from "./seedDatabase";

/**
 * Demo contracts for development databases (PR20 review).
 *
 * The office list paginates at 10 rows, and a dev database holding a handful
 * of hand-made contracts never shows a second page — so pagination, the
 * estado filters and the name/DNI search all went unexercised. This block
 * seeds enough contracts for several real pages, with every estado
 * represented and varied names/DNIs.
 *
 * Everything here is invented people and invented equipment, which is why
 * `seedContratosDemo` refuses to run in production outright — the same
 * fail-closed posture `seedDatabase` takes with the placeholder signature:
 * fake data beside legal evidence is not something a later stage catches.
 *
 * Deliberately built through the domain (`crearBorrador` → `firmar` →
 * `darDeBaja`/`anular`) and the `ContratoRepository` port, never raw rows:
 * a demo contract that the aggregate would refuse to produce must fail here
 * too. The signed ones carry demo stroke data and NO sealed PDFs — an empty
 * `documentos` list renders no download links, while a fabricated path
 * would explode the first time someone clicks one during a review.
 */
interface DefinicionContratoDemo {
  readonly nombreCompleto: string;
  readonly dni: string;
  readonly estado: EstadoContrato;
  /** Only meaningful for `dado_de_baja`: the equipment already came back. */
  readonly restituido?: boolean;
}

/**
 * 28 contracts — just under three pages of the office list at 10 per page.
 * Estados are interleaved rather than grouped so every page mixes them:
 * 6 borrador, 12 vigente, 6 dado_de_baja (2 with restitución), 4 anulado.
 * `Núñez` and `Ñáñez` are both here on purpose: the search keeps `ñ` and
 * `n` distinct (DESIGN.md D1), and demo data should let someone see that.
 */
export const CONTRATOS_DEMO: readonly DefinicionContratoDemo[] = [
  { nombreCompleto: "María Fernanda López", dni: "20111222", estado: "vigente" },
  { nombreCompleto: "Carlos Alberto Gómez", dni: "21222333", estado: "borrador" },
  { nombreCompleto: "Ana Sofía Martínez", dni: "22333444", estado: "vigente" },
  { nombreCompleto: "Jorge Luis Fernández", dni: "23444555", estado: "dado_de_baja", restituido: true },
  { nombreCompleto: "Lucía Belén Rodríguez", dni: "24555666", estado: "vigente" },
  { nombreCompleto: "Miguel Ángel Sosa", dni: "25666777", estado: "anulado" },
  { nombreCompleto: "Valentina Paz Díaz", dni: "26777888", estado: "vigente" },
  { nombreCompleto: "Ricardo Daniel Herrera", dni: "27888999", estado: "borrador" },
  { nombreCompleto: "Camila Aylén Juárez", dni: "28999111", estado: "dado_de_baja" },
  { nombreCompleto: "Sergio Iván Ledesma", dni: "30111333", estado: "vigente" },
  { nombreCompleto: "Paula Andrea Coronel", dni: "31222444", estado: "borrador" },
  { nombreCompleto: "Héctor Fabián Ávila", dni: "32333555", estado: "vigente" },
  { nombreCompleto: "Rocío Milagros Peralta", dni: "33444666", estado: "anulado" },
  { nombreCompleto: "Gustavo Adolfo Bravo", dni: "34555777", estado: "dado_de_baja", restituido: true },
  { nombreCompleto: "Julieta Abril Núñez", dni: "35666888", estado: "vigente" },
  { nombreCompleto: "Oscar Eduardo Ibáñez", dni: "36777999", estado: "borrador" },
  { nombreCompleto: "Florencia Anahí Vega", dni: "37888111", estado: "vigente" },
  { nombreCompleto: "Ramón Alfredo Castillo", dni: "38999222", estado: "dado_de_baja" },
  { nombreCompleto: "Daniela Soledad Ferreyra", dni: "40111444", estado: "anulado" },
  { nombreCompleto: "Pablo Emanuel Ruiz", dni: "41222555", estado: "vigente" },
  { nombreCompleto: "Marcos Gabriel Ponce", dni: "42333666", estado: "borrador" },
  { nombreCompleto: "Silvia Noemí Acosta", dni: "43444777", estado: "vigente" },
  { nombreCompleto: "Federico Nahuel Salto", dni: "44555888", estado: "dado_de_baja" },
  { nombreCompleto: "Verónica Inés Roldán", dni: "45666999", estado: "vigente" },
  { nombreCompleto: "Diego Armando Luna", dni: "9876543", estado: "borrador" },
  { nombreCompleto: "Micaela Guadalupe Paz", dni: "8765432", estado: "anulado" },
  { nombreCompleto: "Nicolás Agustín Torres", dni: "39111555", estado: "vigente" },
  { nombreCompleto: "Graciela Susana Ñáñez", dni: "29222666", estado: "dado_de_baja" },
];

const CIUDADES = [
  "La Banda",
  "Santiago del Estero",
  "Termas de Río Hondo",
  "Frías",
  "Añatuya",
  "Loreto",
  "Fernández",
] as const;

const CALLES = [
  "Av. Belgrano",
  "Av. Roca",
  "Sarmiento",
  "Mitre",
  "9 de Julio",
  "Av. Aguirre",
  "Independencia",
] as const;

const MODELOS_ANTENA = [
  "LiteBeam 5AC Gen2",
  "PowerBeam M5 400",
  "airGrid M5 HP",
  "NanoStation Loco M5",
] as const;

/** The técnico every demo signature is attributed to — `TECNICO_ID` in `prisma/seed.ts`. */
const TECNICO_DEMO_ID = "usuario-tecnico-inicial";

/** The actor recorded on demo bajas/anulaciones — `ADMIN_ID` in `prisma/seed.ts`. */
const ADMIN_DEMO_ID = "usuario-admin-inicial";

/**
 * Deterministic stroke data that clears `MINIMO_PUNTOS_FIRMA` — obviously
 * synthetic (a straight zig-zag), like the "FIRMA DE PRUEBA" image: demo
 * evidence must never look like real evidence.
 */
function firmaDemo(documento: TipoDocumentoFirmado): FirmaCapturada {
  return FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [
      Array.from({ length: 14 }, (_, punto) => ({
        x: punto * 3,
        y: punto % 4,
        t: punto * 16,
      })),
    ],
  });
}

export interface EntradaContratosDemo {
  readonly contratos: ContratoRepository;
  /** The installed template row's id, looked up by the caller — never assumed. */
  readonly plantillaVersionId: string;
  /** The installed signatory row's id, looked up by the caller — never assumed. */
  readonly firmanteId: string;
  /** `process.env.NODE_ENV`, passed in rather than read, so it is testable. */
  readonly nodeEnv: string | undefined;
}

export interface ReporteContratosDemo {
  /** `created` when at least one was written; `omitido` only in production. */
  readonly action: SeedAction;
  readonly creados: number;
  readonly existentes: number;
}

/**
 * Seeds the demo contracts, idempotently.
 *
 * Idempotent by id: every demo contract has a fixed `contrato-demo-NN` id
 * and is looked up before anything is written, the same convention the
 * account seeding uses with `ADMIN_ID`/`TECNICO_ID`. Contract numbers come
 * from `siguienteNumero()` and are only consumed for contracts actually
 * created, so a re-run allocates nothing.
 */
export async function seedContratosDemo(
  entrada: EntradaContratosDemo,
): Promise<ReporteContratosDemo> {
  if (entrada.nodeEnv === "production") {
    return { action: "omitido", creados: 0, existentes: 0 };
  }

  let creados = 0;
  let existentes = 0;

  for (const [indice, definicion] of CONTRATOS_DEMO.entries()) {
    const id = `contrato-demo-${String(indice + 1).padStart(2, "0")}`;

    if ((await entrada.contratos.porId(id)) !== null) {
      existentes += 1;
      continue;
    }

    await entrada.contratos.guardar(
      await construirContratoDemo(id, indice, definicion, entrada),
    );
    creados += 1;
  }

  return {
    action: creados > 0 ? "created" : "already-present",
    creados,
    existentes,
  };
}

async function construirContratoDemo(
  id: string,
  indice: number,
  definicion: DefinicionContratoDemo,
  entrada: EntradaContratosDemo,
): Promise<Contrato> {
  const contrato = Contrato.crearBorrador({
    id,
    comodatario: Comodatario.crear({
      nombreCompleto: definicion.nombreCompleto,
      dni: definicion.dni,
      domicilioCalle: `${CALLES[indice % CALLES.length] ?? "Av. Belgrano"} ${100 + indice * 37}`,
      ciudad: CIUDADES[indice % CIUDADES.length] ?? "La Banda",
      whatsapp: `385${String(4200000 + indice * 111)}`,
    }),
    equipos: Equipos.crear({
      antenaModelo: MODELOS_ANTENA[indice % MODELOS_ANTENA.length] ?? "LiteBeam 5AC Gen2",
      antenaMac: `ac:8b:a9:d0:0${(indice % 10).toString()}:${(10 + indice).toString(16).padStart(2, "0")}`,
      poe: indice % 3 !== 0,
      canoMetros: 3 + (indice % 4) * 1.5,
    }),
  });

  if (definicion.estado === "borrador") {
    return contrato;
  }

  // Signing dates spread across June 2026 so the list's fechaFirma column
  // varies; every post-signature date is deliberately later than every
  // possible firma (the domain refuses a baja/anulación before the firma).
  const fechaFirma = FechaCalendario.desdeIso(
    `2026-06-${String(indice + 1).padStart(2, "0")}`,
  );

  contrato.firmar({
    numero: await entrada.contratos.siguienteNumero(),
    plantillaVersionId: entrada.plantillaVersionId,
    firmanteId: entrada.firmanteId,
    fechaFirma,
    firmas: [firmaDemo("condiciones_generales"), firmaDemo("comodato")],
    contexto: ContextoDeFirma.crear({
      tecnicoId: TECNICO_DEMO_ID,
      dispositivoId: "tablet-demo-01",
      capturadoEn: new Date(`${fechaFirma.iso}T15:00:00-03:00`),
    }),
  });

  if (definicion.estado === "dado_de_baja") {
    contrato.darDeBaja({
      motivo: "Mudanza fuera del área de cobertura.",
      fecha: FechaCalendario.desdeIso("2026-08-05"),
      usuarioId: ADMIN_DEMO_ID,
    });

    if (definicion.restituido === true) {
      contrato.registrarRestitucion({
        fecha: FechaCalendario.desdeIso("2026-08-15"),
        usuarioId: ADMIN_DEMO_ID,
      });
    }
  }

  if (definicion.estado === "anulado") {
    contrato.anular({
      motivo: "Error en los datos del comodatario al momento de la firma.",
      fecha: FechaCalendario.desdeIso("2026-08-10"),
      usuarioId: ADMIN_DEMO_ID,
    });
  }

  return contrato;
}

/** One line for the seed script's stdout, in the report's language. */
export function describeContratosDemoReport(
  reporte: ReporteContratosDemo,
): string {
  if (reporte.action === "omitido") {
    return "Contratos de demostración: omitidos (nunca se siembran en producción).";
  }
  if (reporte.action === "already-present") {
    return `Contratos de demostración: ya existían los ${reporte.existentes}.`;
  }
  return `Contratos de demostración: se crearon ${reporte.creados} (ya existían ${reporte.existentes}).`;
}
