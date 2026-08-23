import { defineConfig } from "vitest/config";

/**
 * Runs only `*.compilado.spec.ts` files, against the real `dist/` produced
 * by `vite build` — never part of `pnpm -r test`, where a clean checkout
 * has no `dist/` at all. Same split `apps/api` already uses for
 * `*.integration.spec.ts` (`vitest.integration.config.ts`), for the same
 * reason: `vitest.config.ts:16`'s default `src/**\/*.spec.ts` include
 * would otherwise sweep a fail-closed compiled-output scan into every
 * clean-checkout `pnpm test` run (design.md D2 — "File-split mechanism").
 */
export default defineConfig({
  test: {
    include: ["src/**/*.compilado.spec.ts"],
    environment: "node",
  },
});
