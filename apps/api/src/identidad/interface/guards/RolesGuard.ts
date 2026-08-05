import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RolUsuario } from "../../domain/Usuario";
import { CLAVE_PUBLICO } from "../decorators/Publico";
import { CLAVE_ROLES } from "../decorators/Roles";
import {
  CLAVE_USUARIO_AUTENTICADO,
  type UsuarioAutenticado,
} from "../decorators/UsuarioActual";

/**
 * Enforces `@Roles()` (DESIGN.md §9), on top of `AutenticacionGuard`.
 *
 * Registered as the second `APP_GUARD`, so by the time it runs the request
 * either carries a verified identity or is public. A handler with no `@Roles()`
 * is allowed: authentication already happened, and requiring every endpoint to
 * repeat a role list would make the list decorative.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];

    const roles = this.reflector.getAllAndOverride<readonly RolUsuario[]>(
      CLAVE_ROLES,
      objetivos,
    );

    if (roles === undefined || roles.length === 0) {
      return true;
    }

    // `@Publico()` and `@Roles()` answer the same question with opposite
    // answers. Picking one silently would mean the route's access rule depends
    // on guard ordering, which is not something anyone should have to know.
    if (
      this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos) ===
      true
    ) {
      throw new Error(
        "Una ruta no puede ser @Publico() y exigir @Roles() al mismo tiempo: elija una de las dos.",
      );
    }

    const peticion = contexto
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const usuario = peticion[CLAVE_USUARIO_AUTENTICADO] as
      | UsuarioAutenticado
      | undefined;

    if (usuario === undefined) {
      throw new UnauthorizedException(
        "Esta operación necesita una sesión iniciada.",
      );
    }

    if (!roles.includes(usuario.rol)) {
      // The list of roles is not echoed: which roles can reach an endpoint is
      // a map of the system, and there is no reason to hand it out.
      throw new ForbiddenException(
        "Su usuario no tiene permiso para esta operación.",
      );
    }

    return true;
  }
}
