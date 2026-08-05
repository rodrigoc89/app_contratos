import { z } from "zod";

import {
  esDireccionMacValida,
  esDniValido,
  esNumeroWhatsappValido,
  MAXIMO_METROS_CANO,
  metrosCanoANumero,
  tieneHastaDosDecimales,
} from "./normalizacion";

/**
 * The individual fields of a contract, as Zod schemas.
 *
 * Two rules hold for every message below.
 *
 * **Spanish, and written for the person reading it** — a technician standing
 * next to a customer, with the form open on a tablet. Zod's own messages are
 * English and describe types ("expected string, received undefined"), so every
 * check here carries its own.
 *
 * **Never echo the value.** A DNI, a phone number and a home address are
 * personal data under Ley 25.326, and a validation message travels into logs,
 * into error trackers and onto a screen someone else may be looking at. The
 * field name is enough to fix the form; the value stays in the request.
 */

/**
 * Upper bounds on free text. They are not business rules — nobody's surname
 * is 121 characters — they exist so a paste, or a script, cannot turn a form
 * field into a payload.
 */
export const LARGO_MAXIMO_NOMBRE = 120;
export const LARGO_MAXIMO_DOMICILIO = 200;
export const LARGO_MAXIMO_CIUDAD = 100;
export const LARGO_MAXIMO_MODELO = 120;
export const LARGO_MAXIMO_DISPOSITIVO = 100;

/** Long enough for any written form of a DNI, MAC or phone; no longer. */
const LARGO_MAXIMO_CAMPO_CORTO = 64;

/**
 * A mandatory free-text field, trimmed, named in its own error message.
 *
 * Mirrors `textoRequerido` in the domain, which trims and refuses blanks for
 * the same reason: `"   "` is not a city.
 */
export function textoRequerido(
  campo: string,
  maximo: number,
): z.ZodString {
  return z
    .string(`Complete ${campo}.`)
    .trim()
    .min(1, `Complete ${campo}.`)
    .max(maximo, `El campo ${campo} es demasiado largo.`);
}

export const EsquemaDni = z
  .string("Ingrese el DNI del cliente.")
  .trim()
  .max(LARGO_MAXIMO_CAMPO_CORTO, "El DNI no es válido.")
  .refine(
    esDniValido,
    "El DNI no es válido: tiene que tener 7 u 8 dígitos, sin letras.",
  );

export const EsquemaDireccionMac = z
  .string("Escanee o ingrese la MAC de la antena.")
  .trim()
  .max(LARGO_MAXIMO_CAMPO_CORTO, "La dirección MAC no es válida.")
  .refine(
    esDireccionMacValida,
    "La dirección MAC no es válida: tiene que tener 12 dígitos hexadecimales, por ejemplo AC:8B:A9:12:34:56.",
  );

export const EsquemaNumeroWhatsapp = z
  .string("Ingrese el número de WhatsApp del cliente.")
  .trim()
  .max(LARGO_MAXIMO_CAMPO_CORTO, "El número de WhatsApp no es válido.")
  .refine(
    esNumeroWhatsappValido,
    "El número de WhatsApp no es válido: ingrese el código de área y el número, sin el 0 y sin el 15. Por ejemplo 385 4123456.",
  );

/**
 * Metres of mast tubing, as either a number or the string an input field
 * yields — the same two shapes `MetrosCano.crear` accepts.
 *
 * `superRefine` rather than one `refine`, because "that is not a number",
 * "that is longer than any mast" and "that has too many decimals" are three
 * different mistakes and the technician can only act on the one they made.
 */
export const EsquemaMetrosCano = z
  .union(
    [z.number(), z.string().trim().max(LARGO_MAXIMO_CAMPO_CORTO)],
    "Ingrese los metros de caño.",
  )
  .superRefine((entrada, ctx) => {
    const metros = metrosCanoANumero(entrada);

    if (metros === null || !Number.isFinite(metros)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Los metros de caño no son válidos: ingrese un número, por ejemplo 7,5.",
      });
      return;
    }
    if (metros < 0) {
      ctx.addIssue({
        code: "custom",
        message: "Los metros de caño no pueden ser negativos.",
      });
      return;
    }
    if (metros > MAXIMO_METROS_CANO) {
      ctx.addIssue({
        code: "custom",
        message: `Los metros de caño no pueden superar los ${MAXIMO_METROS_CANO}. Revise el valor cargado.`,
      });
      return;
    }
    if (!tieneHastaDosDecimales(metros)) {
      ctx.addIssue({
        code: "custom",
        message: "Los metros de caño admiten como máximo dos decimales.",
      });
    }
  });

export type DatosMetrosCano = z.infer<typeof EsquemaMetrosCano>;
