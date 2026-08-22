import { defineConfig } from "vitest/config";

/**
 * These specs never touch a real VPS: each one `execFile`s the script under
 * test inside a temporary directory and asserts exit codes and `--dry-run`
 * plans (design.md D8). No database, no browser, no root.
 */
export default defineConfig({
  test: {
    include: ["*.spec.ts"],
    environment: "node",
  },
});
