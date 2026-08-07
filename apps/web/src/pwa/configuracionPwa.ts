import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * DESIGN.md D9 — every option here exists to stop a service-worker update
 * from swapping the app out from under a signature in progress:
 *
 * - `registerType: "prompt"` — the app decides when to apply an update
 *   (`pwa/actualizacion.ts`), never the plugin's own `autoUpdate` reload.
 * - `workbox.skipWaiting: false` + `workbox.clientsClaim: false` — a new
 *   worker installs and WAITS. It never activates itself, and even if it
 *   somehow did, it would not "claim" the tab that is currently open.
 * - `navigateFallbackDenylist` — `/auth` and `/contratos` are same-origin
 *   API routes, not SPA pages (see `rutas/rutas.tsx`: no client route
 *   starts with either prefix). Without this, the SW's navigation fallback
 *   would serve `index.html` in place of a JSON body or a PDF stream.
 * - No API response is ever precached or runtime-cached here — the
 *   `globPatterns` below cover only the built app shell (JS/CSS/HTML) plus
 *   the manifest icons, matching DESIGN.md §2's online-only decision.
 *
 * Exported as a plain object, not inlined into `vite.config.ts`'s
 * `VitePWA(...)` call, so `configuracionPwa.spec.ts` can assert on these
 * exact values directly — the same "assert config directly" pattern
 * `app.spec.ts` already uses for `queryClient.getDefaultOptions()`.
 */
export const OPCIONES_VITE_PLUGIN_PWA: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,
  includeManifestIcons: true,
  workbox: {
    skipWaiting: false,
    clientsClaim: false,
    globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
    navigateFallbackDenylist: [/^\/auth/, /^\/contratos/],
  },
  manifest: {
    name: "Contratos — Comodato",
    short_name: "Contratos",
    description: "Firma digital de contratos de comodato en visita técnica.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#0b634a",
    background_color: "#0b634a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
};
