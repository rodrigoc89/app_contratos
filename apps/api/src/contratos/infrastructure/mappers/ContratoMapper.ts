import {
  columnaFechaDesde,
  columnaFechaDesdeOrNull,
  fechaCalendarioDesdeColumna,
  fechaCalendarioDesdeColumnaOrNull,
} from "../../../shared/infrastructure/persistence/columnaFecha";
import { normalizarTexto } from "../../../shared/domain/normalizarTexto";
import { Comodatario } from "../../domain/Comodatario";
import { ContextoDeFirma } from "../../domain/ContextoDeFirma";
import type {
  DocumentoContrato,
  EstadoContrato,
  EstadoPersistido,
  EventoContrato,
  TipoEventoContrato,
} from "../../domain/Contrato";
import { Contrato } from "../../domain/Contrato";
import { Equipos } from "../../domain/Equipos";
import { FirmaCapturada } from "../../domain/FirmaCapturada";
import type {
  TipoDocumentoFirmado,
  TrazoFirma,
} from "../../domain/FirmaCapturada";
import { Plazo } from "../../domain/Plazo";

/**
 * Maps the `Contrato` aggregate to and from the flat row shapes the
 * `contratos`, `contrato_firmas`, `contrato_documentos` and
 * `contrato_eventos` tables need.
 *
 * Pure functions, no Prisma import: they take and return plain data, which
 * is what makes them testable without a database (see `ContratoMapper.spec.ts`)
 * and keeps `PrismaContratoRepository` a thin thing that only decides *when*
 * to read/write, never *how* to shape a row.
 */

/**
 * `equipo_cano_metros` is `@db.Decimal`, so Prisma hands back a `Decimal`
 * instance, not a `number` — this is the minimal shape the mapper needs from
 * it, so it never has to import Prisma's runtime `Decimal` class directly.
 */
export interface DecimalLegible {
  toNumber(): number;
}

/** The `contratos` row, exactly as a Prisma `create`/`update` call expects it. */
export interface FilaContrato {
  id: string;
  numero: number | null;
  estado: EstadoContrato;
  comodatarioNombreCompleto: string;
  /**
   * `normalizarTexto(comodatarioNombreCompleto)` — DESIGN.md D2. Required,
   * on purpose: `filaContratoDesde` is the only function that builds this
   * row, so TypeScript refuses any construction that omits it. Never read
   * back into the aggregate; it exists only for `PrismaContratoRepository.buscar`.
   */
  comodatarioNombreBusqueda: string;
  comodatarioDni: string;
  comodatarioDomicilioCalle: string;
  comodatarioCiudad: string;
  comodatarioWhatsapp: string;
  equipoAntenaModelo: string;
  equipoAntenaMac: string;
  equipoPoe: boolean;
  equipoCanoMetros: number;
  plazoMeses: number | null;
  plazoFechaInicio: Date | null;
  plazoFechaVencimiento: Date | null;
  fechaFirma: Date | null;
  plantillaVersionId: string | null;
  firmanteId: string | null;
  contextoTecnicoId: string | null;
  contextoDispositivoId: string | null;
  contextoCapturadoEn: Date | null;
  contextoIp: string | null;
  contextoUserAgent: string | null;
  contextoGeoLatitud: number | null;
  contextoGeoLongitud: number | null;
  motivoBaja: string | null;
  fechaBaja: Date | null;
  motivoAnulacion: string | null;
  fechaAnulacion: Date | null;
  fechaRestitucion: Date | null;
  reemplazaA: string | null;
}

/**
 * The same row, as Prisma hands it back on a read.
 *
 * It carries columns the write shape above does not, or types them
 * differently. `equipoCanoMetros` comes back as a `Decimal` instance rather
 * than a number. `version` is the row's optimistic-locking counter: on the
 * way *in* the repository decides what to write (the loaded version plus
 * one, under a matching `where`), so putting it on `FilaContrato` would
 * invite writing back the stale number that is exactly what the guard is
 * comparing against. `comodatarioNombreBusqueda` widens back to nullable: a
 * row written before Migration A's backfill ran may still hold NULL there
 * (DESIGN.md D7) — the aggregate never reads this column either way, so
 * `contratoDesdeFila` has nothing to do with the null case except tolerate
 * its type.
 */
export interface FilaContratoLeida
  extends Omit<
    FilaContrato,
    "equipoCanoMetros" | "comodatarioNombreBusqueda"
  > {
  equipoCanoMetros: DecimalLegible;
  comodatarioNombreBusqueda: string | null;
  version: number;
}

