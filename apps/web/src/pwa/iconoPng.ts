/**
 * DESIGN.md D5 / spec `product-identity` — "referenced icon files exist on
 * disk". Parses the PNG IHDR chunk directly, no image library: every valid
 * PNG starts with an 8-byte signature, then its first chunk is always a
 * 4-byte length, a 4-byte "IHDR" tag, a 4-byte big-endian width and a
 * 4-byte big-endian height — bytes 16-23, in that fixed order, every time.
 * Reading that header is enough to catch the one regression `iconos.spec.ts`
 * exists for: a regenerated icon whose real pixel dimensions no longer
 * match what the manifest promises.
 */

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DimensionesPng {
  readonly ancho: number;
  readonly alto: number;
}

export function dimensionesPng(buffer: Buffer): DimensionesPng {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(FIRMA_PNG)) {
    throw new Error("not a PNG file: missing the 8-byte PNG signature");
  }

  return {
    ancho: buffer.readUInt32BE(16),
    alto: buffer.readUInt32BE(20),
  };
}

/** Matches the manifest's own `sizes` string shape, e.g. `"192x192"`. */
export function formatoDeTamano({ ancho, alto }: DimensionesPng): string {
  return `${ancho}x${alto}`;
}
