import { defineConfig } from "vitest/config";

/**
 * `apps/web` is the only package in this monorepo whose unit suite touches
 * the DOM. `apps/api` and `packages/esquemas` each pin `environment: "node"`
 * in their own `vitest.config.ts`, and there is no root Vitest config, so
 * this setting has nothing to conflict with and cannot leak into either of
 * them.
 *
 * `passWithNoTests` stays on: it protected PR1 (verified by `vite build` and
 * `tsc --noEmit` instead of a unit test) and costs nothing now that real
 * specs exist — it only matters again if a future slice adds no spec files.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    environment: "jsdom",
    setupFiles: ["./src/tests/configuracionPruebas.ts"],
    passWithNoTests: true,
  },
});
