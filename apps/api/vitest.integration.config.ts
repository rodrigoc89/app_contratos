import { defineConfig } from "vitest/config";

/**
 * Runs only `*.integration.spec.ts` files, against the real Postgres started
 * by `docker compose up -d postgres` (repo root) with the migration applied.
 * Kept entirely separate from `vitest.config.ts` / `pnpm test` so the 243+
 * domain/unit tests stay fast and database-free.
 */
export default defineConfig({
  test: {
    // `scripts/verificarRender.integration.spec.ts` needs neither Postgres
    // nor `fileParallelism: false` on its own — it is grouped into this same
    // config only so `pnpm test:integration` stays the one command that
    // exercises every real-dependency path (design.md D2).
    // `prisma/restauracion/verificarRestauracion.integration.spec.ts`
    // (design.md D7, PR8) DOES need the real Postgres 17 container and
    // shares one database across its cases the same way the rest of this
    // config does.
    include: [
      "src/**/*.integration.spec.ts",
      "scripts/**/*.integration.spec.ts",
      "prisma/**/*.integration.spec.ts",
    ],
    environment: "node",
    // These files share one real database and truncate tables between
    // cases; running them concurrently would race each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
