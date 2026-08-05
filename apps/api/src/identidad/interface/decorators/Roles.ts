import { SetMetadata } from "@nestjs/common";

import type { RolUsuario } from "../../domain/Usuario";

export const CLAVE_ROLES = "identidad:roles";

/**
 * Restricts a route to the listed roles (DESIGN.md §9).
 *
 * Enforced by `RolesGuard`, which runs after `AutenticacionGuard`, so a
 * handler carrying this decorator can assume there is a verified identity on
 * the request.
 *
 * This is access control, not business rules: "no role can edit a signed
 * contract" is enforced in the contract domain, where it cannot be bypassed by
 * a controller that forgot a decorator.
 */
export const Roles = (
  ...roles: readonly [RolUsuario, ...RolUsuario[]]
): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_ROLES, roles);
