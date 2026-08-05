import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { crearClienteDeIntegracion } from "../../shared/infrastructure/persistence/testDb";
import type { RolUsuario } from "../domain/Usuario";
import { Usuario } from "../domain/Usuario";
import { limpiarTablasDeIdentidad } from "./identidadTestDb";
import { PrismaUsuarioRepository } from "./PrismaUsuarioRepository";

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarTablasDeIdentidad(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function usuarioDePrueba(datos: {
  id?: string;
  nombreUsuario?: string;
  nombreCompleto?: string;
  rol?: RolUsuario;
  activo?: boolean;
  hashDeContrasena?: string;
} = {}): Usuario {
  return Usuario.crear({
    id: datos.id ?? "usuario-1",
    nombreUsuario: datos.nombreUsuario ?? "jperez",
    nombreCompleto: datos.nombreCompleto ?? "Juan Pérez",
    rol: datos.rol ?? "tecnico",
    activo: datos.activo ?? true,
    hashDeContrasena: datos.hashDeContrasena ?? "hash-argon2id",
  });
}

describe("PrismaUsuarioRepository (integration)", () => {
  it("returns null when the id is unknown", async () => {
    const repo = new PrismaUsuarioRepository(prisma);

    await expect(repo.buscarPorId("no-existe")).resolves.toBeNull();
  });

  it("returns null when the login name is unknown", async () => {
    const repo = new PrismaUsuarioRepository(prisma);

    await expect(
      repo.buscarPorNombreUsuario("no-existe"),
    ).resolves.toBeNull();
  });

  it("saves a user and reads it back with its role, activo flag and hash intact", async () => {
    const repo = new PrismaUsuarioRepository(prisma);
    const usuario = usuarioDePrueba({
      rol: "oficina",
      activo: false,
      hashDeContrasena: "hash-super-secreto",
    });

    await repo.guardar(usuario);
    const leido = await repo.buscarPorId(usuario.id);

    expect(leido).not.toBeNull();
    expect(leido?.rol).toBe("oficina");
    expect(leido?.activo).toBe(false);
    expect(leido?.hashDeContrasena).toBe("hash-super-secreto");
  });

  it("normalises the login name before searching: trims spaces and lowercases", async () => {
    const repo = new PrismaUsuarioRepository(prisma);
    await repo.guardar(usuarioDePrueba({ nombreUsuario: "jperez" }));

    const encontrado = await repo.buscarPorNombreUsuario(" JPerez ");

    expect(encontrado).not.toBeNull();
    expect(encontrado?.nombreUsuario).toBe("jperez");
  });

  it("guardar is idempotent: saving a changed user again updates it in place", async () => {
    const repo = new PrismaUsuarioRepository(prisma);
    await repo.guardar(
      usuarioDePrueba({ nombreCompleto: "Juan Pérez" }),
    );

    await repo.guardar(
      usuarioDePrueba({ nombreCompleto: "Juan Pérez Actualizado" }),
    );

    const total = await prisma.usuario.count();
    expect(total).toBe(1);

    const leido = await repo.buscarPorId("usuario-1");
    expect(leido?.nombreCompleto).toBe("Juan Pérez Actualizado");
  });

  it("the unique index on nombre_usuario rejects a second user with the same login name", async () => {
    const repo = new PrismaUsuarioRepository(prisma);
    await repo.guardar(
      usuarioDePrueba({ id: "usuario-1", nombreUsuario: "jperez" }),
    );

    await expect(
      repo.guardar(
        usuarioDePrueba({ id: "usuario-2", nombreUsuario: "jperez" }),
      ),
    ).rejects.toThrow();
  });
});
