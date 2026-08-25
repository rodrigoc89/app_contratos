/**
 * Loads the contract template version, the comodante signatory and — outside
 * production — a set of demo contracts for the office list.
 *
 *   pnpm --filter @contratos/api prisma:seed
 *
 * Idempotent: running it again reports what was already there and writes
 * nothing. It refuses outright to install the provisional test signature in
 * production — see `seedDatabase` — and `seedContratosDemo` refuses to put
 * its invented people there at all.
 */
// Prisma 7 no longer loads .env files automatically, and neither does Node.
// Same explicit load as prisma.config.ts, for the same reason.
import "dotenv/config";

import { PrismaContratoRepository } from "../src/contratos/infrastructure/PrismaContratoRepository";
import { RelojDelSistema } from "../src/contratos/infrastructure/RelojDelSistema";
import { PrismaFirmanteRepository } from "../src/firmantes/infrastructure/PrismaFirmanteRepository";
import { HashDeContrasenaArgon2 } from "../src/identidad/infrastructure/HashDeContrasenaArgon2";
import { PrismaUsuarioRepository } from "../src/identidad/infrastructure/PrismaUsuarioRepository";
import { PrismaPlantillaRepository } from "../src/plantillas/infrastructure/PrismaPlantillaRepository";
import {
  buildSeedContent,
  PROVISIONAL_SIGNATORY_VERSION,
} from "../src/seed/seedContent";
import {
  describeContratosDemoReport,
  seedContratosDemo,
} from "../src/seed/seedContratosDemo";
import { describeSeedReport, seedDatabase } from "../src/seed/seedDatabase";
import { crearPrismaClient } from "../src/shared/infrastructure/persistence/prismaClient";

/**
 * Fixed, so that re-running the seed against a database that already has the
 * admin is an idempotent no-op rather than a second row.
 */
const ADMIN_ID = "usuario-admin-inicial";

/** Same reasoning as `ADMIN_ID`, for the técnico account. */
const TECNICO_ID = "usuario-tecnico-inicial";

/** Same reasoning as `ADMIN_ID`, for the `oficina` account. */
const OFICINA_ID = "usuario-oficina-inicial";

/** Same reasoning as `ADMIN_ID`, for the spare `oficina2` account. */
const OFICINA2_ID = "usuario-oficina2-inicial";

const prisma = crearPrismaClient();

try {
  const content = await buildSeedContent();
  const plantillas = new PrismaPlantillaRepository(prisma, new RelojDelSistema());
  const firmantes = new PrismaFirmanteRepository(prisma);

  const reporte = await seedDatabase({
    content,
    templates: plantillas,
    signatories: firmantes,
    nodeEnv: process.env.NODE_ENV,
    administrador: {
      id: ADMIN_ID,
      nombreUsuario: process.env.SEED_ADMIN_USERNAME ?? "admin",
      nombreCompleto: process.env.SEED_ADMIN_NOMBRE ?? "Administrador",
      // Read straight from the environment and never echoed anywhere. There
      // is deliberately no `?? "algo"` on this line — see `sembrarCuenta`.
      contrasena: process.env.SEED_ADMIN_PASSWORD,
      usuarios: new PrismaUsuarioRepository(prisma),
      hasher: new HashDeContrasenaArgon2(),
    },
    tecnico: {
      id: TECNICO_ID,
      nombreUsuario: process.env.SEED_TECNICO_USERNAME ?? "tecnico",
      nombreCompleto: process.env.SEED_TECNICO_NOMBRE ?? "Técnico",
      // Same deliberate absence of a fallback as the admin's — see `sembrarCuenta`.
      contrasena: process.env.SEED_TECNICO_PASSWORD,
      usuarios: new PrismaUsuarioRepository(prisma),
      hasher: new HashDeContrasenaArgon2(),
    },
    oficina: {
      id: OFICINA_ID,
      nombreUsuario: process.env.SEED_OFICINA_USERNAME ?? "oficina",
      nombreCompleto: process.env.SEED_OFICINA_NOMBRE ?? "Oficina",
      // Same deliberate absence of a fallback as the admin's — see `sembrarCuenta`.
      contrasena: process.env.SEED_OFICINA_PASSWORD,
      usuarios: new PrismaUsuarioRepository(prisma),
      hasher: new HashDeContrasenaArgon2(),
    },
    // A spare login, so a second person does not have to share the first
    // `oficina` account.
    oficina2: {
      id: OFICINA2_ID,
      nombreUsuario: process.env.SEED_OFICINA2_USERNAME ?? "oficina2",
      nombreCompleto: process.env.SEED_OFICINA2_NOMBRE ?? "Oficina 2",
      // Same deliberate absence of a fallback as the admin's — see `sembrarCuenta`.
      contrasena: process.env.SEED_OFICINA2_PASSWORD,
      usuarios: new PrismaUsuarioRepository(prisma),
      hasher: new HashDeContrasenaArgon2(),
    },
  });

  console.log(describeSeedReport(reporte));

  // The demo contracts sign against the rows the seed just ensured exist, so
  // their ids are looked up from the database rather than assumed — a dev
  // database seeded under older constants keeps working.
  const [plantillaInstalada, firmanteInstalado] = await Promise.all([
    plantillas.buscarPorVersion(reporte.plantilla.version),
    firmantes.buscarPorVersion(reporte.firmante.version),
  ]);
  if (plantillaInstalada === null || firmanteInstalado === null) {
    throw new Error(
      "No se encontraron la plantilla y el firmante recién sembrados; no se pueden crear los contratos de demostración.",
    );
  }

  const reporteDemo = await seedContratosDemo({
    contratos: new PrismaContratoRepository(prisma, new RelojDelSistema()),
    plantillaVersionId: plantillaInstalada.id,
    firmanteId: firmanteInstalado.id,
    nodeEnv: process.env.NODE_ENV,
  });
  console.log(describeContratosDemoReport(reporteDemo));

  if (reporte.firmante.version === PROVISIONAL_SIGNATORY_VERSION) {
    console.log(
      `ATENCION: el comodante quedó firmando con la imagen de prueba ("FIRMA DE PRUEBA - NO VALIDA"). Todo contrato emitido contra esta base queda marcado con la versión de firmante "${PROVISIONAL_SIGNATORY_VERSION}" y no sirve como documento legal.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
