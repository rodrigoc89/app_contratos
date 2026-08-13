import type { DatosContratoDetalle } from "@contratos/esquemas";

import { descargarPdf, guardarArchivo } from "../../../datos/descargaDeArchivo";

/**
 * DESIGN.md D11 — delivery. Fetches both sealed PDFs through the same
 * authenticated seam as everything else, then prefers `navigator.share`,
 * feature-detected via `navigator.canShare` and never assumed. `AbortError`
 * (the technician closing the OS share sheet) is a person changing their
 * mind, not a failure, so it never falls through to a forced download —
 * every other share failure does.
 *
 * The fetch-and-save half now lives in `datos/descargaDeArchivo.ts`, shared
 * with the office panel's contract detail. The threat-matrix N/A carried
 * forward as a design requirement — every `URL.createObjectURL` paired with
 * a `revokeObjectURL` through a `try`/`finally` — moved with it, and is
 * still proven by this module's spec through `guardarArchivo`.
 */

export type ResultadoEntrega =
  | { readonly via: "compartido" }
  | { readonly via: "descarga" }
  | { readonly via: "cancelado" };

export async function entregarDocumentos(contrato: DatosContratoDetalle): Promise<ResultadoEntrega> {
  const archivos = await Promise.all(contrato.documentos.map(descargarPdf));

  try {
    if (await compartir(archivos)) {
      return { via: "compartido" };
    }
  } catch (motivo) {
    if (esCancelacion(motivo)) {
      return { via: "cancelado" };
    }
    // Any other throw — Web Share genuinely failing — falls through to the
    // download path below rather than leaving the technician stuck.
  }

  for (const archivo of archivos) {
    guardarArchivo(archivo);
  }
  return { via: "descarga" };
}


/**
 * Tries sharing every document in one call first. Web Share does not
 * guarantee multi-file support even where it exists at all, so a refusal of
 * the combined set falls back to sharing each document on its own before
 * giving up on sharing altogether.
 */
async function compartir(archivos: readonly File[]): Promise<boolean> {
  if (await intentarCompartir(archivos)) {
    return true;
  }
  for (const archivo of archivos) {
    if (!(await intentarCompartir([archivo]))) {
      return false;
    }
  }
  return true;
}

async function intentarCompartir(archivos: readonly File[]): Promise<boolean> {
  if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [...archivos] })) {
    return false;
  }
  await navigator.share({
    files: [...archivos],
    title: "Contrato de comodato",
    text: "Documentos firmados del contrato de comodato.",
  });
  return true;
}

function esCancelacion(motivo: unknown): boolean {
  return motivo instanceof DOMException && motivo.name === "AbortError";
}

