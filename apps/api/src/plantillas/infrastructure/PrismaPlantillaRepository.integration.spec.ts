import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Reloj } from "../../contratos/application/ports/Reloj";
import { DomainError } from "../../shared/domain/DomainError";
import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../../shared/infrastructure/persistence/testDb";
import { PrismaPlantillaRepository } from "./PrismaPlantillaRepository";

class RelojFijo implements Reloj {
  constructor(private readonly instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
}

const HOY = new Date("2026-08-04T15:00:00.000Z");

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarBaseDeDatos(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaPlantillaRepository (integration)", () => {
  it("returns the version in force today, ignoring one that starts in the future", async () => {
    await prisma.plantillaContrato.createMany({
      data: [
        {
          id: "p-enero",
          version: "2026-01",
          condicionesGeneralesHtml: "<html>cg enero</html>",
          comodatoHtml: "<html>enero</html>",
          vigenteDesde: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "p-junio",
          version: "2026-06",
          condicionesGeneralesHtml: "<html>cg junio</html>",
          comodatoHtml: "<html>junio</html>",
          vigenteDesde: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          id: "p-futura",
          version: "2027-01",
          condicionesGeneralesHtml: "<html>cg futuro</html>",
          comodatoHtml: "<html>futuro</html>",
          vigenteDesde: new Date("2027-01-01T00:00:00.000Z"),
        },
      ],
    });

    const repo = new PrismaPlantillaRepository(prisma, new RelojFijo(HOY));
    const vigente = await repo.vigente();

    expect(vigente.version).toBe("2026-06");
  });

  it("treats a template that starts exactly today as in force", async () => {
    await prisma.plantillaContrato.create({
      data: {
        id: "p-hoy",
        version: "2026-08",
        condicionesGeneralesHtml: "<html>cg hoy</html>",
        comodatoHtml: "<html>hoy</html>",
        vigenteDesde: new Date("2026-08-04T00:00:00.000Z"),
      },
    });

    const repo = new PrismaPlantillaRepository(prisma, new RelojFijo(HOY));

    expect((await repo.vigente()).version).toBe("2026-08");
  });

  it("throws when no template version is in force yet", async () => {
    await prisma.plantillaContrato.create({
      data: {
        id: "p-futura",
        version: "2027-01",
        condicionesGeneralesHtml: "<html>cg futuro</html>",
        comodatoHtml: "<html>futuro</html>",
        vigenteDesde: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    const repo = new PrismaPlantillaRepository(prisma, new RelojFijo(HOY));

    await expect(repo.vigente()).rejects.toThrow(DomainError);
  });

  it("throws when there is no template at all", async () => {
    const repo = new PrismaPlantillaRepository(prisma, new RelojFijo(HOY));

    await expect(repo.vigente()).rejects.toThrow(DomainError);
  });
});
