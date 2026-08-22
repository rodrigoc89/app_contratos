import { defineConfig } from "vitest/config";

/**
 * Runs only `*.integration.spec.ts`, against the real Postgres started by
 * `docker compose up -d postgres` (repo root) and a `pg_dump` whose major
 * version matches that server. Kept separate from `vitest.config.ts` so the
 * dry-run harness stays database-free.
 */
export default defineConfig({
  test: {
    include: ["*.integration.spec.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
