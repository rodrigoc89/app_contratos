import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { RolUsuario } from "../../domain/Usuario";

/**
 * Where `AutenticacionGuard` parks the verified identity on the request.
 *
 * Prefixed and exported as a constant rather than written as a bare
 * `request.usuario`, so that grepping this name finds every place the
 * authenticated identity is written or read — which, by design, is one writer
 * (the guard) and one reader (the decorator below).
 */
export const CLAVE_USUARIO_AUTENTICADO = "identidadUsuarioAutenticado";

/** Exactly what a verified access token proves, and nothing more. */
export interface UsuarioAutenticado {
  readonly usuarioId: string;
  readonly rol: RolUsuario;
}

/**
 * Injects the authenticated user into a controller argument.
 *
 *     @Post("firmar")
 *     firmar(@UsuarioActual() tecnico: UsuarioAutenticado) { … }
 *
 * **Read the technician's identity from here and nowhere else.**
 * `ContextoDeFirma` stores `tecnicoId` as forensic evidence of who captured a
 * customer's signature — it is one of the fields that would be produced if a
 * contract were ever challenged. A `tecnicoId` taken from the request body is
 * evidence that the client chose its own answer to "who was holding the
 * tablet", which is worth exactly nothing. This value comes from a signature
 * the server verified, so it is worth something.
 *
 * It throws rather than returning `undefined` when there is no identity: that
 * can only happen on a `@Publico()` route, and a handler that asked for a user
 * on a public route has a bug that should surface immediately.
 */
export const UsuarioActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const peticion = contexto
      .switchToHttp()
      .getRequest<Record<string, unknown>>();

    const usuario = peticion[CLAVE_USUARIO_AUTENTICADO] as
      | UsuarioAutenticado
      | undefined;

    if (usuario === undefined) {
      throw new UnauthorizedException(
        "No hay una sesión activa para esta operación.",
      );
    }

    return usuario;
  },
);
