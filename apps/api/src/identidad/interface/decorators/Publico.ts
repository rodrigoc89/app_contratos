import { SetMetadata } from "@nestjs/common";

export const CLAVE_PUBLICO = "identidad:publico";

/**
 * Opts a route out of authentication.
 *
 * `AutenticacionGuard` is registered globally, so **everything is protected by
 * default** and this decorator is the only way out. That asymmetry is
 * deliberate: forgetting to add a guard is a silent hole, whereas forgetting
 * to add `@Publico()` is a 401 the first time anyone tries the endpoint.
 *
 * Today it belongs on exactly three places — login, refresh and the health
 * check. Adding a fourth should feel like a decision, because it is one.
 */
export const Publico = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_PUBLICO, true);
