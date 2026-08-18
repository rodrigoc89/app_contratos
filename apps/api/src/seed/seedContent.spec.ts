import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { EntradaGeneracion } from "../contratos/application/ports/GeneradorDeDocumentos";
import {
  rellenarPlantilla,
  valoresDePlantilla,
} from "../contratos/application/rellenarPlantilla";
import { Comodatario } from "../contratos/domain/Comodatario";
import { Equipos } from "../contratos/domain/Equipos";
import {
  FirmaCapturada,
  type TipoDocumentoFirmado,
} from "../contratos/domain/FirmaCapturada";
import { Plazo } from "../contratos/domain/Plazo";
import { FechaCalendario } from "../shared/domain/FechaCalendario";
import { DOCUMENTOS_DEL_CONTRATO } from "../shared/domain/TipoDocumentoFirmado";
import {
  buildPlaceholderSignaturePng,
  PLACEHOLDER_SIGNATURE_LINES,
} from "./placeholderSignaturePng";
import {
  buildSeedContent,
  PLACEHOLDER_SIGNATURE_PNG_PATH,
  PROVISIONAL_SIGNATORY_VERSION,
  readComodanteSignatureDataUri,
  readComodanteSignaturePng,
  SIGNATORY_ID,
  SIGNATORY_VERSION,
} from "./seedContent";

/**
 * A copy of the (unexported) `PLACEHOLDER` regex in
 * `contratos/application/rellenarPlantilla.ts`.
 *
 * Duplicated deliberately: this suite exists to catch a template that asks for
 * a field the renderer cannot supply, and the only way to catch it is to scan
 * the committed HTML exactly the way the renderer scans it. If that regex ever
 * changes, this copy has to change with it.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Values `valoresDePlantilla()` produces that no committed template prints, on
 * purpose.
 *
 * Empty today: between them, the two documents print every available field.
 * A name belongs here only when the legal text genuinely has no blank for that
 * value — never as a way to silence this test after a field was dropped from
 * the legal text by accident.
 */
const VALORES_SIN_USO_DELIBERADO: readonly string[] = [];

const FECHA_FIRMA = FechaCalendario.desdeIso("2026-08-04");

/** A real, valid 1x1 PNG — stands in for a captured customer signature. */
const FIRMA_CLIENTE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function firmaDe(documento: TipoDocumentoFirmado): FirmaCapturada {
  return FirmaCapturada.crear({
    documento,
    imagenPng: FIRMA_CLIENTE_PNG,
    trazos: [Array.from({ length: 14 }, (_, i) => ({ x: i, y: i, t: i * 16 }))],
  });
}

/**
 * A realistic contract: accents, `ñ`, an ampersand and an apostrophe in the
 * customer's free text, exactly the kind of input the escaping in
 * `rellenarPlantilla` exists for.
 */
