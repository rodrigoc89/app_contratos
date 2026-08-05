/**
 * Loads the contract template version and the comodante signatory.
 *
 *   pnpm --filter @contratos/api prisma:seed
 *
 * Idempotent: running it again reports what was already there and writes
 * nothing. It refuses outright to install the provisional test signature in
 * production — see `seedDatabase`.
 */
// Prisma 7 no longer loads .env files automatically, and neither does Node.
// Same explicit load as prisma.config.ts, for the same reason.
import "dotenv/config";

import { RelojDelSistema } from "../src/contratos/infrastructure/RelojDelSistema";
import { PrismaFirmanteRepository } from "../src/firmantes/infrastructure/PrismaFirmanteRepository";
import { PrismaPlantillaRepository } from "../src/plantillas/infrastructure/PrismaPlantillaRepository";
import {
  buildSeedContent,
  PROVISIONAL_SIGNATORY_VERSION,
} from "../src/seed/seedContent";
import { describeSeedReport, seedDatabase } from "../src/seed/seedDatabase";
import { crearPrismaClient } from "../src/shared/infrastructure/persistence/prismaClient";

const prisma = crearPrismaClient();

try {
  const content = await buildSeedContent();

  const reporte = await seedDatabase({
    content,
    templates: new PrismaPlantillaRepository(prisma, new RelojDelSistema()),
    signatories: new PrismaFirmanteRepository(prisma),
    nodeEnv: process.env.NODE_ENV,
  });

  console.log(describeSeedReport(reporte));

  if (reporte.firmante.version === PROVISIONAL_SIGNATORY_VERSION) {
    console.log(
      `ATENCION: el comodante quedó firmando con la imagen de prueba ("FIRMA DE PRUEBA - NO VALIDA"). Todo contrato emitido contra esta base queda marcado con la versión de firmante "${PROVISIONAL_SIGNATORY_VERSION}" y no sirve como documento legal.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
