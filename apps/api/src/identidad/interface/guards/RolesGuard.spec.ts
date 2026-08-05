import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";

import { Publico } from "../decorators/Publico";
import { Roles } from "../decorators/Roles";
import { CLAVE_USUARIO_AUTENTICADO } from "../decorators/UsuarioActual";
import { contextoDePrueba } from "./contextoDePrueba.testing";
import { RolesGuard } from "./RolesGuard";

let guard: RolesGuard;

beforeEach(() => {
  guard = new RolesGuard(new Reflector());
});

class Controlador {
  sinRoles(): void {}

  @Roles("admin")
  soloAdmin(): void {}

  @Roles("oficina", "admin")
  oficinaOAdmin(): void {}

  @Publico()
  @Roles("admin")
  publicoConRoles(): void {}
}

@Roles("admin")
class ControladorDeAdministracion {
  cualquiera(): void {}
}

function contextoCon(
  handler: (...args: never[]) => unknown,
  rol: string | null,
  clase?: new (...args: never[]) => unknown,
) {
  return contextoDePrueba({
    handler,
    ...(clase === undefined ? {} : { clase }),
    peticion:
      rol === null
        ? {}
        : { [CLAVE_USUARIO_AUTENTICADO]: { usuarioId: "usuario-1", rol } },
  }).contexto;
}

describe("RolesGuard", () => {
  it("lets a handler with no @Roles() through — authentication already happened", () => {
    expect(
      guard.canActivate(contextoCon(Controlador.prototype.sinRoles, "tecnico")),
    ).toBe(true);
  });

  it("lets the listed role through", () => {
    expect(
      guard.canActivate(contextoCon(Controlador.prototype.soloAdmin, "admin")),
    ).toBe(true);
  });

  it("rejects a role that is not listed", () => {
    expect(() =>
      guard.canActivate(contextoCon(Controlador.prototype.soloAdmin, "tecnico")),
    ).toThrow(ForbiddenException);
  });

  it("accepts any of several listed roles", () => {
    for (const rol of ["oficina", "admin"]) {
      expect(
        guard.canActivate(
          contextoCon(Controlador.prototype.oficinaOAdmin, rol),
        ),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(
        contextoCon(Controlador.prototype.oficinaOAdmin, "tecnico"),
      ),
    ).toThrow(ForbiddenException);
  });

  it("honours @Roles() declared on the controller class", () => {
    expect(
      guard.canActivate(
        contextoCon(
          ControladorDeAdministracion.prototype.cualquiera,
          "admin",
          ControladorDeAdministracion,
        ),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        contextoCon(
          ControladorDeAdministracion.prototype.cualquiera,
          "oficina",
          ControladorDeAdministracion,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  // Reaching this guard with no identity means the auth guard did not run, or
  // ran and let an anonymous request past. Either way the safe answer is no.
  it("rejects a role-restricted handler that carries no verified identity", () => {
    expect(() =>
      guard.canActivate(contextoCon(Controlador.prototype.soloAdmin, null)),
    ).toThrow(UnauthorizedException);
  });

  // @Publico() answers "who may call this", so a role list on the same handler
  // is a contradiction. Refusing it loudly beats silently picking one.
  it("refuses a handler that is both public and role-restricted", () => {
    expect(() =>
      guard.canActivate(
        contextoCon(Controlador.prototype.publicoConRoles, "admin"),
      ),
    ).toThrow();
  });

  it("never reveals which roles a handler wanted", () => {
    const error = (() => {
      try {
        guard.canActivate(
          contextoCon(Controlador.prototype.soloAdmin, "tecnico"),
        );
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(error?.message).not.toContain("admin");
  });
});