async function entradaRealista(): Promise<EntradaGeneracion> {
  const { plantilla, firmante } = await buildSeedContent();

  return {
    numero: 2026001,
    fechaFirma: FECHA_FIRMA,
    plazo: Plazo.estandarDesde(FECHA_FIRMA),
    comodatario: Comodatario.crear({
      nombreCompleto: "María Ñandú O'Brien",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250 & Ruta 9",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
    firmas: DOCUMENTOS_DEL_CONTRATO.map(firmaDe),
    plantilla,
    firmante,
  };
}

/**
 * The legal text as a reader sees it: tags dropped and every run of
 * whitespace collapsed, so an assertion about a clause is not hostage to
 * where the HTML happens to wrap.
 */
function textoPlano(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function placeholdersDe(html: string): Set<string> {
  const nombres = new Set<string>();

  for (const coincidencia of html.matchAll(PLACEHOLDER)) {
    const nombre = coincidencia[1];
    if (nombre !== undefined) {
      nombres.add(nombre);
    }
  }

  return nombres;
}

describe("committed contract templates", () => {
  it("only asks for placeholders that valoresDePlantilla() actually produces", async () => {
    const entrada = await entradaRealista();
    const disponibles = new Set(Object.keys(valoresDePlantilla(entrada)));

    for (const documento of DOCUMENTOS_DEL_CONTRATO) {
      const usados = placeholdersDe(entrada.plantilla.contenidoDe(documento));

      expect(usados.size).toBeGreaterThan(0);
      expect(
        [...usados].filter((nombre) => !disponibles.has(nombre)),
        `"${documento}" uses placeholders the renderer cannot fill`,
      ).toEqual([]);
    }
  });

  it("prints every available value in at least one of the two documents, except the documented allow-list", async () => {
    const entrada = await entradaRealista();
    const usados = new Set(
      DOCUMENTOS_DEL_CONTRATO.flatMap((documento) => [
        ...placeholdersDe(entrada.plantilla.contenidoDe(documento)),
      ]),
    );

    const sinUsar = Object.keys(valoresDePlantilla(entrada)).filter(
      (nombre) =>
        !usados.has(nombre) && !VALORES_SIN_USO_DELIBERADO.includes(nombre),
    );

    expect(sinUsar).toEqual([]);
  });

  it("fills completely, leaving no placeholder behind", async () => {
    const entrada = await entradaRealista();
    const valores = valoresDePlantilla(entrada);

    for (const documento of DOCUMENTOS_DEL_CONTRATO) {
      const relleno = rellenarPlantilla(
        entrada.plantilla.contenidoDe(documento),
        valores,
      );

      expect(relleno).not.toContain("{{");
      expect(relleno).not.toContain("}}");
    }
  });

  it("prints the customer data it was filled with", async () => {
    const entrada = await entradaRealista();
    const valores = valoresDePlantilla(entrada);

    const comodato = rellenarPlantilla(
      entrada.plantilla.contenidoDe("comodato"),
      valores,
    );

    expect(comodato).toContain("María Ñandú O&#39;Brien");
    expect(comodato).toContain("30.123.456");
    expect(comodato).toContain("AC:8B:A9:12:34:56");
    expect(comodato).toContain("SIEIRA GUILLERMO FEDERICO");
    expect(comodato).toContain("27.582.030");

    const condiciones = rellenarPlantilla(
      entrada.plantilla.contenidoDe("condiciones_generales"),
      valores,
    );

    expect(condiciones).toContain("2026001");
    expect(condiciones).toContain("María Ñandú O&#39;Brien");
  });

  it("keeps the legal wording that carries the prices and the penalty", async () => {
    const { plantilla } = await buildSeedContent();

    const condiciones = textoPlano(plantilla.condicionesGeneralesHtml);
    const comodato = textoPlano(plantilla.comodatoHtml);

    expect(condiciones).toContain("CONDICIONES GENERALES DE USO");
    expect(condiciones).toContain("una visita técnica de $20.000 como mínimo");
    expect(condiciones).toContain("el costo será de $35.000 como mínimo");
    expect(comodato).toContain("CONTRATO DE COMODATO");
    expect(comodato).toContain(
      "CIENTO TREINTA DOLARES ESTADOUNIDENSES CON 00/100 CENTAVOS (U$S 130)",
    );
    expect(comodato).toContain(
      "conforme el Art. 1539 del Código Civil y Comercial de la Nación",
    );
    expect(comodato).toContain(
      "conforme al Art. 1536 inc. d, del Código Civil y Comercial Argentino",
    );
  });

  it("references no external resource, so the renderer never needs the network", async () => {
    const { plantilla } = await buildSeedContent();

    for (const documento of DOCUMENTOS_DEL_CONTRATO) {
      const html = plantilla.contenidoDe(documento);

      expect(html, `${documento} must not reach the network`).not.toMatch(
        /https?:\/\//i,
      );
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/@import\b/i);

      // Every `src` is either a `data:` URI or a placeholder the renderer
      // replaces with one.
      for (const [, valor] of html.matchAll(/\bsrc\s*=\s*"([^"]*)"/gi)) {
        expect(valor, `unexpected src in ${documento}`).toMatch(
          /^(data:|\{\{)/,
        );
      }

      // Same for anything CSS might pull in.
      for (const [, valor] of html.matchAll(/url\(\s*['"]?([^'")]*)/gi)) {
        expect(valor, `unexpected CSS url() in ${documento}`).toMatch(
          /^(data:|\{\{)/,
        );
      }
    }
  });

  it("uses only fonts that exist on a bare Ubuntu server, always ending in a generic family", async () => {
    const { plantilla } = await buildSeedContent();

    for (const documento of DOCUMENTOS_DEL_CONTRATO) {
      const html = plantilla.contenidoDe(documento);
      const familias = [...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)];

      expect(familias.length).toBeGreaterThan(0);

      for (const [, declaracion = ""] of familias) {
        expect(declaracion).toMatch(/Liberation|DejaVu/);
        expect(declaracion.trim()).toMatch(/(serif|sans-serif|monospace)\s*$/);
      }
    }
  });
});

/** Channels per PNG colour type, from the IHDR table in the spec. */
const CANALES_POR_TIPO: Readonly<Record<number, number>> = {
  0: 1, // greyscale
  2: 3, // truecolour
  3: 1, // indexed
  4: 2, // greyscale with alpha
  6: 4, // truecolour with alpha
};

interface PngLeido {
  readonly ancho: number;
  readonly alto: number;
  readonly bits: number;
  readonly tipoColor: number;
  readonly pixeles: Buffer;
  readonly bytesLeidos: number;
}

/**
 * Walks the chunks and decompresses the image data.
 *
 * Deliberately not a PNG library: the point is to prove the committed file is
 * neither truncated nor padded, and a real decoder repairs what it reads,
 * which would hide exactly the corruption this is looking for.
 */
function leerPng(png: Buffer): PngLeido {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const idat: Buffer[] = [];
  let cabecera: Omit<PngLeido, "pixeles" | "bytesLeidos"> | null = null;
  let posicion = 8;

  while (posicion < png.length) {
    const largo = png.readUInt32BE(posicion);
    const tipo = png.subarray(posicion + 4, posicion + 8).toString("latin1");
    const datos = png.subarray(posicion + 8, posicion + 8 + largo);

    if (tipo === "IHDR") {
      cabecera = {
        ancho: datos.readUInt32BE(0),
        alto: datos.readUInt32BE(4),
        bits: datos.readUInt8(8),
        tipoColor: datos.readUInt8(9),
      };
    }
    if (tipo === "IDAT") {
      idat.push(Buffer.from(datos));
    }

    posicion += 12 + largo;
  }

  expect(cabecera).not.toBeNull();
  expect(idat.length).toBeGreaterThan(0);

  return {
    ...cabecera!,
    pixeles: inflateSync(Buffer.concat(idat)),
    bytesLeidos: posicion,
  };
}

function esperarPngIntegro(png: Buffer): PngLeido {
  expect(png.length).toBeGreaterThan(0);

  const leido = leerPng(png);

  // Exactly consumed: nothing truncated, nothing appended.
  expect(leido.bytesLeidos).toBe(png.length);
  expect(leido.ancho).toBeGreaterThan(0);
  expect(leido.alto).toBeGreaterThan(0);

  const canales = CANALES_POR_TIPO[leido.tipoColor];
  expect(canales, `unknown PNG colour type ${leido.tipoColor}`).toBeDefined();

  // + 1 for each scanline's filter byte. Channel-aware on purpose: the
  // placeholder is 1-bit indexed and the real signature is 8-bit RGBA, and a
  // formula that assumed one channel silently passed only the former.
  const bytesPorFila = Math.ceil((leido.ancho * leido.bits * canales!) / 8) + 1;

  expect(leido.pixeles.length).toBe(bytesPorFila * leido.alto);
  // Not a blank rectangle: something was actually drawn.
  expect(leido.pixeles.some((byte) => byte !== 0)).toBe(true);

  return leido;
}

describe("comodante signature", () => {
  it("is a structurally valid, non-empty PNG whose image data really decodes", async () => {
    esperarPngIntegro(await readComodanteSignaturePng());
  });

  it("is the real signature, not the test placeholder", async () => {
    expect(SIGNATORY_VERSION).not.toBe(PROVISIONAL_SIGNATORY_VERSION);
    expect(SIGNATORY_ID).not.toContain(PROVISIONAL_SIGNATORY_VERSION);

    // The bytes, not just the version string. `seedDatabase`'s production
    // guard keys on the version alone, so a version bumped without swapping
    // the file would stamp "FIRMA DE PRUEBA" on every contract while
    // reporting itself as real — the one failure nothing downstream catches.
    expect(await readComodanteSignaturePng()).not.toEqual(
      buildPlaceholderSignaturePng(),
    );
  });

  it("fits the box the template draws it in", async () => {
    const { ancho, alto } = esperarPngIntegro(await readComodanteSignaturePng());

    // `.firma-imagen` is height 20mm, max-width 70mm, object-fit contain —
    // a 3.5:1 box. Far off that and the signature renders letterboxed, small
    // and off-centre, on a document nobody re-reads before signing.
    expect(ancho).toBeGreaterThanOrEqual(600);
    expect(ancho / alto).toBeGreaterThan(2.5);
    expect(ancho / alto).toBeLessThan(4.5);
  });

  it("is offered to the templates as a data URI the HTML can carry inline", async () => {
    const uri = await readComodanteSignatureDataUri();

    expect(uri.startsWith("data:image/png;base64,")).toBe(true);

    const base64 = uri.slice("data:image/png;base64,".length);
    expect(base64.length).toBeGreaterThan(0);
    expect(Buffer.from(base64, "base64")).toEqual(
      await readComodanteSignaturePng(),
    );
  });
});

/**
 * Kept after the real signature landed, so local development and demos can
 * seed a database without stamping a real person's handwriting onto throwaway
 * contracts. Reaching it means pointing `SIGNATORY_VERSION` back at
 * `PROVISIONAL_SIGNATORY_VERSION`, which `seedDatabase` refuses in production.
 */
describe("placeholder signature generator", () => {
  it("still produces exactly the committed placeholder file, so the bytes are reproducible", async () => {
    expect(await readFile(PLACEHOLDER_SIGNATURE_PNG_PATH)).toEqual(
      buildPlaceholderSignaturePng(),
    );
  });

  it("produces a structurally valid PNG", () => {
    esperarPngIntegro(buildPlaceholderSignaturePng());
  });

  it("says, in the image itself, that it is not a real signature", () => {
    expect(PLACEHOLDER_SIGNATURE_LINES.join(" ")).toBe(
      "FIRMA DE PRUEBA NO VALIDA",
    );
  });
});
