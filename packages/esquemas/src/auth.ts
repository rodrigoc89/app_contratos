import { z } from "zod";

/**
 * The wire contracts for `/auth`, as Zod schemas.
 *
 * DESIGN.md §5.1 asks for one schema definition consumed by both the React
 * client (through React Hook Form) and this server (through
 * `ZodValidationPipe`) — the same argument that put the contract schemas in
 * this package. Moved here, unchanged in shape, from
 * `apps/api/src/identidad/interface/dto/esquemasDeAuth.ts`, which is now
 * deleted; `AuthController.ts` imports from here instead.
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
 * `ROLES_USUARIO`, inlined.
 *
 * The authoritative tuple lives in
 * `apps/api/src/identidad/domain/Usuario.ts` (DESIGN.md §9: three roles, a
 * closed set). This package cannot import it: `paqueteNavegable.spec.ts`
 * allows only `"zod"` and relative specifiers here, on purpose, so the
 * package stays consumable by a browser bundle. Inlining is therefore the
 * only option, not a preference.
 *
 * `apps/api/src/identidad/interface/dto/esquemasContraDominio.spec.ts` pins
 * this tuple against the domain's own, so the two copies cannot drift apart
 * silently — a change to one without the other fails that test.
 */
const ROLES_USUARIO_SESION = ["tecnico", "oficina", "admin"] as const;

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
    rol: z.enum(ROLES_USUARIO_SESION),
    activo: z.boolean(),
  }),
});

export type DatosSesion = z.infer<typeof EsquemaSesion>;
