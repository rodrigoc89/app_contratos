import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `scripts/**` holds standalone jiti CLI tools (`prisma/backfill/` follows
    // the same shape) — `renderVerdict.spec.ts` is the pure, database-free
    // unit suite for the render verdict parser (design.md D2).
    include: ["src/**/*.spec.ts", "scripts/**/*.spec.ts"],
    // Integration specs need the real Postgres from `docker compose up -d
    // postgres` and run only via `pnpm test:integration`
    // (vitest.integration.config.ts) — never as part of the default,
    // database-free `pnpm test`.
    exclude: [
      ...defaultExclude,
      "src/**/*.integration.spec.ts",
      "scripts/**/*.integration.spec.ts",
    ],
    environment: "node",
  },
});
