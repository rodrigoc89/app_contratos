/**
 * Injection tokens for the identity use cases, and the name of the login rate
 * limit.
 *
 * They live in their own file because `AuthController` and `IdentidadModule`
 * both need them, and importing the module from the controller it declares
 * would be a cycle.
 */

export const INICIAR_SESION = Symbol("INICIAR_SESION");
export const REFRESCAR_SESION = Symbol("REFRESCAR_SESION");
export const CERRAR_SESION = Symbol("CERRAR_SESION");

/**
 * The name of the strict throttler bucket applied to `/auth/login` and
 * `/auth/refresh`, as opposed to the generous default every other endpoint
 * gets.
 */
export const LIMITE_DE_LOGIN = "login";
