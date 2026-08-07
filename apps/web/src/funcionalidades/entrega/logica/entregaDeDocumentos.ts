import type { DatosContratoDetalle, DatosDocumentoDisponible } from "@contratos/esquemas";

import { clienteHttpBlob } from "../../../datos/clienteHttp";

/**
 * DESIGN.md D11 — delivery. Fetches both sealed PDFs through the same
 * authenticated seam as everything else (`clienteHttpBlob`), then prefers
 * `navigator.share`, feature-detected via `navigator.canShare` and never
 * assumed. `AbortError` (the technician closing the OS share sheet) is a
 * person changing their mind, not a failure, so it never falls through to a
 * forced download — every other share failure does.
 *
 * The threat-matrix N/A carried forward as a design requirement lives here:
 * every `URL.createObjectURL` in the download fallback is paired with a
 * `revokeObjectURL`, via a `try`/`finally` so the pairing holds even if
 * writing the download itself throws. Proven in `entregaDeDocumentos.spec.ts`.
 */

const NOMBRE_ARCHIVO: Record<DatosDocumentoDisponible["documento"], string> = {
  condiciones_generales: "condiciones-generales.pdf",
  comodato: "comodato.pdf",
};

/** `Accept` is the only header this endpoint needs beyond the Bearer one `clienteHttpBlob` already attaches. */
const OPCIONES_PDF = { encabezados: { Accept: "application/pdf" } };

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
    descargarArchivo(archivo);
  }
  return { via: "descarga" };
}

async function descargarPdf(documento: DatosDocumentoDisponible): Promise<File> {
  const blob = await clienteHttpBlob(documento.enlace, OPCIONES_PDF);
  return new File([blob], NOMBRE_ARCHIVO[documento.documento], { type: "application/pdf" });
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

function descargarArchivo(archivo: File): void {
  const url = URL.createObjectURL(archivo);
  try {
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = archivo.name;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
