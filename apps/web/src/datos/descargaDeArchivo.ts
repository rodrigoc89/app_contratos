import type { DatosDocumentoDisponible } from "@contratos/esquemas";

import { clienteHttpBlob } from "./clienteHttp";

/**
 * Fetching a sealed PDF and handing it to the browser, shared by the two
 * features that need it: the técnico's delivery flow
 * (`funcionalidades/entrega`) and the office panel's contract detail
 * (`funcionalidades/contratos`).
 *
 * Extracted rather than copied. The `URL.revokeObjectURL` below is paired
 * with its `createObjectURL` through a `try`/`finally` so the pairing holds
 * even when writing the download throws — that pairing is a carried-forward
 * design requirement, proven in `entregaDeDocumentos.spec.ts`. A second copy
 * of it is a second place for it to be forgotten.
 *
 * The endpoint is authenticated, so a plain `<a href>` would answer 401: the
 * browser sends no `Authorization` header. Every download therefore goes
 * through `clienteHttpBlob`, which attaches the bearer token, and reaches the
 * user as an object URL.
 */

const NOMBRE_ARCHIVO: Record<DatosDocumentoDisponible["documento"], string> = {
  condiciones_generales: "condiciones-generales.pdf",
  comodato: "comodato.pdf",
};

/** `Accept` is the only header this endpoint needs beyond the Bearer one `clienteHttpBlob` already attaches. */
const OPCIONES_PDF = { encabezados: { Accept: "application/pdf" } };

export async function descargarPdf(documento: DatosDocumentoDisponible): Promise<File> {
  const blob = await clienteHttpBlob(documento.enlace, OPCIONES_PDF);
  return new File([blob], NOMBRE_ARCHIVO[documento.documento], { type: "application/pdf" });
}

export function guardarArchivo(archivo: File): void {
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

/** Fetch one sealed PDF and hand it to the browser as a download. */
export async function descargarDocumento(documento: DatosDocumentoDisponible): Promise<void> {
  guardarArchivo(await descargarPdf(documento));
}
