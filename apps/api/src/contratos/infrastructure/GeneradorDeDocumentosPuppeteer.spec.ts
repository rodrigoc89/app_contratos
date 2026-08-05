import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FirmanteComodante } from "../../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { AlmacenDeDocumentos } from "../application/ports/AlmacenDeDocumentos";
import type { EntradaGeneracion } from "../application/ports/GeneradorDeDocumentos";
import { Comodatario } from "../domain/Comodatario";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada, type TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { Plazo } from "../domain/Plazo";
import type {
  NavegadorRenderPdf,
  OpcionesPdf,
  PaginaRenderPdf,
} from "./GeneradorDeDocumentosPuppeteer";
import { GeneradorDeDocumentosPuppeteer } from "./GeneradorDeDocumentosPuppeteer";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");

const firmaDe = (documento: TipoDocumentoFirmado, imagen: string) =>
  FirmaCapturada.crear({
    documento,
    imagenPng: imagen,
    trazos: [Array.from({ length: 14 }, (_, i) => ({ x: i, y: i, t: i * 16 }))],
  });

function entrada(sobreescribir: Partial<EntradaGeneracion> = {}): EntradaGeneracion {
  return {
    numero: 1042,
    fechaFirma: FIRMA,
    plazo: Plazo.estandarDesde(FIRMA),
    comodatario: Comodatario.crear({
      nombreCompleto: "Juan Carlos Pérez",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
    firmas: [
      firmaDe("condiciones_generales", "data:image/png;base64,CONDICIONES"),
      firmaDe("comodato", "data:image/png;base64,COMODATO"),
    ],
    plantilla: PlantillaContrato.crear({
      id: "plantilla-2026-01",
      version: "2026-01",
      condicionesGeneralesHtml: "<h1>condiciones {{numero}}</h1>",
      comodatoHtml: "<h1>comodato {{numero}}</h1>",
      vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
    }),
    firmante: FirmanteComodante.crear({
      id: "firmante-sieira-v1",
      version: "v1",
      nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
      dni: "27.582.030",
      imagenFirmaPng: "data:image/png;base64,COMODANTE",
    }),
    ...sobreescribir,
  };
}

/** A fake page: turns whatever HTML it received into deterministic bytes. */
class PaginaFalsa implements PaginaRenderPdf {
  html: string | null = null;
  cerrada = false;
  fallarAlEsperarImagenes: Error | null = null;

  async setContent(html: string): Promise<void> {
    this.html = html;
  }

  async evaluate<T>(_funcion: () => T | Promise<T>): Promise<T> {
    if (this.fallarAlEsperarImagenes !== null) {
      throw this.fallarAlEsperarImagenes;
    }
    return undefined as T;
  }

  async pdf(opciones: OpcionesPdf): Promise<Uint8Array> {
    expect(opciones.format).toBe("A4");
    expect(opciones.printBackground).toBe(true);
    return Buffer.from(`PDF:${this.html ?? ""}`, "utf8");
  }

  async close(): Promise<void> {
    this.cerrada = true;
  }
}

class NavegadorFalso implements NavegadorRenderPdf {
  paginas: PaginaFalsa[] = [];
  cerrado = false;
  siguientePaginaFalla: Error | null = null;

  async newPage(): Promise<PaginaRenderPdf> {
    const pagina = new PaginaFalsa();
    if (this.siguientePaginaFalla !== null) {
      pagina.fallarAlEsperarImagenes = this.siguientePaginaFalla;
      this.siguientePaginaFalla = null;
    }
    this.paginas.push(pagina);
    return pagina;
  }

  async close(): Promise<void> {
    this.cerrado = true;
  }
}

class AlmacenFalso implements AlmacenDeDocumentos {
  guardados = new Map<string, Uint8Array>();

  async guardar(ruta: string, contenido: Uint8Array): Promise<void> {
    this.guardados.set(ruta, contenido);
  }
}

describe("GeneradorDeDocumentosPuppeteer", () => {
  let navegador: NavegadorFalso;
  let almacen: AlmacenFalso;
  let lanzamientos: number;
  let generador: GeneradorDeDocumentosPuppeteer;

  beforeEach(() => {
    navegador = new NavegadorFalso();
    almacen = new AlmacenFalso();
    lanzamientos = 0;

    generador = new GeneradorDeDocumentosPuppeteer({
      almacen,
      lanzarNavegador: async () => {
        lanzamientos += 1;
        return navegador;
      },
    });
  });

  it("produces exactly the two documents of the contract", async () => {
    const documentos = await generador.generar(entrada());

    expect(documentos).toHaveLength(2);
    expect(documentos.map((d) => d.documento).sort()).toEqual([
      "comodato",
      "condiciones_generales",
    ]);
  });

  it("builds each path from the contract number and the document type only", async () => {
    const documentos = await generador.generar(entrada({ numero: 7 }));

    const rutas = documentos.map((d) => d.ruta).sort();
    expect(rutas).toEqual(["7/comodato.pdf", "7/condiciones_generales.pdf"]);
    for (const ruta of rutas) {
      expect(ruta.startsWith("/")).toBe(false);
      expect(ruta).not.toContain("..");
    }
  });

  it("renders each document from its own template content, filled in", async () => {
    await generador.generar(entrada({ numero: 99 }));

    const htmls = navegador.paginas.map((p) => p.html);
    expect(htmls).toContain("<h1>condiciones 99</h1>");
    expect(htmls).toContain("<h1>comodato 99</h1>");
  });

  it("hashes the exact bytes it writes to the store", async () => {
    const documentos = await generador.generar(entrada());

    for (const documento of documentos) {
      const bytes = almacen.guardados.get(documento.ruta);
      expect(bytes).toBeDefined();
      const hashReal = createHash("sha256")
        .update(bytes as Uint8Array)
        .digest("hex");
      expect(documento.sha256).toBe(hashReal);
    }
  });

  it("writes both documents into the store", async () => {
    await generador.generar(entrada({ numero: 55 }));

    expect(almacen.guardados.size).toBe(2);
    expect(almacen.guardados.has("55/condiciones_generales.pdf")).toBe(true);
    expect(almacen.guardados.has("55/comodato.pdf")).toBe(true);
  });

  it("reuses one browser instance across multiple generar() calls", async () => {
    await generador.generar(entrada({ numero: 1 }));
    await generador.generar(entrada({ numero: 2 }));
    await generador.generar(entrada({ numero: 3 }));

    expect(lanzamientos).toBe(1);
  });

  it("launches the browser lazily, not at construction time", () => {
    expect(lanzamientos).toBe(0);
  });

  it("closes every page it opens, even though the browser stays open", async () => {
    await generador.generar(entrada());

    expect(navegador.paginas.every((p) => p.cerrada)).toBe(true);
    expect(navegador.cerrado).toBe(false);
  });

  it("waits for images to finish decoding before producing the PDF", async () => {
    const evaluados: boolean[] = [];
    navegador.newPage = async () => {
      const pagina = new PaginaFalsa();
      const evaluateOriginal = pagina.evaluate.bind(pagina);
      pagina.evaluate = async (fn) => {
        evaluados.push(true);
        return evaluateOriginal(fn);
      };
      navegador.paginas.push(pagina);
      return pagina;
    };

    await generador.generar(entrada());

    expect(evaluados).toEqual([true, true]);
  });

  it("rejects, and writes nothing to the store, when an image fails to decode", async () => {
    navegador.siguientePaginaFalla = new Error("La imagen no se pudo decodificar");

    await expect(generador.generar(entrada())).rejects.toThrow(
      /no se pudo decodificar/,
    );
    expect(almacen.guardados.size).toBe(0);
  });

  it("rejects, and writes nothing to the store, when the browser fails to launch", async () => {
    const generadorRoto = new GeneradorDeDocumentosPuppeteer({
      almacen,
      lanzarNavegador: async () => {
        throw new Error("Chromium no arrancó");
      },
    });

    await expect(generadorRoto.generar(entrada())).rejects.toThrow(
      "Chromium no arrancó",
    );
    expect(almacen.guardados.size).toBe(0);
  });

  it("retries launching the browser on the next render after a launch failure, instead of caching the rejection forever", async () => {
    let intentos = 0;
    const generadorInestable = new GeneradorDeDocumentosPuppeteer({
      almacen,
      lanzarNavegador: async () => {
        intentos += 1;
        if (intentos === 1) {
          throw new Error("Chromium se quedó sin memoria");
        }
        return navegador;
      },
    });

    await expect(generadorInestable.generar(entrada())).rejects.toThrow(
      "Chromium se quedó sin memoria",
    );

    const documentos = await generadorInestable.generar(entrada());

    expect(documentos).toHaveLength(2);
    expect(intentos).toBe(2);
  });

  it("bounds how many renders run at once", async () => {
    let activos = 0;
    let picoDeActivos = 0;
    const generadorAcotado = new GeneradorDeDocumentosPuppeteer({
      almacen: new AlmacenFalso(),
      maxRendersConcurrentes: 1,
      lanzarNavegador: async () => ({
        newPage: async () => {
          const pagina = new PaginaFalsa();
          const pdfOriginal = pagina.pdf.bind(pagina);
          pagina.pdf = async (opciones) => {
            activos += 1;
            picoDeActivos = Math.max(picoDeActivos, activos);
            const resultado = await pdfOriginal(opciones);
            activos -= 1;
            return resultado;
          };
          return pagina;
        },
        close: async () => {},
      }),
    });

    await generadorAcotado.generar(entrada());

    expect(picoDeActivos).toBe(1);
  });

  describe("cerrar", () => {
    it("closes the shared browser", async () => {
      await generador.generar(entrada());
      await generador.cerrar();

      expect(navegador.cerrado).toBe(true);
    });

    it("is a no-op when the browser was never launched", async () => {
      await expect(generador.cerrar()).resolves.toBeUndefined();
      expect(lanzamientos).toBe(0);
    });

    it("launches a fresh browser on the next render after closing", async () => {
      await generador.generar(entrada());
      await generador.cerrar();
      await generador.generar(entrada());

      expect(lanzamientos).toBe(2);
    });
  });
});
