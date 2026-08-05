import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { TokenDeRefresco } from "./TokenDeRefresco";

const AHORA = new Date("2026-08-05T12:00:00.000Z");
const HASH = "a".repeat(64);

function emitir(overrides: Partial<Parameters<typeof TokenDeRefresco.emitir>[0]> = {}) {
  return TokenDeRefresco.emitir({
    id: "token-1",
    usuarioId: "usuario-1",
    familiaId: "familia-1",
    hash: HASH,
    emitidoEn: AHORA,
    expiraEn: new Date(AHORA.getTime() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

describe("TokenDeRefresco", () => {
  it("is usable while it is neither revoked nor expired", () => {
    const token = emitir();

    expect(token.estaRevocado).toBe(false);
    expect(token.esUsableEn(AHORA)).toBe(true);
  });

  it("rejects an expiry that is not after the issue instant", () => {
    expect(() => emitir({ expiraEn: AHORA })).toThrow(DomainError);
  });

  it("rejects an empty id, user, family or hash", () => {
    expect(() => emitir({ id: "" })).toThrow(DomainError);
    expect(() => emitir({ usuarioId: " " })).toThrow(DomainError);
    expect(() => emitir({ familiaId: "" })).toThrow(DomainError);
    expect(() => emitir({ hash: "" })).toThrow(DomainError);
  });

  it("stops being usable once its expiry passes", () => {
    const token = emitir();
    const despues = new Date(token.expiraEn.getTime() + 1);

    expect(token.esUsableEn(despues)).toBe(false);
  });

  it("stops being usable once revoked", () => {
    const token = emitir();

    token.revocar("cierre_de_sesion", AHORA);

    expect(token.estaRevocado).toBe(true);
    expect(token.motivoDeRevocacion).toBe("cierre_de_sesion");
    expect(token.esUsableEn(AHORA)).toBe(false);
  });

  // Rotation is a revocation with a forwarding address: it is what lets the
  // reuse check tell "an old link in the chain" from "a token we never issued".
  it("rotating it revokes it and records the successor", () => {
    const token = emitir();

    token.rotarPor("token-2", AHORA);

    expect(token.estaRevocado).toBe(true);
    expect(token.motivoDeRevocacion).toBe("rotacion");
    expect(token.reemplazadoPor).toBe("token-2");
    expect(token.esUsableEn(AHORA)).toBe(false);
  });

  it("refuses to revoke twice, so the first reason is never overwritten", () => {
    const token = emitir();
    token.rotarPor("token-2", AHORA);

    expect(() => token.revocar("reuso_detectado", AHORA)).toThrow(DomainError);
    expect(token.motivoDeRevocacion).toBe("rotacion");
  });

  it("rebuilds from stored state without replaying the transitions", () => {
    const revocadoEn = new Date(AHORA.getTime() + 1000);
    const token = TokenDeRefresco.rehidratar({
      id: "token-1",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      hash: HASH,
      emitidoEn: AHORA,
      expiraEn: new Date(AHORA.getTime() + 1000 * 60),
      revocadoEn,
      motivoDeRevocacion: "reuso_detectado",
      reemplazadoPor: null,
    });

    expect(token.estaRevocado).toBe(true);
    expect(token.motivoDeRevocacion).toBe("reuso_detectado");
    expect(token.revocadoEn?.getTime()).toBe(revocadoEn.getTime());
  });

  it("rejects stored state that is revoked without a reason", () => {
    expect(() =>
      TokenDeRefresco.rehidratar({
        id: "token-1",
        usuarioId: "usuario-1",
        familiaId: "familia-1",
        hash: HASH,
        emitidoEn: AHORA,
        expiraEn: new Date(AHORA.getTime() + 1000),
        revocadoEn: AHORA,
        motivoDeRevocacion: null,
        reemplazadoPor: null,
      }),
    ).toThrow(DomainError);
  });

  // The stored hash is the only thing standing between a database dump and a
  // working session on every tablet in the fleet.
  it("never serialises the token hash", () => {
    const serializado = JSON.stringify(emitir());

    expect(serializado).not.toContain(HASH);
    expect(serializado).not.toContain("hash");
  });

  it("hands back defensive copies of its instants", () => {
    const token = emitir();

    token.expiraEn.setFullYear(1999);

    expect(token.expiraEn.getFullYear()).toBe(2026);
  });
});
