import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Reloj } from "../contratos/application/ports/Reloj";
import { PrismaFirmanteRepository } from "../firmantes/infrastructure/PrismaFirmanteRepository";
import { PrismaPlantillaRepository } from "../plantillas/infrastructure/PrismaPlantillaRepository";
import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../shared/infrastructure/persistence/testDb";
import {
  buildSeedContent,
  PROVISIONAL_SIGNATORY_VERSION,
  SIGNATORY_VERSION,
  TEMPLATE_VERSION,
} from "./seedContent";
import { seedDatabase } from "./seedDatabase";

class RelojFijo implements Reloj {
  ahora(): Date {
    return new Date("2026-08-04T15:00:00.000Z");
  }
}

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarBaseDeDatos(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function sembrar(nodeEnv: string | undefined = "test") {
  return await seedDatabase({
    content: await buildSeedContent(),
    templates: new PrismaPlantillaRepository(prisma, new RelojFijo()),
    signatories: new PrismaFirmanteRepository(prisma),
    nodeEnv,
  });
}

describe("seedDatabase (integration)", () => {
  it("loads the template version and the active signatory on an empty database", async () => {
    const reporte = await sembrar();

    expect(reporte.plantilla).toEqual({
      version: TEMPLATE_VERSION,
      action: "created",
    });
    expect(reporte.firmante).toEqual({
      version: SIGNATORY_VERSION,
      action: "created",
    });

    expect(await prisma.plantillaContrato.count()).toBe(1);
    expect(await prisma.firmanteComodante.count({ where: { activo: true } })).toBe(1);
  });

  it("is idempotent: seeding twice leaves exactly one template version and one signatory", async () => {
    await sembrar();
    const segundo = await sembrar();

    expect(segundo.plantilla.action).toBe("already-present");
    expect(segundo.firmante.action).toBe("already-present");

    expect(await prisma.plantillaContrato.count()).toBe(1);
    expect(await prisma.firmanteComodante.count()).toBe(1);
  });

  it("leaves the seeded rows readable through the very ports the signing flow uses", async () => {
    await sembrar();

    const plantillas = new PrismaPlantillaRepository(prisma, new RelojFijo());
    const firmantes = new PrismaFirmanteRepository(prisma);

    const vigente = await plantillas.vigente();
    expect(vigente.version).toBe(TEMPLATE_VERSION);
    expect(vigente.condicionesGeneralesHtml).toContain(
      "CONDICIONES GENERALES DE USO",
    );
    expect(vigente.comodatoHtml).toContain("CONTRATO DE COMODATO");

    const activo = await firmantes.activo();
    expect(activo.version).toBe(SIGNATORY_VERSION);
    expect(activo.nombreCompleto).toBe("SIEIRA GUILLERMO FEDERICO");
    expect(activo.dni.formateado).toBe("27.582.030");
    expect(activo.imagenFirmaPng.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses to touch a production database while the signature is the provisional one", async () => {
    if (SIGNATORY_VERSION !== PROVISIONAL_SIGNATORY_VERSION) {
      // The real signature has been loaded, so there is nothing to refuse
      // here any more. Both branches of the guard stay covered by the unit
      // spec, which drives the version explicitly.
      return;
    }

    await expect(sembrar("production")).rejects.toThrow(/firma real/i);

    expect(await prisma.plantillaContrato.count()).toBe(0);
    expect(await prisma.firmanteComodante.count()).toBe(0);
  });
});
