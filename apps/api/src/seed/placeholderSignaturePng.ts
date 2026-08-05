/**
 * Builds the stand-in signature image for the comodante, from scratch.
 *
 * The real signature of the company owner is not available yet. Whatever goes
 * in its place is going to be rendered, hashed, sealed and stored exactly like
 * the real thing — a test-signed PDF is indistinguishable from a real one at
 * the byte level — so the *only* defence against one escaping into production
 * is that a human looking at the paper cannot possibly mistake it for a
 * signature. Hence a legible block of text inside a heavy frame, not a
 * plausible squiggle.
 *
 * The bytes are fully deterministic and depend on nothing but this file: the
 * bitmap is drawn from the table below, and the image data is written as
 * *uncompressed* deflate blocks, so the output does not vary with the zlib
 * version of whoever regenerates it. `apps/api/prisma/firmas/README.md`
 * explains how to regenerate, and the unit suite asserts the committed file
 * still matches what this function produces.
 */

/** What the image says, in the order the lines are drawn. */
export const PLACEHOLDER_SIGNATURE_LINES = [
  "FIRMA DE PRUEBA",
  "NO VALIDA",
] as const;

const ANCHO = 664;
const ALTO = 200;
/** Thickness of the frame, in pixels. */
const BORDE = 8;
/** Each 5x7 glyph pixel becomes a square of this many image pixels. */
const ESCALA = 7;

const GLYPH_ANCHO = 5;
const GLYPH_ALTO = 7;
/** One blank column between glyphs. */
const AVANCE = (GLYPH_ANCHO + 1) * ESCALA;

const LINEA_Y = [38, 112] as const;

/**
 * A 5x7 bitmap font, holding exactly the characters the two lines above need
 * and no others. Adding a word with a new letter fails loudly at generation
 * time instead of silently dropping the glyph.
 */
const FUENTE: Record<string, readonly string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
};

/** Palette index 0 is the white background, index 1 the red ink. */
const PALETA = [255, 255, 255, 204, 0, 0];

export function buildPlaceholderSignaturePng(): Buffer {
  const pixeles = dibujar();
  const escaneo = empaquetarFilas(pixeles);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", cabecera()),
    chunk("PLTE", Buffer.from(PALETA)),
    chunk("IDAT", deflateAlmacenado(escaneo)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** One byte per pixel, holding the palette index. */
function dibujar(): Uint8Array {
  const lienzo = new Uint8Array(ANCHO * ALTO);

  const pintar = (x: number, y: number, ancho: number, alto: number): void => {
    for (let fila = y; fila < y + alto; fila += 1) {
      for (let columna = x; columna < x + ancho; columna += 1) {
        if (fila >= 0 && fila < ALTO && columna >= 0 && columna < ANCHO) {
          lienzo[fila * ANCHO + columna] = 1;
        }
      }
    }
  };

  pintar(0, 0, ANCHO, BORDE);
  pintar(0, ALTO - BORDE, ANCHO, BORDE);
  pintar(0, 0, BORDE, ALTO);
  pintar(ANCHO - BORDE, 0, BORDE, ALTO);

  PLACEHOLDER_SIGNATURE_LINES.forEach((linea, indice) => {
    const ancho = linea.length * AVANCE - ESCALA;
    let x = Math.round((ANCHO - ancho) / 2);
    const y = LINEA_Y[indice] ?? 0;

    for (const caracter of linea) {
      const glifo = FUENTE[caracter];
      if (glifo === undefined) {
        throw new Error(
          `La fuente de la firma de prueba no tiene el carácter "${caracter}".`,
        );
      }

      for (let fila = 0; fila < GLYPH_ALTO; fila += 1) {
        const patron = glifo[fila] ?? "";
        for (let columna = 0; columna < GLYPH_ANCHO; columna += 1) {
          if (patron[columna] === "#") {
            pintar(x + columna * ESCALA, y + fila * ESCALA, ESCALA, ESCALA);
          }
        }
      }

      x += AVANCE;
    }
  });

  return lienzo;
}

/** Packs the canvas into 1-bit rows, each prefixed with filter type 0. */
function empaquetarFilas(pixeles: Uint8Array): Buffer {
  const bytesPorFila = Math.ceil(ANCHO / 8);
  const salida = Buffer.alloc(ALTO * (bytesPorFila + 1));

  for (let fila = 0; fila < ALTO; fila += 1) {
    const inicio = fila * (bytesPorFila + 1);
    salida[inicio] = 0;

    for (let columna = 0; columna < ANCHO; columna += 1) {
      if (pixeles[fila * ANCHO + columna] === 1) {
        const posicion = inicio + 1 + (columna >> 3);
        salida[posicion] = (salida[posicion] ?? 0) | (0x80 >> (columna & 7));
      }
    }
  }

  return salida;
}

function cabecera(): Buffer {
  const datos = Buffer.alloc(13);
  datos.writeUInt32BE(ANCHO, 0);
  datos.writeUInt32BE(ALTO, 4);
  datos.writeUInt8(1, 8); // bit depth
  datos.writeUInt8(3, 9); // colour type: indexed
  datos.writeUInt8(0, 10); // compression
  datos.writeUInt8(0, 11); // filter
  datos.writeUInt8(0, 12); // interlace
  return datos;
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);

  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);

  return Buffer.concat([largo, cuerpo, crc]);
}

/**
 * A zlib stream made of *stored* (uncompressed) deflate blocks.
 *
 * `deflateSync` would produce a smaller file, but its exact output depends on
 * the zlib build, which would make the committed PNG non-reproducible. The
 * image is a few kilobytes either way, so determinism wins.
 */
function deflateAlmacenado(datos: Buffer): Buffer {
  const MAXIMO = 0xffff;
  const partes: Buffer[] = [Buffer.from([0x78, 0x01])];

  for (let inicio = 0; inicio < datos.length; inicio += MAXIMO) {
    const bloque = datos.subarray(inicio, inicio + MAXIMO);
    const ultimo = inicio + MAXIMO >= datos.length;
    const encabezado = Buffer.alloc(5);

    encabezado.writeUInt8(ultimo ? 1 : 0, 0);
    encabezado.writeUInt16LE(bloque.length, 1);
    encabezado.writeUInt16LE(bloque.length ^ 0xffff, 3);

    partes.push(encabezado, Buffer.from(bloque));
  }

  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(adler32(datos), 0);
  partes.push(adler);

  return Buffer.concat(partes);
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);

  for (let indice = 0; indice < 256; indice += 1) {
    let valor = indice;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    }
    tabla[indice] = valor >>> 0;
  }

  return tabla;
})();

function crc32(datos: Buffer): number {
  let valor = 0xffffffff;

  for (const byte of datos) {
    valor = (TABLA_CRC[(valor ^ byte) & 0xff] ?? 0) ^ (valor >>> 8);
  }

  return (valor ^ 0xffffffff) >>> 0;
}

function adler32(datos: Buffer): number {
  let a = 1;
  let b = 0;

  for (const byte of datos) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}
