import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { crearClienteDeIntegracion } from "../../shared/infrastructure/persistence/testDb";
import { TokenDeRefresco } from "../domain/TokenDeRefresco";
import { limpiarTablasDeIdentidad } from "./identidadTestDb";
import { PrismaTokenDeRefrescoRepository } from "./PrismaTokenDeRefrescoRepository";

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarTablasDeIdentidad(prisma);

  // Tokens carry a FK to usuarios, so every case needs one row to hang off.
  await prisma.usuario.create({
    data: {
      id: "usuario-1",
      nombreUsuario: "jperez",
      nombreCompleto: "Juan Pérez",
      rol: "tecnico",
      hashContrasena: "hash-argon2id",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function tokenDePrueba(datos: {
  id?: string;
  familiaId?: string;
  hash?: string;
} = {}): TokenDeRefresco {
  return TokenDeRefresco.emitir({
    id: datos.id ?? "token-1",
    usuarioId: "usuario-1",
    familiaId: datos.familiaId ?? "familia-1",
    hash: datos.hash ?? "hash-abc",
    emitidoEn: new Date("2026-01-01T10:00:00.000Z"),
    expiraEn: new Date("2026-02-01T10:00:00.000Z"),
  });
}

describe("PrismaTokenDeRefrescoRepository (integration)", () => {
  it("returns null when the hash is unknown", async () => {
    const repo = new PrismaTokenDeRefrescoRepository(prisma);

    await expect(repo.buscarPorHash("no-existe")).resolves.toBeNull();
  });

  it("round-trips a live token", async () => {
    const repo = new PrismaTokenDeRefrescoRepository(prisma);
    await repo.guardar(tokenDePrueba());

    const leido = await repo.buscarPorHash("hash-abc");

    expect(leido).not.toBeNull();
    expect(leido?.id).toBe("token-1");
    expect(leido?.usuarioId).toBe("usuario-1");
    expect(leido?.familiaId).toBe("familia-1");
    expect(leido?.estaRevocado).toBe(false);
  });

  it("round-trips a revoked token, keeping its reason", async () => {
    const repo = new PrismaTokenDeRefrescoRepository(prisma);
    const token = tokenDePrueba();
    token.revocar("cierre_de_sesion", new Date("2026-01-05T00:00:00.000Z"));

    await repo.guardar(token);
    const leido = await repo.buscarPorHash("hash-abc");

    expect(leido?.estaRevocado).toBe(true);
    expect(leido?.motivoDeRevocacion).toBe("cierre_de_sesion");
    expect(leido?.revocadoEn?.toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });

  it("guardar again persists a rotation, including the successor id", async () => {
    const repo = new PrismaTokenDeRefrescoRepository(prisma);
    const token = tokenDePrueba();
    await repo.guardar(token);

    token.rotarPor("token-2", new Date("2026-01-10T00:00:00.000Z"));
    await repo.guardar(token);

    const leido = await repo.buscarPorHash("hash-abc");
    expect(leido?.estaRevocado).toBe(true);
    expect(leido?.motivoDeRevocacion).toBe("rotacion");
    expect(leido?.reemplazadoPor).toBe("token-2");
  });

  it("the unique index on token_hash rejects a duplicate digest", async () => {
    const repo = new PrismaTokenDeRefrescoRepository(prisma);
    await repo.guardar(tokenDePrueba({ id: "token-1", hash: "hash-abc" }));

    await expect(
      repo.guardar(tokenDePrueba({ id: "token-2", hash: "hash-abc" })),
    ).rejects.toThrow();
  });

  it("the CHECK constraint rejects a raw insert that is revoked with no reason", async () => {
    await expect(
      prisma.tokenDeRefresco.create({
        data: {
          id: "token-invalido",
          usuarioId: "usuario-1",
          familiaId: "familia-1",
          tokenHash: "hash-invalido",
          expiraEn: new Date("2026-02-01T10:00:00.000Z"),
          revocadoEn: new Date("2026-01-05T00:00:00.000Z"),
          motivoRevocacion: null,
        },
      }),
    ).rejects.toThrow();
  });

  describe("revocarFamilia", () => {
    it("revokes only the live tokens of that family and returns the count", async () => {
      const repo = new PrismaTokenDeRefrescoRepository(prisma);
      await repo.guardar(
        tokenDePrueba({ id: "token-1", hash: "hash-1", familiaId: "familia-1" }),
      );
      await repo.guardar(
        tokenDePrueba({ id: "token-2", hash: "hash-2", familiaId: "familia-1" }),
      );
      await repo.guardar(
        tokenDePrueba({ id: "token-3", hash: "hash-3", familiaId: "familia-2" }),
      );

      const cantidad = await repo.revocarFamilia(
        "familia-1",
        "reuso_detectado",
        new Date("2026-01-20T00:00:00.000Z"),
      );

      expect(cantidad).toBe(2);

      const t1 = await repo.buscarPorHash("hash-1");
      const t2 = await repo.buscarPorHash("hash-2");
      const t3 = await repo.buscarPorHash("hash-3");

      expect(t1?.estaRevocado).toBe(true);
      expect(t1?.motivoDeRevocacion).toBe("reuso_detectado");
      expect(t2?.estaRevocado).toBe(true);
      // A token of a different family must never be touched.
      expect(t3?.estaRevocado).toBe(false);
    });

    it("does not clobber the reason on an already-revoked token, and returns 0 on a repeat call", async () => {
      const repo = new PrismaTokenDeRefrescoRepository(prisma);
      await repo.guardar(
        tokenDePrueba({ id: "token-1", hash: "hash-1", familiaId: "familia-1" }),
      );

      const primero = await repo.revocarFamilia(
        "familia-1",
        "cierre_de_sesion",
        new Date("2026-01-20T00:00:00.000Z"),
      );
      expect(primero).toBe(1);

      const segundo = await repo.revocarFamilia(
        "familia-1",
        "reuso_detectado",
        new Date("2026-01-21T00:00:00.000Z"),
      );
      expect(segundo).toBe(0);

      const leido = await repo.buscarPorHash("hash-1");
      expect(leido?.motivoDeRevocacion).toBe("cierre_de_sesion");
    });
  });
});
