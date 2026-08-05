import { beforeEach, describe, expect, it } from "vitest";

import { SesionInvalida } from "../domain/ErroresDeIdentidad";
import { Usuario } from "../domain/Usuario";
import {
  bancoDePruebas,
  usuarioDePrueba,
  type BancoDePruebas,
} from "./dobles.testing";
import { IniciarSesion } from "./IniciarSesion";
import { RefrescarSesion } from "./RefrescarSesion";

const CONTRASENA = "una-contrasena-larga";
const UN_DIA_MS = 24 * 60 * 60 * 1000;

let banco: BancoDePruebas;
let iniciarSesion: IniciarSesion;
let refrescarSesion: RefrescarSesion;

beforeEach(() => {
  banco = bancoDePruebas();
  iniciarSesion = new IniciarSesion(banco);
  refrescarSesion = new RefrescarSesion(banco);
});

async function sesionAbierta(): Promise<string> {
  await usuarioDePrueba(banco, { contrasena: CONTRASENA });
  const sesion = await iniciarSesion.ejecutar({
    nombreUsuario: "jperez",
    contrasena: CONTRASENA,
  });
  return sesion.tokenDeRefresco;
}

describe("RefrescarSesion", () => {
  describe("rotation", () => {
    it("returns a new access token and a brand-new refresh token", async () => {
      const original = await sesionAbierta();

      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      expect(renovada.tokenDeAcceso).toBe("acceso.usuario-1.tecnico");
      expect(renovada.tokenDeRefresco).not.toBe(original);
      expect(renovada.usuario.id).toBe("usuario-1");
    });

    it("burns the consumed token and points it at its successor", async () => {
      const original = await sesionAbierta();

      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      const consumido = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(original),
      );
      const sucesor = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(renovada.tokenDeRefresco),
      );

      expect(consumido?.estaRevocado).toBe(true);
      expect(consumido?.motivoDeRevocacion).toBe("rotacion");
      expect(consumido?.reemplazadoPor).toBe(sucesor?.id);
      expect(sucesor?.estaRevocado).toBe(false);
    });

    it("keeps the successor inside the same family, so revoking the device still works", async () => {
      const original = await sesionAbierta();

      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      const consumido = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(original),
      );
      const sucesor = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(renovada.tokenDeRefresco),
      );

      expect(sucesor?.familiaId).toBe(consumido?.familiaId);
    });

    it("stores only a digest of the successor", async () => {
      const original = await sesionAbierta();

      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      expect(JSON.stringify(banco.tokens.guardados)).not.toContain(
        renovada.tokenDeRefresco,
      );
    });

    it("chains: each rotation is usable exactly once", async () => {
      let token = await sesionAbierta();

      for (let vuelta = 0; vuelta < 3; vuelta += 1) {
        const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: token });
        token = renovada.tokenDeRefresco;
      }

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: token }),
      ).resolves.toBeDefined();
    });

    it("pushes the expiry forward on every rotation", async () => {
      const original = await sesionAbierta();
      banco.reloj.avanzar(UN_DIA_MS);

      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      const sucesor = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(renovada.tokenDeRefresco),
      );
      expect(sucesor?.expiraEn.getTime()).toBe(
        banco.reloj.ahora().getTime() + 30 * UN_DIA_MS,
      );
    });
  });

  describe("rejection", () => {
    it("rejects a token it never issued", async () => {
      await sesionAbierta();

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: "inventado" }),
      ).rejects.toThrow(SesionInvalida);
    });

    it("rejects an expired token and takes the family down with it", async () => {
      const original = await sesionAbierta();
      banco.reloj.avanzar(31 * UN_DIA_MS);

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      ).rejects.toThrow(SesionInvalida);

      const consumido = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(original),
      );
      expect(consumido?.estaRevocado).toBe(true);
    });

    // A user deactivated mid-shift must stop working at the next refresh at
    // the latest — that is the whole reason refresh consults the repository
    // instead of trusting the claims it was handed.
    it("rejects a refresh for a user deactivated since login, and revokes the family", async () => {
      const original = await sesionAbierta();
      const usuario = await banco.usuarios.buscarPorId("usuario-1");
      await banco.usuarios.guardar((usuario as Usuario).desactivar());

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      ).rejects.toThrow(SesionInvalida);

      const consumido = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(original),
      );
      expect(consumido?.estaRevocado).toBe(true);
      expect(consumido?.motivoDeRevocacion).toBe("usuario_inactivo");
    });

    it("rejects a refresh for a user that no longer exists", async () => {
      const original = await sesionAbierta();
      const vacio = bancoDePruebas();
      const sinUsuario = new RefrescarSesion({
        ...banco,
        usuarios: vacio.usuarios,
      });

      await expect(
        sinUsuario.ejecutar({ tokenDeRefresco: original }),
      ).rejects.toThrow(SesionInvalida);
    });

    it("answers an unknown token with exactly the same message as a stolen one", async () => {
      const original = await sesionAbierta();
      await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      const porDesconocido = await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: "inventado" }),
      );
      const porReuso = await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      );

      expect(porReuso?.message).toBe(porDesconocido?.message);
    });
  });

  describe("reuse detection", () => {
    // Rotation means the legitimate device has already moved on to the
    // successor. A second presentation of a burnt token therefore came from a
    // copy of it, and there is no way to tell which of the two holders is the
    // thief — so both lose the session.
    it("treats a second use of a rotated token as theft and revokes the whole family", async () => {
      const original = await sesionAbierta();
      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      ).rejects.toThrow(SesionInvalida);

      const sucesor = await banco.tokens.buscarPorHash(
        banco.generador.hashDe(renovada.tokenDeRefresco),
      );
      expect(sucesor?.estaRevocado).toBe(true);
      expect(sucesor?.motivoDeRevocacion).toBe("reuso_detectado");
    });

    it("leaves the legitimate successor unusable afterwards", async () => {
      const original = await sesionAbierta();
      const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: original });
      await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      );

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: renovada.tokenDeRefresco }),
      ).rejects.toThrow(SesionInvalida);
    });

    it("does not touch a different device's family", async () => {
      await usuarioDePrueba(banco, { contrasena: CONTRASENA });
      const tablet1 = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });
      const tablet2 = await iniciarSesion.ejecutar({
        nombreUsuario: "jperez",
        contrasena: CONTRASENA,
      });

      await refrescarSesion.ejecutar({ tokenDeRefresco: tablet1.tokenDeRefresco });
      await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: tablet1.tokenDeRefresco }),
      );

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: tablet2.tokenDeRefresco }),
      ).resolves.toBeDefined();
    });

    it("says so in the security log, without printing the token", async () => {
      const original = await sesionAbierta();
      await refrescarSesion.ejecutar({ tokenDeRefresco: original });
      banco.registro.lineas.length = 0;

      await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      );

      const advertencias = banco.registro.lineas.filter(
        (linea) => linea.nivel === "advertencia",
      );
      expect(advertencias).not.toHaveLength(0);
      expect(banco.registro.texto).toMatch(/reutiliz|reus|robo/i);
      expect(banco.registro.texto).not.toContain(original);
      expect(banco.registro.texto).not.toContain(banco.generador.hashDe(original));
    });

    // A token presented after the technician deliberately signed out is a dead
    // session, not a stolen one. Calling it theft in the log would train
    // whoever reads these into ignoring the word.
    it("does not cry theft over a token that was revoked by a logout", async () => {
      const original = await sesionAbierta();
      await banco.tokens.revocarFamilia(
        banco.tokens.guardados[0]?.familiaId ?? "",
        "cierre_de_sesion",
        banco.reloj.ahora(),
      );
      banco.registro.lineas.length = 0;

      await expect(
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      ).rejects.toThrow(SesionInvalida);

      expect(banco.registro.texto).not.toMatch(/robo/i);
      expect(banco.registro.texto).toContain("cierre_de_sesion");
    });

    it("still cries theft when the token was burnt by a rotation", async () => {
      const original = await sesionAbierta();
      await refrescarSesion.ejecutar({ tokenDeRefresco: original });
      banco.registro.lineas.length = 0;

      await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      );

      expect(banco.registro.texto).toMatch(/robo/i);
    });

    it("reports how many live tokens the revocation took down", async () => {
      const original = await sesionAbierta();
      await refrescarSesion.ejecutar({ tokenDeRefresco: original });
      banco.registro.lineas.length = 0;

      await capturar(() =>
        refrescarSesion.ejecutar({ tokenDeRefresco: original }),
      );

      expect(banco.registro.texto).toContain("1");
    });
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
