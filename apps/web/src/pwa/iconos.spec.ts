import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OPCIONES_VITE_PLUGIN_PWA } from "./configuracionPwa";
import { dimensionesPng, formatoDeTamano } from "./iconoPng";

/**
 * DESIGN.md D5 / spec `product-identity` — "referenced icon files exist on
 * disk". `configuracionPwa.spec.ts`'s "declares an installable manifest
 * with both required icon sizes" test only ever reads the manifest's own
 * `sizes` *string* — nothing in the suite opened the actual PNG bytes, so a
 * regenerated icon at the wrong pixel size would pass CI silently. This
 * reads each manifest-referenced file's real IHDR dimensions (same
 * `fileURLToPath`-relative read pattern as `indiceHtml.spec.ts`) and
 * compares them against the `sizes` the manifest promises.
 */
const DIRECTORIO_PWA = dirname(fileURLToPath(import.meta.url));
const RUTA_PUBLIC = join(DIRECTORIO_PWA, "..", "..", "public");

function iconosDelManifiesto() {
  const manifest = OPCIONES_VITE_PLUGIN_PWA.manifest;
  if (manifest === false || manifest === undefined) {
    throw new Error("manifest must be a real object, not disabled");
  }
  return manifest.icons ?? [];
}

describe("PWA manifest icons — real PNG dimensions match the promised sizes", () => {
  const iconos = iconosDelManifiesto();

  it("the manifest declares at least one icon to check", () => {
    expect(iconos.length).toBeGreaterThan(0);
  });

  it.each(iconos)(
    "%s resolves to an existing file whose real IHDR dimensions equal its promised sizes",
    (icono) => {
      const rutaArchivo = join(RUTA_PUBLIC, icono.src.replace(/^\//, ""));
      expect(existsSync(rutaArchivo), `icon file does not exist: ${rutaArchivo}`).toBe(true);

      const buffer = readFileSync(rutaArchivo);
      expect(formatoDeTamano(dimensionesPng(buffer))).toBe(icono.sizes);
    },
  );

  /**
   * tasks.md 2.4 — triangulation. Proves the guard's own machinery
   * (`dimensionesPng` + `formatoDeTamano`) actually FAILS to match a
   * wrong-size file, not merely passes because the three real PNGs above
   * already happen to be right. Built as a synthetic in-memory IHDR
   * (`dimensionesPng` only ever reads the first 24 bytes — no real PNG
   * pixel data is needed), so no fixture file needs to exist on disk.
   */
  it("catches a mismatched fixture: a 100x100 PNG asserted against a 192x192 manifest entry", () => {
    const pngFalso = construirPngConDimension(100, 100);
    const dimensionesReales = dimensionesPng(pngFalso);

    expect(dimensionesReales).toEqual({ ancho: 100, alto: 100 });
    expect(formatoDeTamano(dimensionesReales)).not.toBe("192x192");
  });
});

/**
 * Minimal synthetic PNG signature + IHDR header (24 bytes: 8-byte
 * signature, 4-byte chunk length, 4-byte "IHDR" tag, 4-byte width, 4-byte
 * height). `dimensionesPng` never reads past byte 24, so nothing after the
 * header — the rest of a real PNG's chunks, CRCs and pixel data — needs to
 * exist for this fixture to be a faithful stand-in.
 */
function construirPngConDimension(ancho: number, alto: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(ancho, 16);
  buffer.writeUInt32BE(alto, 20);
  return buffer;
}
