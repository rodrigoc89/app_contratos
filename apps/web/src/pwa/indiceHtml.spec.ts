import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * DESIGN.md D4 / spec `product-identity`, "HTML head identity" — reads the
 * real `apps/web/index.html` source as text, same `fileURLToPath`-relative
 * read pattern `convencionesDeEstilos.spec.ts` uses for its CSS files. No
 * HTML parser: the head is small and stable enough that a few targeted
 * regexes are simpler than pulling in a DOM parser for one file.
 *
 * Deliberately does NOT assert `apple-mobile-web-app-title` — orchestrator
 * settled decision, iOS surfaces are dropped for this fleet (Chromium on
 * Android tablets only, DESIGN.md:297,304). An always-passing "is absent"
 * assertion would prove nothing; the reasoning lives in `index.html`'s own
 * comment instead.
 */
const DIRECTORIO_PWA = dirname(fileURLToPath(import.meta.url));
const RUTA_INDEX_HTML = join(DIRECTORIO_PWA, "..", "..", "index.html");
const RUTA_PUBLIC = join(DIRECTORIO_PWA, "..", "..", "public");

function contenidoIndexHtml(): string {
  return readFileSync(RUTA_INDEX_HTML, "utf8");
}

describe("apps/web/index.html — head identity", () => {
  it("declares the IES.NET Contratos title", () => {
    expect(contenidoIndexHtml()).toMatch(/<title>IES\.NET Contratos<\/title>/);
  });

  it("links a favicon that exists under apps/web/public/", () => {
    const coincidencia = contenidoIndexHtml().match(
      /<link\s+rel="icon"[^>]*\shref="([^"]+)"/,
    );
    expect(coincidencia, "no <link rel=\"icon\"> found in index.html").not.toBeNull();

    const href = coincidencia?.[1] ?? "";
    const rutaArchivo = join(RUTA_PUBLIC, href.replace(/^\//, ""));
    expect(existsSync(rutaArchivo), `favicon file does not exist: ${rutaArchivo}`).toBe(true);
  });

  it("declares the manifest's green theme-color meta tag", () => {
    expect(contenidoIndexHtml()).toMatch(/<meta\s+name="theme-color"\s+content="#0b634a"\s*\/?>/);
  });
});
