import { z } from "zod";

import {
  EsquemaDireccionMac,
  EsquemaDni,
  EsquemaMetrosCano,
  EsquemaNumeroWhatsapp,
  LARGO_MAXIMO_CIUDAD,
  LARGO_MAXIMO_DOMICILIO,
  LARGO_MAXIMO_MODELO,
  LARGO_MAXIMO_NOMBRE,
  textoRequerido,
} from "./campos";
import { EsquemaEstadoContrato } from "./respuestas";
import type { EstadoContrato } from "./respuestas";

/**
 * The two halves of a contract draft: who the customer is, and what equipment
 * was left at their house.
 *
 * Zod strips unknown keys by default, and that default is doing real work
 * here. The server owns the contract number, the signing date, the template
 * version and the signatory (DESIGN.md §2), and the province is fixed by the
 * domain. None of them appear below, so a client that sends one is not
 * refused — it is simply ignored, which is the behaviour that cannot be
 * bypassed by adding a field to the request.
 */

export const EsquemaComodatario = z.object({
  nombreCompleto: textoRequerido("el nombre y apellido", LARGO_MAXIMO_NOMBRE),
  dni: EsquemaDni,
  domicilioCalle: textoRequerido("el domicilio", LARGO_MAXIMO_DOMICILIO),
  ciudad: textoRequerido("la ciudad", LARGO_MAXIMO_CIUDAD),
  /**
   * Not on the paper form. It exists because the customer is entitled to a
   * copy of what they signed and digital delivery needs somewhere to send it.
   */
  whatsapp: EsquemaNumeroWhatsapp,
});

export type DatosComodatario = z.infer<typeof EsquemaComodatario>;

/**
 * Clause PRIMERA: a fixed structure, not an open item list. The contract
 * names exactly an antenna with its MAC, whether a PoE injector went with it,
 * and the metres of mast tubing used.
 */
export const EsquemaEquipos = z.object({
  antenaModelo: textoRequerido("el modelo de antena", LARGO_MAXIMO_MODELO),
  antenaMac: EsquemaDireccionMac,
  /**
   * No default. The contract prints "POE ___SI___ NO___", and a `false` the
   * client never chose is a statement about company equipment that nobody
   * made.
   */
  poe: z.boolean("Indique si se entregó inyector PoE."),
  canoMetros: EsquemaMetrosCano,
});

export type DatosEquipos = z.infer<typeof EsquemaEquipos>;

export const EsquemaCrearContrato = z.object({
  comodatario: EsquemaComodatario,
  equipos: EsquemaEquipos,
});

export type DatosCrearContrato = z.infer<typeof EsquemaCrearContrato>;

/**
 * A correction to a draft, before anything is signed.
 *
 * Both halves are optional so the tablet can save the customer's data as soon
 * as it has it and the equipment once the install is finished — but an
 * entirely empty body is refused, because it is always a client bug and
 * answering 200 to it would hide one.
 *
 * There is deliberately no counterpart for a *signed* contract. A signed
 * contract with wrong data is annulled and re-signed from scratch (DESIGN.md
 * §3); the aggregate refuses the edit, and the API answers 409.
 */
export const EsquemaActualizarContrato = z
  .object({
    comodatario: EsquemaComodatario.optional(),
    equipos: EsquemaEquipos.optional(),
  })
  .refine(
    (datos) => datos.comodatario !== undefined || datos.equipos !== undefined,
    "No hay nada para actualizar: envíe los datos del cliente, los equipos o ambos.",
  );

export type DatosActualizarContrato = z.infer<typeof EsquemaActualizarContrato>;

// -------------------------------------------------------- listado y búsqueda

/**
 * Free enough for any DNI spelling or a long name, tight enough that a
 * pasted document is never mistaken for a search box entry.
 */
const LARGO_MAXIMO_TERMINO_DE_BUSQUEDA = 120;

const ESTADOS_DE_CONTRATO_VALIDOS = new Set<string>(EsquemaEstadoContrato.options);

/**
 * `GET /contratos` (DESIGN.md D6). `estados` is one comma-separated query
 * parameter — `?estados=vigente,borrador` — never repeated `?estado=a&estado=b`
 * params: Express hands those back as a string for one value and an array
 * for two, which would need its own union just to avoid the classic
 * "works with two filters, breaks with one" bug.
 *
 * `pagina`/`tamanoPagina` are never silently clamped: a client asking for
 * 500 and receiving 100 back could not tell that apart from data loss
 * (R-2.3), so `tamanoPagina` over 100 is rejected outright rather than
 * capped.
 *
 * The object itself is `strictObject`, not `object` (R-2.12): a plain
 * `z.object` strips a key it does not recognize instead of rejecting it, so
 * `?estado=vigente` — the singular near-miss of the plural `estados` above —
 * would silently parse to "no filter" and answer 200 with every contract.
 * That is the same silent-failure shape R-2.3's comment already rejects for
 * pagination, applied here to the query object as a whole.
 */
export const EsquemaConsultaDeContratos = z.strictObject({
  termino: z
    .string()
    .trim()
    .max(LARGO_MAXIMO_TERMINO_DE_BUSQUEDA, "El término de búsqueda es demasiado largo.")
    .optional(),

  estados: z
    .string()
    .optional()
    .transform((valor) =>
      valor === undefined || valor.trim() === ""
        ? []
        : valor.split(",").map((parte) => parte.trim()),
    )
    .superRefine((valores, ctx) => {
      if (valores.some((valor) => !ESTADOS_DE_CONTRATO_VALIDOS.has(valor))) {
        ctx.addIssue({ code: "custom", message: "Hay un estado que no es válido." });
      }
    })
    // Safe: the superRefine above already rejected anything not in
    // ESTADOS_DE_CONTRATO_VALIDOS, which mirrors EsquemaEstadoContrato's own
    // members exactly.
    .transform((valores) => valores as EstadoContrato[]),

  pagina: z.coerce
    .number("La página no es válida.")
    .int("La página no es válida.")
    .min(1, "La página no es válida.")
    .optional()
    .default(1),

  tamanoPagina: z.coerce
    .number("El tamaño de página no es válido.")
    .int("El tamaño de página no es válido.")
    .min(1, "El tamaño de página no es válido.")
    .max(100, "El tamaño de página no puede superar 100.")
    .optional()
    .default(20),
}, "Hay un parámetro de búsqueda que no es válido.");

export type DatosConsultaDeContratos = z.infer<typeof EsquemaConsultaDeContratos>;