/** A stroke point, plain and mutable-safe for a Prisma Json write. */
export interface PuntoFirmaPlano {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly presion?: number;
}

export interface FilaFirma {
  contratoId: string;
  documento: TipoDocumentoFirmado;
  imagenPng: string;
  trazos: readonly (readonly PuntoFirmaPlano[])[];
}

export interface FilaFirmaLeida {
  documento: TipoDocumentoFirmado;
  imagenPng: string;
  trazos: unknown;
}

export interface FilaDocumento {
  contratoId: string;
  documento: TipoDocumentoFirmado;
  ruta: string;
  sha256: string;
}

export type FilaDocumentoLeida = Omit<FilaDocumento, "contratoId">;

export interface FilaEvento {
  contratoId: string;
  tipo: TipoEventoContrato;
  fecha: Date | null;
  detalle: string | null;
  registradoEn: Date;
}

export type FilaEventoLeida = Omit<FilaEvento, "contratoId" | "registradoEn">;

export interface RelacionesContrato {
  readonly firmas: readonly FilaFirmaLeida[];
  readonly documentos: readonly FilaDocumentoLeida[];
  readonly eventos: readonly FilaEventoLeida[];
}

/** Reads the aggregate's public getters into a `contratos` row. */
export function filaContratoDesde(contrato: Contrato): FilaContrato {
  const { comodatario, equipos, plazo, contexto } = contrato;

  return {
    id: contrato.id,
    numero: contrato.numero,
    estado: contrato.estado,
    comodatarioNombreCompleto: comodatario.nombreCompleto,
    comodatarioNombreBusqueda: normalizarTexto(comodatario.nombreCompleto),
    comodatarioDni: comodatario.dni.valor,
    comodatarioDomicilioCalle: comodatario.domicilioCalle,
    comodatarioCiudad: comodatario.ciudad,
    comodatarioWhatsapp: comodatario.whatsapp.valor,
    equipoAntenaModelo: equipos.antenaModelo,
    equipoAntenaMac: equipos.antenaMac.valor,
    equipoPoe: equipos.poe,
    equipoCanoMetros: equipos.canoMetros.valor,
    plazoMeses: plazo === null ? null : plazo.meses,
    plazoFechaInicio:
      plazo === null ? null : columnaFechaDesde(plazo.fechaInicio),
    plazoFechaVencimiento:
      plazo === null ? null : columnaFechaDesde(plazo.fechaVencimiento),
    fechaFirma: columnaFechaDesdeOrNull(contrato.fechaFirma),
    plantillaVersionId: contrato.plantillaVersionId,
    firmanteId: contrato.firmanteId,
    contextoTecnicoId: contexto === null ? null : contexto.tecnicoId,
    contextoDispositivoId: contexto === null ? null : contexto.dispositivoId,
    contextoCapturadoEn: contexto === null ? null : contexto.capturadoEn,
    contextoIp: contexto === null ? null : contexto.ip,
    contextoUserAgent: contexto === null ? null : contexto.userAgent,
    contextoGeoLatitud: contexto?.geo?.latitud ?? null,
    contextoGeoLongitud: contexto?.geo?.longitud ?? null,
    motivoBaja: contrato.motivoBaja,
    fechaBaja: columnaFechaDesdeOrNull(contrato.fechaBaja),
    motivoAnulacion: contrato.motivoAnulacion,
    fechaAnulacion: columnaFechaDesdeOrNull(contrato.fechaAnulacion),
    fechaRestitucion: columnaFechaDesdeOrNull(contrato.fechaRestitucion),
    reemplazaA: contrato.reemplazaA,
  };
}

/**
 * Rebuilds the aggregate through `Contrato.rehidratar` — the only
 * constructor a persistence adapter is allowed to use.
 */
