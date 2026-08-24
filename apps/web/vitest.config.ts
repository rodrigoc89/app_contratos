import { defaultExclude, defineConfig } from "vitest/config";

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
    // `scripts/**` holds standalone jiti CLI tools, same split `apps/api`'s
    // own `vitest.config.ts` already uses — `techoDeDist.spec.ts` is the
    // pure, filesystem-free unit suite for the dist/ size ceiling (design.md
    // D7); the CLI driver itself needs a real `dist/` and runs only via
    // `pnpm size`.
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "scripts/**/*.spec.ts"],
    // Compiled-output guards (design.md D2, guards 1/2/16) need a real
    // `dist/` from `vite build`, which does not exist on a clean checkout —
    // they run only via `pnpm test:compilado`
    // (vitest.compilado.config.ts), in the bundle CI job, never here.
    exclude: [...defaultExclude, "src/**/*.compilado.spec.ts"],
    environment: "jsdom",
    setupFiles: ["./src/tests/configuracionPruebas.ts"],
    passWithNoTests: true,
    /**
     * Node 22+ ships an experimental global `localStorage`/`sessionStorage`
     * that is present (`"localStorage" in globalThis`) but throws
     * "localStorage is not available because --localstorage-file was not
     * provided" the moment it is read — and Vitest's jsdom environment
     * treats any key already present on `globalThis` as "already owned by
     * the host, don't override it" (see its `populateGlobal`), so jsdom's
     * own working `localStorage` never gets installed unless Node's broken
     * stand-in is turned off first. Discovered while writing
     * `datos/sesion/almacenSesion.ts` (D4/D8's first real storage call
     * site): a plain `localStorage.setItem(...)` failed with
     * "Cannot read properties of undefined" in every test worker.
     */
    poolOptions: {
      forks: { execArgv: ["--no-experimental-webstorage"] },
      threads: { execArgv: ["--no-experimental-webstorage"] },
    },
  },
});
