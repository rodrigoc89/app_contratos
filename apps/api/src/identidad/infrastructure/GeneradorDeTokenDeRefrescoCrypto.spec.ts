import { describe, expect, it } from "vitest";

import { GeneradorDeTokenDeRefrescoCrypto } from "./GeneradorDeTokenDeRefrescoCrypto";

const generador = new GeneradorDeTokenDeRefrescoCrypto();

describe("GeneradorDeTokenDeRefrescoCrypto", () => {
  it("generates a token and the digest that will be stored for it", () => {
    const { valor, hash } = generador.generar();

    expect(valor).not.toBe("");
    expect(hash).toBe(generador.hashDe(valor));
  });

  // 256 bits of CSPRNG output. That is what lets the stored digest be a plain
  // SHA-256 instead of argon2: there is no dictionary to run against it, and
  // the refresh lookup has to be an indexed equality check.
  it("carries at least 256 bits of entropy, url-safe", () => {
    const { valor } = generador.generar();

    expect(valor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(valor, "base64url").byteLength).toBeGreaterThanOrEqual(32);
  });

  it("never repeats a token", () => {
    const emitidos = new Set(
      Array.from({ length: 500 }, () => generador.generar().valor),
    );

    expect(emitidos.size).toBe(500);
  });

  it("hashes to a lowercase hex SHA-256, which is what the column stores", () => {
    expect(generador.hashDe("cualquier-cosa")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic, so a presented token finds its row", () => {
    expect(generador.hashDe("abc")).toBe(generador.hashDe("abc"));
  });

  it("does not let the token be recovered from its digest", () => {
    const { valor, hash } = generador.generar();

    expect(hash).not.toContain(valor);
    expect(valor).not.toContain(hash);
  });

  it("hashes the empty token without throwing, so an empty body is a plain miss", () => {
    expect(generador.hashDe("")).toMatch(/^[0-9a-f]{64}$/);
  });
});
