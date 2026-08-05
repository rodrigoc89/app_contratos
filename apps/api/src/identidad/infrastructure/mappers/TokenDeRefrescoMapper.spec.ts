import { describe, expect, it } from "vitest";

import { TokenDeRefresco } from "../../domain/TokenDeRefresco";
import { filaDesdeToken, tokenDesdeFila } from "./TokenDeRefrescoMapper";

describe("tokenDesdeFila", () => {
  it("round-trips a live token", () => {
    const emitidoEn = new Date("2026-01-01T10:00:00.000Z");
    const expiraEn = new Date("2026-01-31T10:00:00.000Z");

    const token = tokenDesdeFila({
      id: "token-1",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      tokenHash: "hash-abc",
      expiraEn,
      creadoEn: emitidoEn,
      revocadoEn: null,
      motivoRevocacion: null,
      reemplazadoPor: null,
    });

    expect(token.id).toBe("token-1");
    expect(token.usuarioId).toBe("usuario-1");
    expect(token.familiaId).toBe("familia-1");
    expect(token.hash).toBe("hash-abc");
    expect(token.emitidoEn.toISOString()).toBe(emitidoEn.toISOString());
    expect(token.expiraEn.toISOString()).toBe(expiraEn.toISOString());
    expect(token.estaRevocado).toBe(false);
    expect(token.reemplazadoPor).toBeNull();
  });

  it("keeps the reason, revocadoEn and reemplazadoPor of a revoked token", () => {
    const revocadoEn = new Date("2026-01-15T12:00:00.000Z");

    const token = tokenDesdeFila({
      id: "token-2",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      tokenHash: "hash-def",
      expiraEn: new Date("2026-01-31T10:00:00.000Z"),
      creadoEn: new Date("2026-01-01T10:00:00.000Z"),
      revocadoEn,
      motivoRevocacion: "reuso_detectado",
      reemplazadoPor: null,
    });

    expect(token.estaRevocado).toBe(true);
    expect(token.motivoDeRevocacion).toBe("reuso_detectado");
    expect(token.revocadoEn?.toISOString()).toBe(revocadoEn.toISOString());
    expect(token.reemplazadoPor).toBeNull();
  });

  it("keeps the successor id of a rotated token", () => {
    const token = tokenDesdeFila({
      id: "token-3",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      tokenHash: "hash-ghi",
      expiraEn: new Date("2026-01-31T10:00:00.000Z"),
      creadoEn: new Date("2026-01-01T10:00:00.000Z"),
      revocadoEn: new Date("2026-01-15T12:00:00.000Z"),
      motivoRevocacion: "rotacion",
      reemplazadoPor: "token-4",
    });

    expect(token.motivoDeRevocacion).toBe("rotacion");
    expect(token.reemplazadoPor).toBe("token-4");
  });
});

describe("filaDesdeToken", () => {
  it("produces the plain row for a freshly emitted token", () => {
    const emitidoEn = new Date("2026-01-01T10:00:00.000Z");
    const expiraEn = new Date("2026-01-31T10:00:00.000Z");

    const token = TokenDeRefresco.emitir({
      id: "token-1",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      hash: "hash-abc",
      emitidoEn,
      expiraEn,
    });

    expect(filaDesdeToken(token)).toEqual({
      id: "token-1",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      tokenHash: "hash-abc",
      expiraEn,
      creadoEn: emitidoEn,
      revocadoEn: null,
      motivoRevocacion: null,
      reemplazadoPor: null,
    });
  });

  it("carries the revocation reason and successor once the token is rotated", () => {
    const token = TokenDeRefresco.emitir({
      id: "token-1",
      usuarioId: "usuario-1",
      familiaId: "familia-1",
      hash: "hash-abc",
      emitidoEn: new Date("2026-01-01T10:00:00.000Z"),
      expiraEn: new Date("2026-01-31T10:00:00.000Z"),
    });

    token.rotarPor("token-2", new Date("2026-01-10T00:00:00.000Z"));

    const fila = filaDesdeToken(token);
    expect(fila.revocadoEn).toEqual(new Date("2026-01-10T00:00:00.000Z"));
    expect(fila.motivoRevocacion).toBe("rotacion");
    expect(fila.reemplazadoPor).toBe("token-2");
  });
});
