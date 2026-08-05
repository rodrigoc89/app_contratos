import { describe, expect, it } from "vitest";

import { EmisorDeTokenDeAccesoJwt } from "./EmisorDeTokenDeAccesoJwt";

const SECRETO = "un-secreto-de-prueba-de-al-menos-32-caracteres";

function emisor(minutos = 15, secreto = SECRETO): EmisorDeTokenDeAccesoJwt {
  return new EmisorDeTokenDeAccesoJwt({
    secreto,
    minutosDeAcceso: minutos,
    diasDeRefresco: 30,
  });
}

describe("EmisorDeTokenDeAccesoJwt", () => {
  it("issues a token that verifies back to the same claims", async () => {
    const token = await emisor().emitir({
      usuarioId: "usuario-1",
      rol: "tecnico",
    });

    await expect(emisor().verificar(token)).resolves.toEqual({
      usuarioId: "usuario-1",
      rol: "tecnico",
    });
  });

  it("issues a three-part JWT", async () => {
    const token = await emisor().emitir({ usuarioId: "u", rol: "admin" });

    expect(token.split(".")).toHaveLength(3);
  });

  // A JWT payload is base64, not encryption. Nothing personal goes in it: the
  // id and the role are enough for every guard, and a name or a DNI in there
  // would be personal data sitting in a client's localStorage.
  it("carries only the user id and the role", async () => {
    const token = await emisor().emitir({ usuarioId: "usuario-1", rol: "oficina" });
    const carga = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(Object.keys(carga).sort()).toEqual(["exp", "iat", "rol", "sub"]);
    expect(carga["sub"]).toBe("usuario-1");
    expect(carga["rol"]).toBe("oficina");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await emisor(15, "otro-secreto-igual-de-largo-para-firmar").emitir({
      usuarioId: "usuario-1",
      rol: "admin",
    });

    await expect(emisor().verificar(token)).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const token = await emisor().emitir({ usuarioId: "usuario-1", rol: "tecnico" });
    const [cabecera, , firma] = token.split(".");
    const cargaFalsa = Buffer.from(
      JSON.stringify({ sub: "usuario-1", rol: "admin" }),
      "utf8",
    ).toString("base64url");

    await expect(
      emisor().verificar(`${cabecera}.${cargaFalsa}.${firma}`),
    ).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const yaVencido = new EmisorDeTokenDeAccesoJwt({
      secreto: SECRETO,
      minutosDeAcceso: 15,
      diasDeRefresco: 30,
    });
    const token = await yaVencido.emitirParaPruebas(
      { usuarioId: "usuario-1", rol: "tecnico" },
      -60,
    );

    await expect(emisor().verificar(token)).rejects.toThrow();
  });

  it("rejects garbage", async () => {
    for (const basura of ["", "no-es-un-jwt", "a.b.c"]) {
      await expect(emisor().verificar(basura)).rejects.toThrow();
    }
  });

  it("rejects a token whose role is not one the system knows", async () => {
    const token = await emisor().emitir({
      usuarioId: "usuario-1",
      rol: "gerente" as unknown as "admin",
    });

    await expect(emisor().verificar(token)).rejects.toThrow();
  });

  it("honours the configured lifetime", async () => {
    const token = await emisor(15).emitir({ usuarioId: "u", rol: "tecnico" });
    const carga = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { iat: number; exp: number };

    expect(carga.exp - carga.iat).toBe(15 * 60);
  });
});
