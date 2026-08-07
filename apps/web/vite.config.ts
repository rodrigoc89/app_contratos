import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { OPCIONES_VITE_PLUGIN_PWA } from "./src/pwa/configuracionPwa";

/**
 * `@contratos/esquemas` ships raw TypeScript with no build step of its own —
 * its `main`, `types` and `exports` all point straight at `./src/index.ts`.
 * That package had never been consumed by a bundler before this app existed,
 * only by jiti and Vitest, so whether it worked at all was an open question.
 *
 * It does, and it needs no configuration here. pnpm links the workspace
 * dependency to its real source outside `node_modules`, and Vite does not
 * pre-bundle linked packages — it serves and transforms them as source, the
 * same as this app's own files. Verified both ways: `vite build` produces a
 * byte-identical bundle, and the dev server resolves the import to
 * `/@fs/…/packages/esquemas/src/index.ts` with no error.
 *
 * An `optimizeDeps.exclude` entry for the package was tried and removed. It
 * was a no-op, and a no-op carrying an explanation of why it is essential is
 * worse than nothing: the next person keeps it, believes it, and configures
 * around a constraint that does not exist.
 */
export default defineConfig({
  // `injectRegister: false` (in `OPCIONES_VITE_PLUGIN_PWA`) means this
  // plugin never injects its own auto-register script — `main.tsx` is the
  // one place that imports `virtual:pwa-register` and registers explicitly,
  // through `pwa/registro.ts`, so the update-suppression decision
  // (DESIGN.md D9, `pwa/actualizacion.ts`) is always consulted first.
  plugins: [react(), VitePWA(OPCIONES_VITE_PLUGIN_PWA)],
});
