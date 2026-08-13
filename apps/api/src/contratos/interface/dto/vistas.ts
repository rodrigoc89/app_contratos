import type {
  DatosContratoCreado,
  DatosContratoDetalle,
  DatosContratoResumen,
  DatosFirmarContrato,
  DatosListaContratos,
  DatosPrevisualizacion,
} from "@contratos/esquemas";

import type { ContratoPrevisualizado } from "../../application/PrevisualizarContrato";
import type {
  ResultadoDeBusqueda,
  ResumenDeContrato,
} from "../../application/ports/ContratoRepository";
import { ContextoDeFirma } from "../../domain/ContextoDeFirma";
import type { Contrato } from "../../domain/Contrato";
import { Dni } from "../../domain/value-objects/Dni";
import { FirmaCapturada } from "../../domain/FirmaCapturada";
import type { PuntoFirma } from "../../domain/FirmaCapturada";

/**
 * The translation layer between the `Contrato` aggregate and the wire.
 *
 * It runs in both directions and each has one rule worth stating.
 *
 * **Outbound, this is a privacy boundary.** The aggregate holds the signature
 * images, the raw stroke points and the signing context — technician, device,
 * IP, user agent and GPS coordinates that are the customer's home address by
 * another name. All of that is evidence kept server-side under Ley 25.326, and
 * none of it appears below. What goes out is what a screen needs plus, for the
 * sealed PDFs, a link and a hash — never the path they are stored at.
 *
 * **Inbound, the client does not get to describe itself.** `firmasDesde` and
 * `contextoDeFirmaDesde` take the technician from the verified token and the
 * IP and user agent from the request. Only the device id and the location
 * come from the body, because there is nowhere else they could come from.
 */

/** The controller's base path, so links and routes cannot drift apart. */
export const RUTA_CONTRATOS = "contratos";

/**
 * A `User-Agent` header may legally be kilobytes long and is stored verbatim
 * beside a signature. It is forensic evidence, not free storage: enough to
 * identify a browser and a device, and no more.
 */
export const LARGO_MAXIMO_USER_AGENT = 300;

export function enlaceDeDescarga(
  contratoId: string,
  documento: string,
): string {
  return `/${RUTA_CONTRATOS}/${contratoId}/documentos/${documento}`;
}

export function vistaDeContrato(contrato: Contrato): DatosContratoDetalle {
  const { comodatario, equipos, plazo } = contrato;

  return {
    id: contrato.id,
    estado: contrato.estado,
    numero: contrato.numero,

    comodatario: {
      nombreCompleto: comodatario.nombreCompleto,
      // Dotted, the way the contract prints it and the way a person reads it.
      dni: comodatario.dni.formateado,
      domicilioCalle: comodatario.domicilioCalle,
      ciudad: comodatario.ciudad,
      provincia: comodatario.provincia,
      whatsapp: comodatario.whatsapp.valor,
    },

    equipos: {
      antenaModelo: equipos.antenaModelo,
      antenaMac: equipos.antenaMac.valor,
      poe: equipos.poe,
      canoMetros: equipos.canoMetros.valor,
    },

    plazo:
      plazo === null
        ? null
        : {
            meses: plazo.meses,
            fechaInicio: plazo.fechaInicio.iso,
            fechaVencimiento: plazo.fechaVencimiento.iso,
          },
    fechaFirma: contrato.fechaFirma?.iso ?? null,
    plantillaVersionId: contrato.plantillaVersionId,

    documentos: contrato.documentos.map((documento) => ({
      documento: documento.documento,
      sha256: documento.sha256,
      // Where to ask for the bytes — never `documento.ruta`, which is where
      // they sit on the server's disk.
      enlace: enlaceDeDescarga(contrato.id, documento.documento),
    })),

    eventos: contrato.eventos.map((evento) => ({
      tipo: evento.tipo,
      fecha: evento.fecha?.iso ?? null,
      detalle: evento.detalle,
    })),

    equiposPendientesDeRestitucion: contrato.equiposPendientesDeRestitucion,
  };
}

/**
 * The answer to creating a draft: the id the tablet will use for every call
 * that follows, and the state so the client never has to assume one.
 */
export function vistaDeContratoCreado(contrato: Contrato): DatosContratoCreado {
  return { id: contrato.id, estado: contrato.estado };
}

