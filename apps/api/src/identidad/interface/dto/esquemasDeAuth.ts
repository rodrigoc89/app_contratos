import { z } from "zod";

import { ROLES_USUARIO } from "../../domain/Usuario";

/**
 * The wire contracts for `/auth`, as Zod schemas.
 *
 * DESIGN.md §5.1 asks for one schema definition consumed by both the React
 * client (through React Hook Form) and this server (through
 * `ZodValidationPipe`). These live here for now; when the frontend appears
 * they move to a shared package unchanged.
 *
 * Note what is *not* validated: the password is only checked for presence and
 * an upper bound. Rejecting a login because the password "looks wrong" would
 * tell an attacker about the password policy, and a length or character rule
 * belongs where passwords are *set*, not where they are checked.
 */

/** An argon2id verification is memory-hard; an unbounded body is a free DoS. */
const LARGO_MAXIMO_CONTRASENA = 200;

export const EsquemaLogin = z.object({
  nombreUsuario: z
    .string("Ingrese el nombre de usuario.")
    .trim()
    .min(1, "Ingrese el nombre de usuario.")
    .max(40, "El nombre de usuario es demasiado largo."),
  contrasena: z
    .string("Ingrese la contraseña.")
    .min(1, "Ingrese la contraseña.")
    .max(
      LARGO_MAXIMO_CONTRASENA,
      "La contraseña es demasiado larga.",
    ),
});

export type DatosLogin = z.infer<typeof EsquemaLogin>;

export const EsquemaTokenDeRefresco = z.object({
  tokenDeRefresco: z
    .string("Falta el token de refresco.")
    .min(1, "Falta el token de refresco.")
    .max(500, "El token de refresco no tiene el formato esperado."),
});

export type DatosTokenDeRefresco = z.infer<typeof EsquemaTokenDeRefresco>;

/**
 * The session payload as the client sees it.
 *
 * Declared as a schema rather than only as a TypeScript type so the client can
 * parse what it receives instead of trusting it, which is the same argument
 * that put the request schemas here.
 */
export const EsquemaSesion = z.object({
  tokenDeAcceso: z.string(),
  expiraEnSegundos: z.number().int().positive(),
  tokenDeRefresco: z.string(),
  refrescoExpiraEnSegundos: z.number().int().positive(),
  usuario: z.object({
    id: z.string(),
    nombreUsuario: z.string(),
    nombreCompleto: z.string(),
    rol: z.enum(ROLES_USUARIO),
    activo: z.boolean(),
  }),
});

export type DatosSesion = z.infer<typeof EsquemaSesion>;
