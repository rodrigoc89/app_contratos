import { describe, expect, it } from "vitest";

import { OPCIONES_VITE_PLUGIN_PWA } from "./configuracionPwa";

/**
 * DESIGN.md D9 — the plugin options are a plain, exported literal (not
 * buried inside `vite.config.ts`'s `VitePWA(...)` call), precisely so this
 * spec can assert on the exact objects the build consumes — same pattern as
 * `app.spec.ts`'s direct assertion on `queryClient.getDefaultOptions()`
 * (scenario 16). A build-only check could not catch a later `skipWaiting:
 * true` or a shrunk `navigateFallbackDenylist` without decompiling the
 * generated service worker; this catches it in milliseconds.
 */
describe("OPCIONES_VITE_PLUGIN_PWA", () => {
  it("uses registerType 'prompt' — a new worker only ever waits, never takes over on its own", () => {
    expect(OPCIONES_VITE_PLUGIN_PWA.registerType).toBe("prompt");
  });

  it("never skips waiting — the decisive constraint that stops a mid-signature swap", () => {
    expect(OPCIONES_VITE_PLUGIN_PWA.workbox?.skipWaiting).toBe(false);
  });

  it("never claims existing clients — an already-open tab keeps its current worker", () => {
    expect(OPCIONES_VITE_PLUGIN_PWA.workbox?.clientsClaim).toBe(false);
  });

  it("denylists /auth from the SPA navigation fallback — it is a JSON API route, not a page", () => {
    const denylist = OPCIONES_VITE_PLUGIN_PWA.workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.some((patron) => patron.test("/auth/login"))).toBe(true);
    expect(denylist.some((patron) => patron.test("/auth/refresh"))).toBe(true);
  });

  it("denylists /contratos from the SPA navigation fallback — it serves JSON and PDF streams, not pages", () => {
    const denylist = OPCIONES_VITE_PLUGIN_PWA.workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.some((patron) => patron.test("/contratos/c1"))).toBe(true);
    expect(denylist.some((patron) => patron.test("/contratos/c1/documentos/comodato"))).toBe(true);
  });

  it("does NOT denylist the app's own client-side routes — the SPA fallback must still serve them", () => {
    const denylist = OPCIONES_VITE_PLUGIN_PWA.workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.some((patron) => patron.test("/"))).toBe(false);
    expect(denylist.some((patron) => patron.test("/panel-no-disponible"))).toBe(false);
    expect(denylist.some((patron) => patron.test("/login"))).toBe(false);
  });

  it("declares an installable manifest with both required icon sizes", () => {
    const manifest = OPCIONES_VITE_PLUGIN_PWA.manifest;
    if (manifest === false || manifest === undefined) {
      throw new Error("manifest must be a real object, not disabled");
    }
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    const tamanos = (manifest.icons ?? []).map((icono) => icono.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
  });

  /**
   * DESIGN.md D4 / spec `product-identity` — "manifest name and description"
   * and "PWA chrome colours". The manifest is the app's own account of
   * itself: before this, `name` never said "IES.NET" and `background_color`
   * matched the green chrome instead of the white splash the blue mark needs
   * to read against.
   */
  it("names the app IES.NET Contratos, with a description that mentions IES.NET", () => {
    const manifest = OPCIONES_VITE_PLUGIN_PWA.manifest;
    if (manifest === false || manifest === undefined) {
      throw new Error("manifest must be a real object, not disabled");
    }
    expect(manifest.name).toBe("IES.NET Contratos");
    expect(manifest.description).toBeTruthy();
    expect(manifest.description).toContain("IES.NET");
  });

  it("splashes white (D4: the blue mark reads against the splash, not the green chrome) and keeps the green theme_color", () => {
    const manifest = OPCIONES_VITE_PLUGIN_PWA.manifest;
    if (manifest === false || manifest === undefined) {
      throw new Error("manifest must be a real object, not disabled");
    }
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.theme_color).toBe("#0b634a");
  });
});
