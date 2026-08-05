/**
 * Only for typing `esperarImagenes`' page-context callback below: that
 * function never runs in this Node process — Puppeteer serialises it and
 * executes it inside the browser page — so it is the one place in this
 * backend that legitimately needs `document`/`HTMLImageElement`. Scoped to
 * this file alone rather than added to `tsconfig.json`'s `lib`, which would
 * make DOM globals look valid everywhere else in a Node/NestJS codebase that
 * has no business using them.
 */
/// <reference lib="dom" />

import { createHash } from "node:crypto";

import type { AlmacenDeDocumentos } from "../application/ports/AlmacenDeDocumentos";
import type {
  EntradaGeneracion,
  GeneradorDeDocumentos,
} from "../application/ports/GeneradorDeDocumentos";
import { rellenarPlantilla, valoresDePlantilla } from "../application/rellenarPlantilla";
import type { DocumentoContrato } from "../domain/Contrato";
import {
  DOCUMENTOS_DEL_CONTRATO,
  type TipoDocumentoFirmado,
} from "../../shared/domain/TipoDocumentoFirmado";
import { ColaDeConcurrencia } from "./ColaDeConcurrencia";

/**
 * The minimal shape this class needs from a rendered page.
 *
 * Kept narrow and structural on purpose: a real Puppeteer `Page` satisfies
 * it, and so does a hand-written fake in tests, without pulling Puppeteer's
 * types (or a running browser) into the unit test suite.
 */
export interface PaginaRenderPdf {
  setContent(
    html: string,
    opciones: { waitUntil: "load" },
  ): Promise<unknown>;
  evaluate<T>(funcion: () => T | Promise<T>): Promise<T>;
  pdf(opciones: OpcionesPdf): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface OpcionesPdf {
  readonly format: "A4";
  readonly printBackground: boolean;
  readonly margin: {
    readonly top: string;
    readonly bottom: string;
    readonly left: string;
    readonly right: string;
  };
}

/** The minimal shape this class needs from a launched browser. */
export interface NavegadorRenderPdf {
  newPage(): Promise<PaginaRenderPdf>;
  close(): Promise<void>;
}

export type LanzadorDeNavegador = () => Promise<NavegadorRenderPdf>;

/** A4 with margins in the range typical of a printed legal document. */
const MARGEN: OpcionesPdf["margin"] = {
  top: "25mm",
  bottom: "20mm",
  left: "20mm",
  right: "20mm",
};

export interface OpcionesGeneradorDeDocumentosPuppeteer {
  readonly almacen: AlmacenDeDocumentos;
  /**
   * How the browser gets launched. Defaults to a real headless Chromium via
   * the `puppeteer` package. Tests inject a fake here so the unit suite never
   * needs a real browser.
   */
  readonly lanzarNavegador?: LanzadorDeNavegador;
  /**
   * Upper bound on PDF renders running at once, across every `generar()`
   * call this instance ever makes. The target VPS (2 vCPU / 4 GB, §7/§10 of
   * DESIGN.md) treats Chromium as the single biggest resource consumer, so
   * this defaults to 1 — effectively a render queue, not a render-per-request
   * free-for-all. Raise it only if the box is sized for more.
   */
  readonly maxRendersConcurrentes?: number;
}

/**
 * Renders both documents of a contract to PDF with headless Chromium,
 * hashes the exact bytes written and stores them.
 *
 * **One browser, reused.** Launching Chromium costs real memory and a couple
 * of hundred milliseconds; doing it per document, on a box this small, would
 * make signing slower and less predictable than it needs to be. The browser
 * is launched lazily on first use and kept alive across every `generar()`
 * call until `cerrar()` is invoked — call that once, from the process's
 * shutdown hook.
 *
 * **Never a partial result.** Both PDFs are rendered and hashed in memory
 * before either is written to the store, and both writes happen together.
 * If anything fails along the way — a bad signature image, Chromium running
 * out of memory, a full disk — the whole call rejects and nothing is
 * returned. `FirmarContrato` depends on exactly that: a failed render must
 * leave the contract a retryable draft, never a half-sealed record.
 */
export class GeneradorDeDocumentosPuppeteer implements GeneradorDeDocumentos {
  private readonly almacen: AlmacenDeDocumentos;
  private readonly lanzarNavegador: LanzadorDeNavegador;
  private readonly cola: ColaDeConcurrencia;
  private navegador: Promise<NavegadorRenderPdf> | null = null;

  constructor(opciones: OpcionesGeneradorDeDocumentosPuppeteer) {
    this.almacen = opciones.almacen;
    this.lanzarNavegador = opciones.lanzarNavegador ?? lanzarChromium;
    this.cola = new ColaDeConcurrencia(opciones.maxRendersConcurrentes ?? 1);
  }

