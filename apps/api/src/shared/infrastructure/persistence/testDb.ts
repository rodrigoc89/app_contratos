import type { PrismaClient } from "../../../../generated/prisma/client";
import { crearPrismaClient } from "./prismaClient";

/**
 * Matches the `docker-compose.yml` defaults at the repo root. Integration
 * tests fall back to this when `DATABASE_URL` is not set in the
 * environment, so `pnpm test:integration` works out of the box against
 * `docker compose up -d postgres` without requiring a local `.env` file.
 */
const DATABASE_URL_LOCAL =
  "postgresql://contratos:contratos@localhost:5432/contratos";

/** Test-only helper: not exported for production use. */
export function crearClienteDeIntegracion(): PrismaClient {
  return crearPrismaClient(process.env.DATABASE_URL ?? DATABASE_URL_LOCAL);
}

/**
 * Empties every table this feature owns, in one statement, and resets
 * `contrato_numero_seq` — so each integration test starts from a clean,
 * predictable database regardless of what earlier tests in the run wrote.
 */
export async function limpiarBaseDeDatos(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "contrato_eventos", "contrato_documentos", "contrato_firmas", "contratos", "plantillas_contrato", "firmantes_comodante" RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe(
    "ALTER SEQUENCE contrato_numero_seq RESTART WITH 1",
  );
}