/**
 * The office list row — R-2.9's privacy boundary, not `DatosContratoDetalle`
 * cut down. `ResumenDeContrato` never carried a signature, a stroke point or
 * a signing-context field to begin with, so this function's whole job is
 * picking exactly the six allowed fields and formatting the two that need
 * it: the DNI dotted for display (reusing the tested `Dni.formateado`,
 * never a second dotting rule), and the signing date as its ISO string.
 *
 * `creadoEn` deliberately does NOT appear here: it is the ordering key at
 * the application layer (DESIGN.md D3), not a field any screen has asked
 * for on the wire.
 */
export function vistaDeResumen(resumen: ResumenDeContrato): DatosContratoResumen {
  return {
    id: resumen.id,
    numero: resumen.numero,
    estado: resumen.estado,
    comodatario: {
      nombreCompleto: resumen.comodatarioNombreCompleto,
      dni: Dni.crear(resumen.comodatarioDni).formateado,
    },
    fechaFirma: resumen.fechaFirma?.iso ?? null,
  };
}

/**
 * `pagina`/`tamanoPagina` are echoed from what the caller asked for, not
 * read off `resultado`: the repository's `ResultadoDeBusqueda` carries only
 * `resumenes` and the untruncated `total` (DESIGN.md D4), never the paging
 * parameters that produced them.
 */
export function vistaDeListaContratos(
  resultado: ResultadoDeBusqueda,
  pagina: number,
  tamanoPagina: number,
): DatosListaContratos {
  return {
    elementos: resultado.resumenes.map(vistaDeResumen),
    total: resultado.total,
    pagina,
    tamanoPagina,
  };
}

export function vistaDePrevisualizacion(
  previsualizacion: ContratoPrevisualizado,
): DatosPrevisualizacion {
  return {
    contratoId: previsualizacion.contratoId,
    plantillaVersion: previsualizacion.plantillaVersion,
    plazoMeses: previsualizacion.plazoMeses,
    fechaPrevistaDeFirma: previsualizacion.fechaPrevistaDeFirma.iso,
    fechaPrevistaDeVencimiento:
      previsualizacion.fechaPrevistaDeVencimiento.iso,
    documentos: previsualizacion.documentos.map((documento) => ({
      documento: documento.documento,
      html: documento.html,
    })),
  };
}

export function firmasDesde(
  datos: DatosFirmarContrato,
): readonly FirmaCapturada[] {
  return datos.firmas.map((firma) =>
    FirmaCapturada.crear({
      documento: firma.documento,
      imagenPng: firma.imagenPng,
      trazos: firma.trazos.map((trazo) => trazo.map(puntoDeFirmaDesde)),
    }),
  );
}

/**
 * `exactOptionalPropertyTypes` is the whole reason this is a function.
 *
 * The schema infers `presion?: number | undefined`, and spreading that
 * straight onto a `PuntoFirma` would write a `presion: undefined` key —
 * which then round-trips through `jsonb` as a present-but-null field on a
 * record that is meant to be evidence. The key is written only when there is
 * a pressure reading behind it.
 */
function puntoDeFirmaDesde(punto: {
  x: number;
  y: number;
  t: number;
  presion?: number | undefined;
}): PuntoFirma {
  return punto.presion === undefined
    ? { x: punto.x, y: punto.y, t: punto.t }
    : { x: punto.x, y: punto.y, t: punto.t, presion: punto.presion };
}

/**
 * Everything about the signing circumstances that the *server* knows, which
 * is deliberately most of it.
 */
export interface CircunstanciasDeLaPeticion {
  /** From the verified access token. Never from the request body. */
  readonly tecnicoId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** The server clock. The tablet's clock is not evidence of anything. */
  readonly capturadoEn: Date;
}

export function contextoDeFirmaDesde(
  datos: DatosFirmarContrato,
  peticion: CircunstanciasDeLaPeticion,
): ContextoDeFirma {
  return ContextoDeFirma.crear({
    tecnicoId: peticion.tecnicoId,
    dispositivoId: datos.dispositivoId,
    capturadoEn: peticion.capturadoEn,
    ip: peticion.ip,
    userAgent: peticion.userAgent?.slice(0, LARGO_MAXIMO_USER_AGENT) ?? null,
    geo: datos.geo ?? null,
  });
}
