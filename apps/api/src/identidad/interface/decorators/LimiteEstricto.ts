import { SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

export const CLAVE_LIMITE_ESTRICTO = "identidad:limite-estricto";

/**
 * Marks a route as subject to the strict, credential-guessing rate limit
 * (`LOGIN_INTENTOS_POR_MINUTO`) rather than the generous default every other
 * endpoint gets.
 *
 * It exists because of how `@nestjs/throttler` composes: every named throttler
 * applies to every route unless it says otherwise. Putting the strict limit on
 * a named throttler and doing nothing else would cap the *whole* API at five
 * requests a minute — including the PDF downloads the office panel makes. So
 * the strict throttler carries a `skipIf` that looks for this marker, and
 * skips everywhere it is absent.
 *
 * Note it is deliberately not `@Throttle({ login: {...} })`. That decorator
 * *overrides* a named throttler's settings for a route, and handing it an
 * empty object silently disables the limit instead of applying it — which is
 * exactly the kind of failure that looks fine in review and shows up as a
 * brute-forced account.
 */
export const LimiteEstricto = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_LIMITE_ESTRICTO, true);

/** The `skipIf` predicate for the strict throttler. */
export function noEsRutaDeLimiteEstricto(contexto: ExecutionContext): boolean {
  const enElManejador = Reflect.getMetadata(
    CLAVE_LIMITE_ESTRICTO,
    contexto.getHandler(),
  );
  const enElControlador = Reflect.getMetadata(
    CLAVE_LIMITE_ESTRICTO,
    contexto.getClass(),
  );

  return enElManejador !== true && enElControlador !== true;
}
