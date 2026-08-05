import { defineConfig } from "vitest/config";

/**
 * `apps/web` is the only package in this monorepo whose unit suite touches
 * the DOM. `apps/api` and `packages/esquemas` each pin `environment: "node"`
 * in their own `vitest.config.ts`, and there is no root Vitest config, so
 * this setting has nothing to conflict with and cannot leak into either of
 * them.
 *
 * `passWithNoTests` is on because this PR answers D1 (does Vite consume
 * `@contratos/esquemas` as raw TypeScript?) via a real `vite build` and
 * `tsc --noEmit`, not a unit test — the first behavioural spec in this
 * package lands with the app shell in PR2.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    environment: "jsdom",
    passWithNoTests: true,
  },
});
