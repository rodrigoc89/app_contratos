import type { ExecutionContext } from "@nestjs/common";

/**
 * Test-only: the smallest `ExecutionContext` the identity guards actually
 * touch.
 *
 * Not exported for production use. Built by hand rather than mocked so the
 * guard specs stay honest about what a guard is allowed to read: the handler,
 * its class, and the request — nothing else.
 */
export interface PeticionDePrueba extends Record<string, unknown> {
  headers: Record<string, string | undefined>;
}

export interface OpcionesDeContexto {
  /** The route handler, so `Reflector` can read `@Publico()` / `@Roles()`. */
  handler?: (...args: never[]) => unknown;
  clase?: new (...args: never[]) => unknown;
  autorizacion?: string;
  peticion?: Record<string, unknown>;
}

export function contextoDePrueba(opciones: OpcionesDeContexto = {}): {
  contexto: ExecutionContext;
  peticion: PeticionDePrueba;
} {
  const headers: Record<string, string | undefined> = {};
  if (opciones.autorizacion !== undefined) {
    headers["authorization"] = opciones.autorizacion;
  }

  const peticion: PeticionDePrueba = { headers, ...opciones.peticion };

  class ControladorDePrueba {}
  function manejadorDePrueba(): void {}

  const contexto = {
    getHandler: () => opciones.handler ?? manejadorDePrueba,
    getClass: () => opciones.clase ?? ControladorDePrueba,
    switchToHttp: () => ({
      getRequest: () => peticion,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;

  return { contexto, peticion };
}
