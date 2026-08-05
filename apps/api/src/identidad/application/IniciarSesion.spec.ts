import { beforeEach, describe, expect, it } from "vitest";

import {
  CredencialesInvalidas,
  MENSAJE_CREDENCIALES_INVALIDAS,
} from "../domain/ErroresDeIdentidad";
import {
  AHORA_DE_PRUEBA,
  bancoDePruebas,
  HASH_SENUELO,
  usuarioDePrueba,
  type BancoDePruebas,
} from "./dobles.testing";
import { IniciarSesion } from "./IniciarSesion";

const CONTRASENA = "una-contrasena-larga";

let banco: BancoDePruebas;
let iniciarSesion: IniciarSesion;

beforeEach(() => {
  banco = bancoDePruebas();
  iniciarSesion = new IniciarSesion(banco);
});

describe("IniciarSesion", () => {
  describe("a successful login", () => {
    it("returns an access token, a refresh token and the public user summary", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      const sesion = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      expect(sesion.tokenDeAcceso).toBe("acceso.usuario-1.tecnico");
      expect(sesion.tokenDeRefresco).toBe("refresco-1");
      expect(sesion.expiraEnSegundos).toBe(15 * 60);
      expect(sesion.refrescoExpiraEnSegundos).toBe(30 * 24 * 60 * 60);
      expect(sesion.usuario).toEqual({
        id: "usuario-1",
        nombreUsuario: "jperez",
        nombreCompleto: "Juan Pérez",
        rol: "tecnico",
        activo: true,
      });
    });

    it("carries the user id and the role in the access token claims", async () => {
      await usuarioDePrueba(banco, { rol: "oficina", contrasena: CONTRASENA });

      const sesion = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      await expect(
        banco.emisor.verificar(sesion.tokenDeAcceso),
      ).resolves.toEqual({ usuarioId: "usuario-1", rol: "oficina" });
    });

    // The requirement that actually matters operationally: these tablets get
    // lost, and revoking one device must not mean rotating a global secret.
    it("stores only a digest of the refresh token, never the token itself", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      const sesion = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      expect(banco.tokens.guardados).toHaveLength(1);
      const almacenado = banco.tokens.guardados[0];
      expect(almacenado?.hash).toBe(banco.generador.hashDe(sesion.tokenDeRefresco));
      expect(almacenado?.hash).not.toBe(sesion.tokenDeRefresco);
      expect(JSON.stringify(banco.tokens.guardados)).not.toContain(
        sesion.tokenDeRefresco,
      );
    });

    it("opens a fresh token family, expiring at the configured horizon", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      const almacenado = banco.tokens.guardados[0];
      expect(almacenado?.usuarioId).toBe("usuario-1");
      expect(almacenado?.familiaId).toBeTruthy();
      expect(almacenado?.expiraEn.getTime()).toBe(
        AHORA_DE_PRUEBA.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
    });

    it("gives every login its own family, so one logout never signs out the other tablet", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: CONTRASENA });
      await iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: CONTRASENA });

      const [primera, segunda] = banco.tokens.guardados;
      expect(primera?.familiaId).not.toBe(segunda?.familiaId);
    });

    it("accepts the login name in any capitalisation or padding", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await expect(
        iniciarSesion.ejecutar({
          nombreUsuario: "  JPerez  ",
          contrasena: CONTRASENA,
        }),
      ).resolves.toBeDefined();
    });

    it("never leaks the password hash into the returned session", async () => {
      const usuario = await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      const sesion = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      expect(JSON.stringify(sesion)).not.toContain(usuario.hashDeContrasena);
    });
  });

  describe("a rejected login", () => {
    it("rejects a wrong password", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await expect(
        iniciarSesion.ejecutar({
          nombreUsuario: "jperez",
          contrasena: "otra-cosa",
        }),
      ).rejects.toThrow(CredencialesInvalidas);

      expect(banco.tokens.guardados).toHaveLength(0);
    });

    it("rejects an unknown user with exactly the same message as a wrong password", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      const porContrasena = await capturar(() =>
        iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: "mala" }),
      );
      const porUsuario = await capturar(() =>
        iniciarSesion.ejecutar({ nombreUsuario: "nadie", contrasena: "mala" }),
      );

      expect(porUsuario?.message).toBe(MENSAJE_CREDENCIALES_INVALIDAS);
      expect(porUsuario?.message).toBe(porContrasena?.message);
    });

    // Same message is not enough: an early `return` on the unknown-user branch
    // answers in a millisecond while a real miss pays for a full argon2
    // verification, and that difference is a username oracle on its own.
    it("burns a verification against a decoy hash when the user does not exist", async () => {
      await expect(
        iniciarSesion.ejecutar({ nombreUsuario: "nadie", contrasena: "mala" }),
      ).rejects.toThrow(CredencialesInvalidas);

      expect(banco.hasher.verificaciones).toEqual([HASH_SENUELO]);
    });

    it("does exactly one verification on the unknown-user and wrong-password paths alike", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await capturar(() =>
        iniciarSesion.ejecutar({ nombreUsuario: "nadie", contrasena: "mala" }),
      );
      await capturar(() =>
        iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: "mala" }),
      );
      await capturar(() =>
        iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: CONTRASENA }),
      );

      // One verification per attempt, whatever the attempt turned out to be.
      expect(banco.hasher.verificaciones).toHaveLength(3);
    });

    it("rejects a deactivated user even with the right password", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA, activo: false });

      const error = await capturar(() =>
        iniciarSesion.ejecutar({
          nombreUsuario: "jperez",
          contrasena: CONTRASENA,
        }),
      );

      expect(error).toBeInstanceOf(CredencialesInvalidas);
      expect(error?.message).toBe(MENSAJE_CREDENCIALES_INVALIDAS);
      expect(banco.tokens.guardados).toHaveLength(0);
    });

    it("rejects an empty password", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await expect(
        iniciarSesion.ejecutar({ nombreUsuario: "jperez", contrasena: "" }),
      ).rejects.toThrow(CredencialesInvalidas);
    });

    it("never writes the attempted password or hash into the security log", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });

      await capturar(() =>
        iniciarSesion.ejecutar({
          nombreUsuario: "jperez",
          contrasena: "una-clave-que-no-va",
        }),
      );

      expect(banco.registro.texto).not.toContain("una-clave-que-no-va");
      expect(banco.registro.texto).not.toContain("hash:");
    });
  });
});

async function capturar(
  accion: () => Promise<unknown>,
): Promise<Error | null> {
  try {
    await accion();
    return null;
  } catch (error) {
    return error as Error;
  }
}
