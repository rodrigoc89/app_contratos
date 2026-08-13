import { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Comodatario } from "../domain/Comodatario";
import { Contrato } from "../domain/Contrato";
import type { EstadoContrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { CriteriosDeBusqueda } from "./ports/ContratoRepository";

/**
 * One scenario table, driving both `ContratosEnMemoria` (no database) and
 * `PrismaContratoRepository` (real Postgres) — DESIGN.md D8.
 *
 * `BuscarContratos.spec.ts` and `PrismaContratoRepository.integration.spec.ts`
 * both run `it.each(ESCENARIOS_DE_BUSQUEDA)` against contracts built from
 * `SEMILLAS_DE_BUSQUEDA`. Seeding differs — one calls `agregar`, the other
 * inserts rows through the repository plus a raw timestamp fix-up — but the
 * assertions are identical, so a behavioural difference between the two
 * implementations fails both suites, not just one.
 */

export interface SemillaDeBusqueda {
  readonly id: string;
  readonly nombreCompleto: string;
  readonly dni: string;
  readonly estado: EstadoContrato;
  readonly creadoEn: Date;
}

export const SEMILLAS_DE_BUSQUEDA: readonly SemillaDeBusqueda[] = [
  {
    id: "escenario-perez-vigente",
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30123456",
    estado: "vigente",
    creadoEn: new Date("2026-01-01T10:00:00.000Z"),
  },
  {
    id: "escenario-perez-borrador",
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30123499",
    estado: "borrador",
    creadoEn: new Date("2026-01-02T10:00:00.000Z"),
  },
  {
    id: "escenario-nunez",
    nombreCompleto: "María Núñez",
    dni: "30234567",
    estado: "vigente",
    creadoEn: new Date("2026-01-03T10:00:00.000Z"),
  },
  // `ñ` on its own, protected: "pena" must not find this one, "peña" must.
  {
    id: "escenario-pena",
    nombreCompleto: "Peña",
    dni: "30345678",
    estado: "vigente",
    creadoEn: new Date("2026-01-04T10:00:00.000Z"),
  },
  {
    id: "escenario-gomez-baja",
    nombreCompleto: "Carlos Gómez",
    dni: "20123456",
    estado: "dado_de_baja",
    // Shares its instant with the row below, on purpose: R-2.2's tiebreaker.
    creadoEn: new Date("2026-01-05T10:00:00.000Z"),
  },
  {
    id: "escenario-gomez-anulado",
    nombreCompleto: "Carlos Gómez",
    dni: "20123499",
    estado: "anulado",
    creadoEn: new Date("2026-01-05T10:00:00.000Z"),
  },
];

export interface EscenarioDeBusqueda {
  readonly nombre: string;
  readonly criterios: CriteriosDeBusqueda;
  readonly idsEsperados: readonly string[];
  readonly totalEsperado: number;
}

const SIN_TERMINO: CriteriosDeBusqueda["termino"] = null;

export const ESCENARIOS_DE_BUSQUEDA: readonly EscenarioDeBusqueda[] = [
  {
    nombre: "no filters: newest first by creadoEn, id DESC breaking ties (R-2.2)",
    criterios: { termino: SIN_TERMINO, estados: [], pagina: 1, tamanoPagina: 20 },
    // gomez-baja and gomez-anulado share one creadoEn instant: "escenario-gomez-baja"
    // sorts after "escenario-gomez-anulado" lexicographically ('b' > 'a'), so
    // it comes FIRST under id DESC.
    idsEsperados: [
      "escenario-gomez-baja",
      "escenario-gomez-anulado",
      "escenario-pena",
      "escenario-nunez",
      "escenario-perez-borrador",
      "escenario-perez-vigente",
    ],
    totalEsperado: 6,
  },
  {
    nombre: "accent-insensitive, ñ-sensitive name search: 'perez' finds only Pérez (R-2.4)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "perez" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: ["escenario-perez-borrador", "escenario-perez-vigente"],
    totalEsperado: 2,
  },
  {
    nombre: "'pena' does NOT find 'Peña' — ñ and n are different letters (R-2.4)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "pena" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: [],
    totalEsperado: 0,
  },
  {
    nombre: "'peña' finds 'Peña' (R-2.4)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "peña" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: ["escenario-pena"],
    totalEsperado: 1,
  },
  {
    nombre: "name search is substring, not prefix — 'carlos' finds it as a middle AND a first name (R-2.4)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "carlos" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: [
      "escenario-gomez-baja",
      "escenario-gomez-anulado",
      "escenario-perez-borrador",
      "escenario-perez-vigente",
    ],
    totalEsperado: 4,
  },
  {
    nombre: "DNI search is a prefix match on digits (R-2.5)",
    criterios: {
      termino: { tipo: "dni", digitos: "30123" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: ["escenario-perez-borrador", "escenario-perez-vigente"],
    totalEsperado: 2,
  },
  {
    nombre: "a non-matching DNI prefix returns nothing (R-2.5)",
    criterios: {
      termino: { tipo: "dni", digitos: "999" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: [],
    totalEsperado: 0,
  },
  {
    nombre: "estado filter returns only that state (R-2.6)",
    criterios: { termino: SIN_TERMINO, estados: ["vigente"], pagina: 1, tamanoPagina: 20 },
    idsEsperados: ["escenario-pena", "escenario-nunez", "escenario-perez-vigente"],
    totalEsperado: 3,
  },
  {
    nombre: "term and state combine (R-2.6)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "perez" },
      estados: ["vigente"],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: ["escenario-perez-vigente"],
    totalEsperado: 1,
  },
  {
    nombre: "pagination: page 1 of 2, size 4 — total stays untruncated (R-2.3)",
    criterios: { termino: SIN_TERMINO, estados: [], pagina: 1, tamanoPagina: 4 },
    idsEsperados: [
      "escenario-gomez-baja",
      "escenario-gomez-anulado",
      "escenario-pena",
      "escenario-nunez",
    ],
    totalEsperado: 6,
  },
  {
    nombre: "pagination: page 2 of 2, size 4",
    criterios: { termino: SIN_TERMINO, estados: [], pagina: 2, tamanoPagina: 4 },
    idsEsperados: ["escenario-perez-borrador", "escenario-perez-vigente"],
    totalEsperado: 6,
  },
  {
    nombre: "a page past the end is empty, not an error (R-2.3)",
    criterios: { termino: SIN_TERMINO, estados: [], pagina: 99, tamanoPagina: 20 },
    idsEsperados: [],
    totalEsperado: 6,
  },
  {
    nombre: "a matching term returns an honest empty result (R-2.7)",
    criterios: {
      termino: { tipo: "nombre", normalizado: "noexiste" },
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    },
    idsEsperados: [],
    totalEsperado: 0,
  },
];

// --------------------------------------------------------------- fixtures

const trazoDePrueba = () =>
  Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const firmaDePrueba = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [trazoDePrueba()],
  });

const contextoDePrueba = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "tecnico-escenario",
    dispositivoId: "tablet-escenario",
    capturadoEn: new Date("2026-01-01T12:00:00.000Z"),
  });

