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
import { HashDeContrasenaArgon2 } from "../src/identidad/infrastructure/HashDeContrasenaArgon2";
import { PrismaUsuarioRepository } from "../src/identidad/infrastructure/PrismaUsuarioRepository";
import { PrismaPlantillaRepository } from "../src/plantillas/infrastructure/PrismaPlantillaRepository";
import {
  buildSeedContent,
  PROVISIONAL_SIGNATORY_VERSION,
} from "../src/seed/seedContent";
import { describeSeedReport, seedDatabase } from "../src/seed/seedDatabase";
import { crearPrismaClient } from "../src/shared/infrastructure/persistence/prismaClient";

/**
 * Fixed, so that re-running the seed against a database that already has the
 * admin is an idempotent no-op rather than a second row.
 */
const ADMIN_ID = "usuario-admin-inicial";

const prisma = crearPrismaClient();

try {
  const content = await buildSeedContent();

  const reporte = await seedDatabase({
    content,
    templates: new PrismaPlantillaRepository(prisma, new RelojDelSistema()),
    signatories: new PrismaFirmanteRepository(prisma),
    nodeEnv: process.env.NODE_ENV,
    administrador: {
      id: ADMIN_ID,
      nombreUsuario: process.env.SEED_ADMIN_USERNAME ?? "admin",
      nombreCompleto: process.env.SEED_ADMIN_NOMBRE ?? "Administrador",
      // Read straight from the environment and never echoed anywhere. There
      // is deliberately no `?? "algo"` on this line — see `sembrarAdministrador`.
      contrasena: process.env.SEED_ADMIN_PASSWORD,
      usuarios: new PrismaUsuarioRepository(prisma),
      hasher: new HashDeContrasenaArgon2(),
    },
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