export function contratoDesdeFila(
  fila: FilaContratoLeida,
  relaciones: RelacionesContrato,
): Contrato {
  const comodatario = Comodatario.crear({
    nombreCompleto: fila.comodatarioNombreCompleto,
    dni: fila.comodatarioDni,
    domicilioCalle: fila.comodatarioDomicilioCalle,
    ciudad: fila.comodatarioCiudad,
    whatsapp: fila.comodatarioWhatsapp,
  });

  const equipos = Equipos.crear({
    antenaModelo: fila.equipoAntenaModelo,
    antenaMac: fila.equipoAntenaMac,
    poe: fila.equipoPoe,
    // Trap: equipo_cano_metros is `@db.Decimal`. Prisma hands back a
    // `Decimal` instance here, never a plain number — convert explicitly.
    canoMetros: fila.equipoCanoMetros.toNumber(),
  });

  const plazo =
    fila.plazoMeses === null || fila.plazoFechaInicio === null
      ? null
      : Plazo.crear(
          fechaCalendarioDesdeColumna(fila.plazoFechaInicio),
          fila.plazoMeses,
        );

  const contexto =
    fila.contextoTecnicoId === null ||
    fila.contextoDispositivoId === null ||
    fila.contextoCapturadoEn === null
      ? null
      : ContextoDeFirma.crear({
          tecnicoId: fila.contextoTecnicoId,
          dispositivoId: fila.contextoDispositivoId,
          capturadoEn: fila.contextoCapturadoEn,
          ip: fila.contextoIp,
          userAgent: fila.contextoUserAgent,
          geo:
            fila.contextoGeoLatitud === null ||
            fila.contextoGeoLongitud === null
              ? null
              : {
                  latitud: fila.contextoGeoLatitud,
                  longitud: fila.contextoGeoLongitud,
                },
        });

  const estado: EstadoPersistido = {
    id: fila.id,
    estado: fila.estado,
    // Storage bookkeeping the aggregate only holds so the next write can
    // compare against it. Nothing in the domain reads it.
    version: fila.version,
    comodatario,
    equipos,
    reemplazaA: fila.reemplazaA,
    numero: fila.numero,
    plazo,
    fechaFirma: fechaCalendarioDesdeColumnaOrNull(fila.fechaFirma),
    plantillaVersionId: fila.plantillaVersionId,
    firmanteId: fila.firmanteId,
    firmas: relaciones.firmas.map(firmaDesdeFila),
    contexto,
    documentos: relaciones.documentos.map(documentoDesdeFila),
    motivoBaja: fila.motivoBaja,
    fechaBaja: fechaCalendarioDesdeColumnaOrNull(fila.fechaBaja),
    motivoAnulacion: fila.motivoAnulacion,
    fechaAnulacion: fechaCalendarioDesdeColumnaOrNull(fila.fechaAnulacion),
    fechaRestitucion: fechaCalendarioDesdeColumnaOrNull(fila.fechaRestitucion),
    eventos: relaciones.eventos.map(eventoDesdeFila),
  };

  return Contrato.rehidratar(estado);
}

export function filaFirmaDesde(
  contratoId: string,
  firma: FirmaCapturada,
): FilaFirma {
  return {
    contratoId,
    documento: firma.documento,
    imagenPng: firma.imagenPng,
    // firma.trazos is deep-frozen; Prisma's Json input wants a plain mutable
    // structure, so this rebuilds one rather than casting the frozen array.
    trazos: firma.trazos.map((trazo) => trazo.map((punto) => ({ ...punto }))),
  };
}

export function firmaDesdeFila(fila: FilaFirmaLeida): FirmaCapturada {
  return FirmaCapturada.crear({
    documento: fila.documento,
    imagenPng: fila.imagenPng,
    // Trap: the stroke data made a jsonb round trip. FirmaCapturada.crear
    // re-validates its shape and values as the aggregate boundary check —
    // that is what proves the timestamps survived intact, not this cast.
    trazos: fila.trazos as TrazoFirma[],
  });
}

export function filaDocumentoDesde(
  contratoId: string,
  documento: DocumentoContrato,
): FilaDocumento {
  return {
    contratoId,
    documento: documento.documento,
    ruta: documento.ruta,
    sha256: documento.sha256,
  };
}

export function documentoDesdeFila(
  fila: FilaDocumentoLeida,
): DocumentoContrato {
  return {
    documento: fila.documento,
    ruta: fila.ruta,
    sha256: fila.sha256,
  };
}

/**
 * `registradoEn` is passed in explicitly rather than left to the column's
 * `@default(now())`: Postgres evaluates `CURRENT_TIMESTAMP` once per
 * transaction, so every event appended in the same `guardar()` call would
 * otherwise land with an identical timestamp and lose their relative order.
 */
export function filaEventoDesde(
  contratoId: string,
  evento: EventoContrato,
  registradoEn: Date,
): FilaEvento {
  return {
    contratoId,
    tipo: evento.tipo,
    fecha: columnaFechaDesdeOrNull(evento.fecha),
    detalle: evento.detalle,
    registradoEn,
  };
}

export function eventoDesdeFila(fila: FilaEventoLeida): EventoContrato {
  return {
    tipo: fila.tipo,
    fecha: fechaCalendarioDesdeColumnaOrNull(fila.fecha),
    detalle: fila.detalle,
  };
}