/** After every seed's `fechaFirma`, so `darDeBaja`/`anular` are always legal. */
const FECHA_POSTERIOR_A_TODAS_LAS_FIRMAS = FechaCalendario.desdeIso("2026-06-01");

let contadorDeNumero = 0;

/**
 * Builds the real `Contrato` aggregate a `SemillaDeBusqueda` describes,
 * driven through its actual domain transitions rather than assembled by
 * hand — so a scenario exercising `dado_de_baja` or `anulado` is exactly as
 * valid as one built via the tablet's own signing flow.
 */
export function contratoDesdeSemilla(semilla: SemillaDeBusqueda): Contrato {
  const contrato = Contrato.crearBorrador({
    id: semilla.id,
    comodatario: Comodatario.crear({
      nombreCompleto: semilla.nombreCompleto,
      dni: semilla.dni,
      domicilioCalle: "Av. Belgrano 1250",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
  });

  if (semilla.estado === "borrador") {
    return contrato;
  }

  contadorDeNumero += 1;
  contrato.firmar({
    numero: contadorDeNumero,
    plantillaVersionId: "plantilla-escenario",
    firmanteId: "firmante-escenario",
    fechaFirma: FechaCalendario.enZona(
      semilla.creadoEn,
      "America/Argentina/Buenos_Aires",
    ),
    firmas: [
      firmaDePrueba("condiciones_generales"),
      firmaDePrueba("comodato"),
    ],
    contexto: contextoDePrueba(),
  });

  if (semilla.estado === "dado_de_baja") {
    contrato.darDeBaja({
      motivo: "Prueba de escenario",
      fecha: FECHA_POSTERIOR_A_TODAS_LAS_FIRMAS,
    });
  } else if (semilla.estado === "anulado") {
    contrato.anular({
      motivo: "Prueba de escenario",
      fecha: FECHA_POSTERIOR_A_TODAS_LAS_FIRMAS,
    });
  }

  return contrato;
}