  async generar(
    entrada: EntradaGeneracion,
  ): Promise<readonly DocumentoContrato[]> {
    const valores = valoresDePlantilla(entrada);

    const renderizados = await Promise.all(
      DOCUMENTOS_DEL_CONTRATO.map(async (documento) => {
        const html = rellenarPlantilla(
          entrada.plantilla.contenidoDe(documento),
          valores,
        );
        const contenido = await this.cola.ejecutar(() =>
          this.renderizarPdf(html),
        );
        const sha256 = createHash("sha256").update(contenido).digest("hex");

        return {
          documento,
          ruta: rutaDelDocumento(entrada.numero, documento),
          sha256,
          contenido,
        };
      }),
    );

    // Both renders succeeded — now, and only now, do bytes land in the
    // store. A crash between these two writes is the one residual gap
    // (Chromium already gave up its memory by this point, so it is the
    // unlikelier half of the operation to fail).
    await Promise.all(
      renderizados.map(({ ruta, contenido }) =>
        this.almacen.guardar(ruta, contenido),
      ),
    );

    return renderizados.map(({ documento, ruta, sha256 }) => ({
      documento,
      ruta,
      sha256,
    }));
  }

  /** Closes the shared browser. Call once, on process shutdown. */
  async cerrar(): Promise<void> {
    if (this.navegador === null) {
      return;
    }
    const navegador = await this.navegador;
    this.navegador = null;
    await navegador.close();
  }

  private async renderizarPdf(html: string): Promise<Uint8Array> {
    const navegador = await this.obtenerNavegador();
    const pagina = await navegador.newPage();

    try {
      await pagina.setContent(html, { waitUntil: "load" });
      await esperarImagenes(pagina);

      return await pagina.pdf({
        format: "A4",
        printBackground: true,
        margin: MARGEN,
      });
    } finally {
      await pagina.close();
    }
  }

  private obtenerNavegador(): Promise<NavegadorRenderPdf> {
    this.navegador ??= this.lanzarNavegador().catch((error: unknown) => {
      // A failed launch must not be cached forever — an OOM'd or crashed
      // Chromium is exactly the kind of transient VPS hiccup (§7/§10 of
      // DESIGN.md) that should be retried on the next render, not brick
      // every subsequent signature until the process is restarted.
      this.navegador = null;
      throw error;
    });
    return this.navegador;
  }
}

/**
 * Relative to the store root, built only from the contract number and the
 * document type — nothing here can come from customer input, so there is
 * nothing to sanitise. `Contrato.registrarDocumentos` still rejects anything
 * that does not look like this, and `AlmacenDeDocumentosEnDisco` re-checks it
 * independently before writing.
 */
function rutaDelDocumento(
  numero: number,
  documento: TipoDocumentoFirmado,
): string {
  return `${numero}/${documento}.pdf`;
}

/**
 * Signatures arrive as `data:` URIs baked into the HTML. `setContent`'s
 * `load` event fires once the DOM and its inline resources are attached, but
 * that is not the same as "decoded and paintable" — a corrupt or truncated
 * base64 signature can still be sitting there undecoded. Printing that PDF
 * would produce a legal document missing the customer's signature, silently.
 *
 * This waits for every `<img>` on the page to finish decoding and throws if
 * any of them can't — which turns that failure into a rejected render
 * instead of a blank box on paper.
 */
async function esperarImagenes(pagina: PaginaRenderPdf): Promise<void> {
  await pagina.evaluate(async () => {
    const imagenes = Array.from(document.images);

    await Promise.all(
      imagenes.map(async (imagen) => {
        if (imagen.complete && imagen.naturalWidth > 0) {
          return;
        }

        await imagen.decode();

        if (imagen.naturalWidth === 0) {
          throw new Error(
            `La imagen "${imagen.src.slice(0, 40)}" se decodificó pero no tiene contenido.`,
          );
        }
      }),
    );
  });
}

/**
 * The default, real browser: one headless Chromium instance via the
 * `puppeteer` package.
 *
 * `--no-sandbox` is required in this environment: Chromium's own sandbox
 * needs unprivileged user namespaces (or its setuid-root helper binary),
 * neither of which is available to the non-root user this API runs as on the
 * target VPS or inside a container. That trade-off is acceptable here
 * because this browser only ever renders HTML this process built itself —
 * the contract template plus server-controlled values — and never navigates
 * to a network URL or third-party content.
 */
async function lanzarChromium(): Promise<NavegadorRenderPdf> {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  return browser as unknown as NavegadorRenderPdf;
}
