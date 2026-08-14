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

/**
 * Every code the API's error envelope can carry, and the envelope shape
 * itself.
 *
 * Moved here, unchanged, from `apps/api/src/http/respuestaDeError.ts` (DESIGN.md
 * D7): the client has to switch on `codigo` to choose a message and a remedy,
 * and a hand-copied union on the tablet is exactly the drift this package
 * exists to prevent. Both stay dependency-free — no `@nestjs/common`, nothing
 * Node-only — so neither risks the browser-safety guard in
 * `paqueteNavegable.spec.ts`.
 *
 * `apps/api/src/http/respuestaDeError.ts` re-exports both, unchanged; see its
 * own comment for why that re-export is load-bearing.
 */
export type CodigoDeError =
  | "credenciales_invalidas"
  | "sesion_invalida"
  | "no_autenticado"
  | "sin_permiso"
  | "no_encontrado"
  | "demasiadas_peticiones"
  | "validacion"
  /** The body-parser refused the request before any controller saw it. */
  | "cuerpo_demasiado_grande"
  | "cuerpo_invalido"
  | "regla_de_negocio"
  | "conflicto_de_estado"
  /**
   * Same 409 as `conflicto_de_estado`, and deliberately not the same code: the
   * client's remedy is identical, but this one means two writers collided
   * rather than that somebody asked for something impossible. A spike of these
   * is an incident; a state conflict is routine.
   */
  | "conflicto_de_concurrencia"
  | "http"
  | "error_interno";

export interface CuerpoDeError {
  readonly error: {
    readonly mensaje: string;
    /**
     * A known code, or any other string — the client must survive a server
     * that has learned a code it has not (see `mensajeDeError`'s `default`).
     *
     * `string & {}` rather than a plain `string`: a bare `CodigoDeError |
     * string` collapses to `string`, so the union above is erased before
     * anything can use it, and neither an editor nor a `switch` ever sees
     * the known codes. Intersecting keeps them visible for completion and
     * narrowing while still accepting every other string, which is what the
     * union was always meant to say.
     */
    readonly codigo: CodigoDeError | (string & {});
    readonly campos?: Record<string, string>;
    readonly referencia?: string;
  };
}

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
  /**
   * Who performed the transition, as a name a person can read — resolved
   * server-side from the `usuario_id` the event row stores, which never
   * leaves the API.
   *
   * Null on `creado` and `firmado`, where the null is meaningful rather than
   * missing: a draft precedes anything with legal weight, and signing records
   * its técnico in the signing context alongside the device, the IP and the
   * coordinates.
   *
   * Also null when an id cannot be resolved to a name. The authoritative
   * record is `contrato_eventos.usuario_id`, which is kept forever; this
   * field is what the screen shows, not what the audit rests on.
   */
  usuario: z.string().nullable(),
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

/**
 * One row of the office list screen (R-2.9) — a deliberate privacy
 * boundary, not a size cut. It MUST NOT be widened to reuse
 * `EsquemaContratoDetalle`'s shape: no signature, no stroke data, no signing
 * context (technician, device, IP, user agent, GPS), no address, no
 * equipment, no documents, no `creadoEn` (the read model's internal
 * ordering key). Name and DNI leave the server because identifying the
 * customer *is* the feature (Ley 25.326) — nothing above that does.
 *
 * `strictObject`, not `object`, at both this level and the nested
 * `comodatario` (R-2.9): a plain `z.object` silently strips an unrecognized
 * key instead of rejecting it, so `safeParse(...).success === true` alone
 * only ever proves this schema is not too STRICT — it is blind to the
 * opposite mistake, a widened response that leaks a forbidden field, which
 * is exactly the direction this boundary exists to guard.
 */
export const EsquemaContratoResumen = z.strictObject({
  id: z.string(),
  /** Allocated at signing; null for a `borrador`. */
  numero: z.number().int().positive().nullable(),
  estado: EsquemaEstadoContrato,
  comodatario: z.strictObject({
    nombreCompleto: z.string(),
    /** Dotted display form, e.g. "30.123.456" — reuses `Dni.formateado`. */
    dni: z.string(),
  }),
  fechaFirma: z.string().regex(FECHA_ISO).nullable(),
});

export type DatosContratoResumen = z.infer<typeof EsquemaContratoResumen>;

/**
 * `GET /contratos` — an honest empty result is still a 200 (R-2.7). The
 * envelope itself is exactly `{ elementos, total, pagina, tamanoPagina }`
 * (R-2.9), so it gets the same `strictObject` treatment as its rows: an
 * unexpected top-level field must fail parsing, not be silently absorbed.
 */
export const EsquemaListaContratos = z.strictObject({
  elementos: z.array(EsquemaContratoResumen),
  /** Untruncated match count, before paging — never just `elementos.length`. */
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  tamanoPagina: z.number().int().positive(),
});

export type DatosListaContratos = z.infer<typeof EsquemaListaContratos>;
