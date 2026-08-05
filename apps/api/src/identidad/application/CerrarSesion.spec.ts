import { beforeEach, describe, expect, it } from "vitest";

import { SesionInvalida } from "../domain/ErroresDeIdentidad";
import {
  bancoDePruebas,
  usuarioDePrueba,
  type BancoDePruebas,
} from "./dobles.testing";
import { CerrarSesion } from "./CerrarSesion";
import { IniciarSesion } from "./IniciarSesion";
import { RefrescarSesion } from "./RefrescarSesion";

const CONTRASENA = "una-contrasena-larga";

let banco: BancoDePruebas;
let iniciarSesion: IniciarSesion;
let refrescarSesion: RefrescarSesion;
let cerrarSesion: CerrarSesion;

beforeEach(() => {
  banco = bancoDePruebas();
  iniciarSesion = new IniciarSesion(banco);
  refrescarSesion = new RefrescarSesion(banco);
  cerrarSesion = new CerrarSesion(banco);
});

async function sesionAbierta(nombreUsuario = "jperez"): Promise<string> {
  const sesion = await iniciarSesion.ejecutar({
    nombreUsuario,
    contrasena: CONTRASENA,
  });
  return sesion.tokenDeRefresco;
}

describe("CerrarSesion", () => {
  it("revokes the presented token so it can never be refreshed again", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const token = await sesionAbierta();

    await cerrarSesion.ejecutar({ tokenDeRefresco: token });

    await expect(
      refrescarSesion.ejecutar({ tokenDeRefresco: token }),
    ).rejects.toThrow(SesionInvalida);
  });

  // Logging out is a device saying "I am done". The whole chain that device
  // holds goes, not just the last link — otherwise an attacker who grabbed an
  // earlier link keeps refreshing after the technician thinks they signed out.
  it("revokes the whole family, including tokens rotated earlier in the session", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const primero = await sesionAbierta();
    const renovada = await refrescarSesion.ejecutar({ tokenDeRefresco: primero });

    await cerrarSesion.ejecutar({ tokenDeRefresco: renovada.tokenDeRefresco });

    for (const token of banco.tokens.guardados) {
      expect(token.estaRevocado).toBe(true);
    }
  });

  it("records the reason as a deliberate sign-out, not as theft", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const token = await sesionAbierta();

    await cerrarSesion.ejecutar({ tokenDeRefresco: token });

    const revocado = await banco.tokens.buscarPorHash(banco.generador.hashDe(token));
    expect(revocado?.motivoDeRevocacion).toBe("cierre_de_sesion");
  });

  it("leaves the other tablet signed in", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const tablet1 = await sesionAbierta();
    const tablet2 = await sesionAbierta();

    await cerrarSesion.ejecutar({ tokenDeRefresco: tablet1 });

    await expect(
      refrescarSesion.ejecutar({ tokenDeRefresco: tablet2 }),
    ).resolves.toBeDefined();
  });

  // A logout that answered 401 for an unknown token would be a free oracle
  // for "is this stolen token still alive?", and there is nothing a client
  // could usefully do with the answer anyway.
  it("is silent and successful for a token it does not know", async () => {
    await expect(
      cerrarSesion.ejecutar({ tokenDeRefresco: "inventado" }),
    ).resolves.toBeUndefined();
  });

  it("is idempotent: closing an already-closed session is not an error", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const token = await sesionAbierta();

    await cerrarSesion.ejecutar({ tokenDeRefresco: token });

    await expect(
      cerrarSesion.ejecutar({ tokenDeRefresco: token }),
    ).resolves.toBeUndefined();
  });

  it("never writes the token into the security log", async () => {
    await usuarioDePrueba(banco, { contrasena: CONTRASENA });
    const token = await sesionAbierta();

    await cerrarSesion.ejecutar({ tokenDeRefresco: token });

    expect(banco.registro.texto).not.toContain(token);
    expect(banco.registro.texto).not.toContain(banco.generador.hashDe(token));
  });
});
