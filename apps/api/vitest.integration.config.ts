import { defineConfig } from "vitest/config";

/**
 * Runs only `*.integration.spec.ts` files, against the real Postgres started
 * by `docker compose up -d postgres` (repo root) with the migration applied.
 * Kept entirely separate from `vitest.config.ts` / `pnpm test` so the 243+
 * domain/unit tests stay fast and database-free.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.spec.ts"],
    environment: "node",
    // These files share one real database and truncate tables between
    // cases; running them concurrently would race each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
