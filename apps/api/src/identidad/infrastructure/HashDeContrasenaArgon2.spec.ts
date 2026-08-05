import { describe, expect, it } from "vitest";

import { HashDeContrasenaArgon2 } from "./HashDeContrasenaArgon2";

const hasher = new HashDeContrasenaArgon2();
const CONTRASENA = "una-contraseña-de-verdad-2026";

describe("HashDeContrasenaArgon2", () => {
  it("produces an argon2id digest", async () => {
    const hash = await hasher.hashear(CONTRASENA);

    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("never stores the password inside the digest", async () => {
    const hash = await hasher.hashear(CONTRASENA);

    expect(hash).not.toContain(CONTRASENA);
  });

  it("salts, so the same password twice gives two different digests", async () => {
    const uno = await hasher.hashear(CONTRASENA);
    const otro = await hasher.hashear(CONTRASENA);

    expect(uno).not.toBe(otro);
  });

  it("verifies the right password against either digest", async () => {
    const hash = await hasher.hashear(CONTRASENA);

    await expect(hasher.verificar(hash, CONTRASENA)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hasher.hashear(CONTRASENA);

    await expect(hasher.verificar(hash, "otra-cosa")).resolves.toBe(false);
    await expect(hasher.verificar(hash, "")).resolves.toBe(false);
  });

  // The login use case feeds this a decoy digest on the unknown-user path and
  // needs `false` back. If a malformed digest threw, that path would answer
  // with a 500 while the real path answered 401 — a louder oracle than the
  // timing difference the decoy exists to hide.
  it("answers false, never throws, on a malformed digest", async () => {
    await expect(hasher.verificar("no-es-un-hash", CONTRASENA)).resolves.toBe(
      false,
    );
    await expect(hasher.verificar("", CONTRASENA)).resolves.toBe(false);
  });

  it("offers a decoy digest that verifies against nothing", async () => {
    const senuelo = hasher.hashSenuelo();

    expect(senuelo.startsWith("$argon2id$")).toBe(true);
    await expect(hasher.verificar(senuelo, CONTRASENA)).resolves.toBe(false);
    await expect(hasher.verificar(senuelo, "")).resolves.toBe(false);
  });

  it("handles non-ASCII passwords, since these are Spanish-speaking users", async () => {
    const hash = await hasher.hashear("contraseña-con-ñ-y-tildes-áéí");

    await expect(
      hasher.verificar(hash, "contraseña-con-ñ-y-tildes-áéí"),
    ).resolves.toBe(true);
  });
});
