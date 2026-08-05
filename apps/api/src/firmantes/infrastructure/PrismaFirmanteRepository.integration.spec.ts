import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../../shared/infrastructure/persistence/testDb";
import { PrismaFirmanteRepository } from "./PrismaFirmanteRepository";

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarBaseDeDatos(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaFirmanteRepository (integration)", () => {
  it("returns the active signatory, ignoring inactive ones", async () => {
    await prisma.firmanteComodante.createMany({
      data: [
        {
          id: "f-viejo",
          version: "v0",
          nombreCompleto: "Alguien Viejo",
          dni: "11111111",
          imagenFirmaPng: "data:image/png;base64,viejo",
          activo: false,
        },
        {
          id: "f-actual",
          version: "v1",
          nombreCompleto: "Sieira Guillermo Federico",
          dni: "27582030",
          imagenFirmaPng: "data:image/png;base64,actual",
          activo: true,
        },
      ],
    });

    const repo = new PrismaFirmanteRepository(prisma);
    const firmante = await repo.activo();

    expect(firmante.id).toBe("f-actual");
    expect(firmante.dni.formateado).toBe("27.582.030");
  });

  it("throws when no signatory is active", async () => {
    await prisma.firmanteComodante.create({
      data: {
        id: "f-inactivo",
        version: "v0",
        nombreCompleto: "Nadie",
        dni: "11111111",
        imagenFirmaPng: "data:image/png;base64,x",
        activo: false,
      },
    });

    const repo = new PrismaFirmanteRepository(prisma);

    await expect(repo.activo()).rejects.toThrow(DomainError);
  });

  it("throws when there is no signatory at all", async () => {
    const repo = new PrismaFirmanteRepository(prisma);

    await expect(repo.activo()).rejects.toThrow(DomainError);
  });

  it("the partial unique index enforces at most one active signatory", async () => {
    await prisma.firmanteComodante.create({
      data: {
        id: "f-1",
        version: "v1",
        nombreCompleto: "Uno",
        dni: "11111111",
        imagenFirmaPng: "data:image/png;base64,uno",
        activo: true,
      },
    });

    await expect(
      prisma.firmanteComodante.create({
        data: {
          id: "f-2",
          version: "v2",
          nombreCompleto: "Dos",
          dni: "22222222",
          imagenFirmaPng: "data:image/png;base64,dos",
          activo: true,
        },
      }),
    ).rejects.toThrow();
  });
});
