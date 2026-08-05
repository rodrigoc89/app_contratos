import { defineConfig } from "vitest/config";

/**
 * The schemas are pure functions over plain data: no database, no browser, no
 * filesystem. The whole suite is therefore part of `pnpm test` at the repo
 * root, and it must stay that way — this package exists to be importable from
 * a Vite bundle, and a test that needed Node would be the first sign it no
 * longer is.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
  },
});
