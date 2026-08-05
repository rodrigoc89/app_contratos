import type { PrismaClient } from "../../../generated/prisma/client";

/**
 * Empties every table `identidad` owns, in one statement, so each
 * integration test starts from a clean, predictable database regardless of
 * what earlier tests in the run wrote.
 *
 * Deliberately separate from `limpiarBaseDeDatos`
 * (shared/infrastructure/persistence/testDb.ts): that helper truncates the
 * `contratos` feature's own tables and lives in a file this change is not
 * allowed to touch. `identidad` is an independent bounded context with its
 * own tables (`usuarios`, `usuario_tokens_refresco`), so it gets its own
 * cleanup helper rather than growing someone else's TRUNCATE list — the same
 * reasoning `PrismaPlantillaRepository` gives for redeclaring
 * `ZONA_HORARIA_CONTRATO` instead of importing it.
 *
 * Test-only helper: not exported for production use.
 */
export async function limpiarTablasDeIdentidad(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "usuario_tokens_refresco", "usuarios" RESTART IDENTITY CASCADE',
  );
}
