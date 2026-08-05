import { z } from "zod";

import { EsquemaTipoDocumentoFirmado, DOCUMENTOS_DEL_CONTRATO } from "./firma";

/**
 * What the API answers with, as schemas rather than as bare TypeScript types.
 *
 * Same argument that put the request schemas in this package: the client can
 * *parse* what it receives instead of trusting it, and the server can type its
 * handlers off the very same definition — so a field renamed on one side does
 * not compile on the other.
 *
 * Read these as a privacy boundary too. What a contract detail *omits* is
 * deliberate: the signature images, the raw stroke points and the signing
 * context (IP, user agent, GPS) are forensic evidence kept server-side, not a
 * view model handed to every screen that lists contracts.
 */

const SHA256 = /^[0-9a-f]{64}$/;
/** `AAAA-MM-DD`, the wire form of a `FechaCalendario`. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const EsquemaEstadoContrato = z.enum([
  "borrador",
  "vigente",
  "dado_de_baja",
  "anulado",
]);

export type EstadoContrato = z.infer<typeof EsquemaEstadoContrato>;

export const EsquemaTipoEventoContrato = z.enum([
  "creado",
  "firmado",
  "dado_de_baja",
  "anulado",
  "equipos_restituidos",
]);

export const EsquemaEventoContrato = z.object({
  tipo: EsquemaTipoEventoContrato,
  fecha: z.string().regex(FECHA_ISO).nullable(),
  detalle: z.string().nullable(),
});

/**
 * A sealed PDF, as the client is allowed to see it: the hash that proves the
 * bytes, and the endpoint that serves them. Never the path it is stored at.
 */
export const EsquemaDocumentoDisponible = z.object({
  documento: EsquemaTipoDocumentoFirmado,
  sha256: z.string().regex(SHA256),
  enlace: z.string(),
});

export type DatosDocumentoDisponible = z.infer<typeof EsquemaDocumentoDisponible>;

export const EsquemaPlazoContrato = z.object({
  meses: z.number().int().positive(),
  fechaInicio: z.string().regex(FECHA_ISO),
  /** Always derived, never typed — it is the date that governs restitution. */
  fechaVencimiento: z.string().regex(FECHA_ISO),
});

export const EsquemaContratoDetalle = z.object({
  id: z.string(),
  estado: EsquemaEstadoContrato,
  /** Allocated by the server at signing time, so null while it is a draft. */
  numero: z.number().int().positive().nullable(),

  comodatario: z.object({
    nombreCompleto: z.string(),
    /** Dotted, the way it is printed on the contract. */
    dni: z.string(),
    domicilioCalle: z.string(),
    ciudad: z.string(),
    /** Fixed by the domain, echoed so a screen does not have to hardcode it. */
    provincia: z.string(),
    whatsapp: z.string(),
  }),

  equipos: z.object({
    antenaModelo: z.string(),
    antenaMac: z.string(),
    poe: z.boolean(),
    canoMetros: z.number(),
  }),

  plazo: EsquemaPlazoContrato.nullable(),
  fechaFirma: z.string().regex(FECHA_ISO).nullable(),
  /**
   * Which immutable template version this contract was rendered from. Opaque
   * to the client, and the reason a contract signed in March keeps rendering
   * March's prices forever (DESIGN.md §4).
   */
  plantillaVersionId: z.string().nullable(),

  documentos: z.array(EsquemaDocumentoDisponible),
  eventos: z.array(EsquemaEventoContrato),

  /**
   * Company hardware still at the home of someone who is no longer a
   * customer — the flag the office report is built on (DESIGN.md §3).
   */
  equiposPendientesDeRestitucion: z.boolean(),
});

export type DatosContratoDetalle = z.infer<typeof EsquemaContratoDetalle>;

export const EsquemaContratoCreado = z.object({
  id: z.string(),
  estado: EsquemaEstadoContrato,
});

export type DatosContratoCreado = z.infer<typeof EsquemaContratoCreado>;

export const EsquemaDocumentoPrevisualizado = z.object({
  documento: EsquemaTipoDocumentoFirmado,
  /** The contract text as it will be printed, with the draft's values in it. */
  html: z.string(),
});

/**
 * Step 3 of the signing flow: the customer reads the documents before signing
 * them. That step is the digital equivalent of *"previa lectura y
 * ratificación"* in the closing clause, so both documents are always present —
 * a preview missing one of them would be a customer reading half of what they
 * are about to sign.
 */
export const EsquemaPrevisualizacion = z.object({
  contratoId: z.string(),
  /** The very version `FirmarContrato` would pick moments later. */
  plantillaVersion: z.string(),
  plazoMeses: z.number().int().positive(),
  fechaPrevistaDeFirma: z.string().regex(FECHA_ISO),
  fechaPrevistaDeVencimiento: z.string().regex(FECHA_ISO),
  documentos: z
    .array(EsquemaDocumentoPrevisualizado)
    .length(DOCUMENTOS_DEL_CONTRATO.length),
});

export type DatosPrevisualizacion = z.infer<typeof EsquemaPrevisualizacion>;
