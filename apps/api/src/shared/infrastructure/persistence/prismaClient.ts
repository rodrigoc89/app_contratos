import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../../../generated/prisma/client";

/**
 * Builds a Prisma client wired to the real Postgres database through the
 * `pg` driver adapter.
 *
 * This generator (`provider = "prisma-client"`) requires a driver adapter —
 * there is no built-in query engine fallback — so every repository and every
 * integration test goes through this single factory rather than
 * instantiating `PrismaClient` directly.
 */
export function crearPrismaClient(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): PrismaClient {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error(
      "Falta configurar DATABASE_URL para conectar con Postgres.",
    );
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
