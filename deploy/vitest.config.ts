import { defaultExclude, defineConfig } from "vitest/config";

/**
 * These specs never touch a real VPS: each one `execFile`s the script under
 * test inside a temporary directory and asserts exit codes and `--dry-run`
 * plans (design.md D8). No database, no browser, no root.
 *
 * `*.integration.spec.ts` is excluded here and run only by
 * `vitest.integration.config.ts`, the same split `apps/api` already uses:
 * those specs need the real Postgres 17 container and a matching `pg_dump`.
 */
export default defineConfig({
  test: {
    include: ["*.spec.ts"],
    exclude: [...defaultExclude, "*.integration.spec.ts"],
    environment: "node",
  },
});
