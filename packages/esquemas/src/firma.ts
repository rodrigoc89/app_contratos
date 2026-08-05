import { z } from "zod";

import { LARGO_MAXIMO_DISPOSITIVO, textoRequerido } from "./campos";

/**
 * The signing payload: two signatures, and the circumstances the tablet can
 * legitimately report.
 *
 * What is **not** here is as deliberate as what is. There is no `tecnicoId`,
 * no `ip` and no `userAgent`, because `ContextoDeFirma` stores those as
 * forensic evidence of who captured a customer's signature and from where. A
 * client-supplied answer to "who was holding the tablet" is evidence that the
 * client chose its own answer, which is worth nothing. The server takes the
 * technician from the verified token and the IP and user agent from the
 * request itself.
 *
 * The device identifier and the geolocation *do* come from the client — there
 * is nowhere else they could come from — so they are validated here and
 * treated as the best-effort claims they are.
 */

/** The two documents the customer signs, separately (DESIGN.md §1). */
export const DOCUMENTOS_DEL_CONTRATO = [
  "condiciones_generales",
  "comodato",
] as const;

export const EsquemaTipoDocumentoFirmado = z.enum(
  DOCUMENTOS_DEL_CONTRATO,
  "Ese no es uno de los documentos que se firman.",
);

export type TipoDocumentoFirmado = z.infer<typeof EsquemaTipoDocumentoFirmado>;

/**
 * A tap is one or two samples. A pen drawing anything at all produces dozens
 * at 60 Hz. Mirrors `MINIMO_PUNTOS_FIRMA` in the domain.
 */
export const MINIMO_PUNTOS_FIRMA = 10;

/**
 * Sanity bounds, not business rules. The real ceiling on a signing request is
 * the HTTP body limit; these stop a small, cheap payload from describing an
 * enormous structure. A three-second signature at 60 Hz is about 180 points.
 */
export const MAXIMO_PUNTOS_POR_TRAZO = 4_000;
export const MAXIMO_TRAZOS_POR_FIRMA = 60;

/**
 * Roughly 300 kB of PNG once base64 is undone — far more than a signature
 * canvas produces, and small enough that two of them plus their stroke data
 * fit inside the request body limit with room to spare.
 */
export const LARGO_MAXIMO_IMAGEN_FIRMA = 400_000;

/**
 * The image is written straight into `src="…"` of the HTML that becomes the
 * signed PDF. Restricting it to an inline PNG is what keeps the renderer from
 * being pointed at a URL it would have to fetch, or at an SVG, which is a
 * document format rather than a picture.
 */
const PNG_EN_LINEA = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const MENSAJE_IMAGEN =
  "La firma no tiene una imagen válida. Pídale al cliente que vuelva a firmar.";

export const EsquemaImagenFirmaPng = z
  .string(MENSAJE_IMAGEN)
  .max(LARGO_MAXIMO_IMAGEN_FIRMA, MENSAJE_IMAGEN)
  .regex(PNG_EN_LINEA, MENSAJE_IMAGEN);

const MENSAJE_PUNTO =
  "La firma tiene un punto inválido: las coordenadas y el tiempo tienen que ser números.";

const numeroFinito = (mensaje: string): z.ZodType<number> =>
  z.number(mensaje).refine((valor) => Number.isFinite(valor), mensaje);

/**
 * One sample of the pen or finger crossing the canvas.
 *
 * `t` is what makes this evidence rather than decoration: a pasted image has
 * no stroke timing, a hand moving across a screen does (DESIGN.md §6).
 */
export const EsquemaPuntoFirma = z.object({
  x: numeroFinito(MENSAJE_PUNTO),
  y: numeroFinito(MENSAJE_PUNTO),
  /** Milliseconds since capture started, so never negative. */
  t: numeroFinito(MENSAJE_PUNTO).refine((valor) => valor >= 0, MENSAJE_PUNTO),
  /** Pen pressure, on the Pointer Events scale, when the tablet reports it. */
  presion: z.number().min(0, MENSAJE_PUNTO).max(1, MENSAJE_PUNTO).optional(),
});

export type DatosPuntoFirma = z.infer<typeof EsquemaPuntoFirma>;

export const EsquemaTrazoFirma = z
  .array(EsquemaPuntoFirma)
  .min(1, "La firma tiene un trazo vacío.")
  .max(MAXIMO_PUNTOS_POR_TRAZO, "La firma capturada es demasiado larga.")
  .refine(
    (trazo) => trazo.every((punto, i) => i === 0 || punto.t >= (trazo[i - 1]?.t ?? 0)),
    "La firma tiene tiempos que retroceden, así que el trazo no puede ser auténtico.",
  );

export type DatosTrazoFirma = z.infer<typeof EsquemaTrazoFirma>;

export const EsquemaFirmaCapturada = z
  .object({
    documento: EsquemaTipoDocumentoFirmado,
    imagenPng: EsquemaImagenFirmaPng,
    trazos: z
      .array(EsquemaTrazoFirma)
      .min(1, "La firma está vacía: pídale al cliente que firme.")
      .max(MAXIMO_TRAZOS_POR_FIRMA, "La firma capturada es demasiado larga."),
  })
  .refine(
    (firma) =>
      firma.trazos.reduce((total, trazo) => total + trazo.length, 0) >=
      MINIMO_PUNTOS_FIRMA,
    "Eso no es una firma, es un toque en la pantalla. Pídale al cliente que firme.",
  );

export type DatosFirmaCapturada = z.infer<typeof EsquemaFirmaCapturada>;

/**
 * Where the tablet says it was.
 *
 * The messages never repeat the numbers back. Those two values locate the
 * customer's home, they are personal data under Ley 25.326, and a validation
 * message travels into logs and error trackers — which is exactly the reason
 * `ContextoDeFirma.validarGeo` keeps them out of its own errors.
 */
export const EsquemaGeolocalizacion = z.object({
  latitud: z
    .number("La ubicación capturada no es válida.")
    .min(-90, "La latitud capturada no es válida.")
    .max(90, "La latitud capturada no es válida."),
  longitud: z
    .number("La ubicación capturada no es válida.")
    .min(-180, "La longitud capturada no es válida.")
    .max(180, "La longitud capturada no es válida."),
});

export type DatosGeolocalizacion = z.infer<typeof EsquemaGeolocalizacion>;

export const EsquemaFirmarContrato = z
  .object({
    firmas: z
      .array(EsquemaFirmaCapturada, "Faltan las firmas del cliente.")
      .length(
        DOCUMENTOS_DEL_CONTRATO.length,
        "El cliente firma dos veces: las condiciones generales y el comodato.",
      ),
    /**
     * Which tablet captured the signature. Forensic evidence, and the one
     * piece of it only the client can supply.
     */
    dispositivoId: textoRequerido(
      "el identificador del dispositivo",
      LARGO_MAXIMO_DISPOSITIVO,
    ),
    /**
     * Optional on purpose: a denied location permission must never stop an
     * installation from being closed.
     */
    geo: EsquemaGeolocalizacion.nullish(),
  })
  .refine(
    (datos) =>
      new Set(datos.firmas.map((firma) => firma.documento)).size ===
      DOCUMENTOS_DEL_CONTRATO.length,
    "Falta la firma de uno de los dos documentos.",
  );

export type DatosFirmarContrato = z.infer<typeof EsquemaFirmarContrato>;
