import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { limpiarTablasDeIdentidad } from "../../identidad/infrastructure/identidadTestDb";
import { crearClienteDeIntegracion } from "../../shared/infrastructure/persistence/testDb";
import { PrismaDirectorioDeAutores } from "./PrismaDirectorioDeAutores";

const prisma = crearClienteDeIntegracion();

const ID_OFICINA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ID_DESCONOCIDO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";

async function sembrarUsuarios(): Promise<void> {
  await prisma.usuario.createMany({
    data: [
      {
        id: ID_OFICINA,
        nombreUsuario: "oficina",
        nombreCompleto: "Marcela Coronel",
        rol: "oficina",
        hashContrasena: "no-usado-en-esta-prueba",
      },
      {
        id: ID_ADMIN,
        nombreUsuario: "admin",
        nombreCompleto: "Sergio Ibáñez",
        rol: "admin",
        activo: false,
        hashContrasena: "no-usado-en-esta-prueba",
      },
    ],
  });
}

describe("PrismaDirectorioDeAutores", () => {
  beforeEach(async () => {
    await limpiarTablasDeIdentidad(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("resolves each id to the person's full name", async () => {
    await sembrarUsuarios();
    const directorio = new PrismaDirectorioDeAutores(prisma);

    const nombres = await directorio.nombresPorId([ID_OFICINA, ID_ADMIN]);

    expect(nombres.get(ID_OFICINA)).toBe("Marcela Coronel");
    expect(nombres.get(ID_ADMIN)).toBe("Sergio Ibáñez");
  });

  /**
   * Best-effort by design. The event row is the audit record and it outlives
   * the identity row it points at — `contrato_eventos.usuario_id` carries no
   * foreign key precisely so it can. An id with no user must therefore be an
   * absent key, never a throw that would take the whole contract read down
   * with it.
   */
  it("omits ids that resolve to nobody instead of failing", async () => {
    await sembrarUsuarios();
    const directorio = new PrismaDirectorioDeAutores(prisma);

    const nombres = await directorio.nombresPorId([ID_OFICINA, ID_DESCONOCIDO]);

    expect(nombres.has(ID_DESCONOCIDO)).toBe(false);
    expect(nombres.size).toBe(1);
  });

  /**
   * A deactivated account still signed off on a transition that happened.
   * Hiding its name would rewrite the history the record exists to preserve —
   * `activo` governs whether someone can log in, never whether what they did
   * is still true.
   */
  it("still names a deactivated user", async () => {
    await sembrarUsuarios();
    const directorio = new PrismaDirectorioDeAutores(prisma);

    const nombres = await directorio.nombresPorId([ID_ADMIN]);

    expect(nombres.get(ID_ADMIN)).toBe("Sergio Ibáñez");
  });

  /**
   * The common case is a contract whose only events are `creado` and
   * `firmado`, neither of which has an actor. That must cost no query at all,
   * so this asserts the short-circuit rather than the result: a client with
   * no connection can still answer it.
   */
  it("answers an empty request without touching the database", async () => {
    const prismaQueRompe = {
      usuario: {
        findMany: () => {
          throw new Error("no debería consultarse");
        },
      },
    } as unknown as typeof prisma;

    const nombres = await new PrismaDirectorioDeAutores(
      prismaQueRompe,
    ).nombresPorId([]);

    expect(nombres.size).toBe(0);
  });

  it("asks for no column beyond the id and the name", async () => {
    await sembrarUsuarios();
    let seleccion: unknown;
    const prismaEspia = {
      usuario: {
        findMany: (argumentos: { select?: unknown }) => {
          seleccion = argumentos.select;
          return Promise.resolve([]);
        },
      },
    } as unknown as typeof prisma;

    await new PrismaDirectorioDeAutores(prismaEspia).nombresPorId([ID_OFICINA]);

    expect(seleccion).toEqual({ id: true, nombreCompleto: true });
  });
});
