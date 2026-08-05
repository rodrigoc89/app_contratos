import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    // Integration specs need the real Postgres from `docker compose up -d
    // postgres` and run only via `pnpm test:integration`
    // (vitest.integration.config.ts) — never as part of the default,
    // database-free `pnpm test`.
    exclude: [...defaultExclude, "src/**/*.integration.spec.ts"],
    environment: "node",
  },
});
