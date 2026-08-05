import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";

import { EmisorFalso } from "../../application/dobles.testing";
import { CLAVE_USUARIO_AUTENTICADO } from "../decorators/UsuarioActual";
import { Publico } from "../decorators/Publico";
import { AutenticacionGuard } from "./AutenticacionGuard";
import { contextoDePrueba } from "./contextoDePrueba.testing";

let emisor: EmisorFalso;
let guard: AutenticacionGuard;

beforeEach(() => {
  emisor = new EmisorFalso();
  guard = new AutenticacionGuard(new Reflector(), emisor);
});

/** A handler with no decorator at all — the case that must fail closed. */
class ControladorSinDecorar {
  manejar(): void {}
}

class ControladorPublico {
  @Publico()
  manejar(): void {}
}

@Publico()
class ControladorEnteroPublico {
  manejar(): void {}
}

async function tokenValido(rol = "tecnico"): Promise<string> {
  return await emisor.emitir({
    usuarioId: "usuario-1",
    rol: rol as "tecnico",
  });
}

describe("AutenticacionGuard", () => {
  describe("default deny", () => {
    // The point of registering this guard globally: a contract endpoint added
    // next month by someone who forgot about auth must fail closed, not open.
    it("rejects an undecorated handler with no Authorization header", async () => {
      const { contexto } = contextoDePrueba({
        handler: ControladorSinDecorar.prototype.manejar,
        clase: ControladorSinDecorar,
      });

      await expect(guard.canActivate(contexto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects an Authorization header that is not a Bearer token", async () => {
      const { contexto } = contextoDePrueba({
        autorizacion: "Basic dXN1YXJpbzpjbGF2ZQ==",
      });

      await expect(guard.canActivate(contexto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects an empty Bearer token", async () => {
      const { contexto } = contextoDePrueba({ autorizacion: "Bearer " });

      await expect(guard.canActivate(contexto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a token the issuer refuses", async () => {
      const { contexto } = contextoDePrueba({ autorizacion: "Bearer basura" });

      await expect(guard.canActivate(contexto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("never lets the issuer's internal error text reach the client", async () => {
      const { contexto } = contextoDePrueba({ autorizacion: "Bearer basura" });

      const error = await capturar(() => guard.canActivate(contexto));

      expect(error?.message).not.toContain("token de acceso inválido");
      expect(error?.message).toMatch(/sesión|sesion|autentic/i);
    });
  });

  describe("with a valid token", () => {
    it("lets the request through", async () => {
      const { contexto } = contextoDePrueba({
        autorizacion: `Bearer ${await tokenValido()}`,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
    });

    it("attaches the verified identity to the request, and only that", async () => {
      const { contexto, peticion } = contextoDePrueba({
        autorizacion: `Bearer ${await tokenValido("oficina")}`,
      });

      await guard.canActivate(contexto);

      expect(peticion[CLAVE_USUARIO_AUTENTICADO]).toEqual({
        usuarioId: "usuario-1",
        rol: "oficina",
      });
    });

    // The technician id ends up in ContextoDeFirma as forensic evidence. If a
    // request body could set it, the evidence would be worth nothing.
    it("ignores any identity the client tried to smuggle in the body", async () => {
      const { contexto, peticion } = contextoDePrueba({
        autorizacion: `Bearer ${await tokenValido()}`,
        peticion: {
          body: { usuarioId: "el-jefe", rol: "admin" },
          [CLAVE_USUARIO_AUTENTICADO]: { usuarioId: "impostor", rol: "admin" },
        },
      });

      await guard.canActivate(contexto);

      expect(peticion[CLAVE_USUARIO_AUTENTICADO]).toEqual({
        usuarioId: "usuario-1",
        rol: "tecnico",
      });
    });

    it("accepts the scheme in any capitalisation", async () => {
      const { contexto } = contextoDePrueba({
        autorizacion: `bearer ${await tokenValido()}`,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
    });
  });

  describe("the @Publico() opt-out", () => {
    it("lets a @Publico() handler through with no token at all", async () => {
      const { contexto } = contextoDePrueba({
        handler: ControladorPublico.prototype.manejar,
        clase: ControladorPublico,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
    });

    it("lets a @Publico() controller through for every one of its handlers", async () => {
      const { contexto } = contextoDePrueba({
        handler: ControladorEnteroPublico.prototype.manejar,
        clase: ControladorEnteroPublico,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
    });

    it("does not attach an identity to a public request", async () => {
      const { contexto, peticion } = contextoDePrueba({
        handler: ControladorPublico.prototype.manejar,
        clase: ControladorPublico,
      });

      await guard.canActivate(contexto);

      expect(peticion[CLAVE_USUARIO_AUTENTICADO]).toBeUndefined();
    });

    // Opting out has to be a decision someone typed, not something inherited.
    it("does not leak the opt-out to an undecorated sibling handler", async () => {
      const { contexto } = contextoDePrueba({
        handler: ControladorSinDecorar.prototype.manejar,
        clase: ControladorSinDecorar,
      });

      await expect(guard.canActivate(contexto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("still populates the identity on a public route that carries a token", async () => {
      const { contexto, peticion } = contextoDePrueba({
        handler: ControladorPublico.prototype.manejar,
        clase: ControladorPublico,
        autorizacion: `Bearer ${await tokenValido()}`,
      });

      await guard.canActivate(contexto);

      expect(peticion[CLAVE_USUARIO_AUTENTICADO]).toEqual({
        usuarioId: "usuario-1",
        rol: "tecnico",
      });
    });

    it("does not reject a public route that carries a broken token", async () => {
      const { contexto, peticion } = contextoDePrueba({
        handler: ControladorPublico.prototype.manejar,
        clase: ControladorPublico,
        autorizacion: "Bearer basura",
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
      expect(peticion[CLAVE_USUARIO_AUTENTICADO]).toBeUndefined();
    });
  });

  it("never throws Forbidden — deciding *what* a role may do is the other guard's job", async () => {
    const { contexto } = contextoDePrueba({});

    const error = await capturar(() => guard.canActivate(contexto));

    expect(error).not.toBeInstanceOf(ForbiddenException);
  });
});

async function capturar(accion: () => Promise<unknown>): Promise<Error | null> {
  try {
    await accion();
    return null;
  } catch (error) {
    return error as Error;
  }
}
