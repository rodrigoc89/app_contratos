import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";

import type { AlmacenDeDocumentos } from "../application/ports/AlmacenDeDocumentos";

/**
 * Writes document bytes under a configurable root directory on the local
 * filesystem.
 *
 * The caller (the PDF generator) already builds `ruta` only from the
 * contract number and the document type, so it should never point outside
 * `raiz` — but this adapter re-checks it independently before touching disk.
 * The `Contrato` aggregate's own path check runs later, on the returned
 * `DocumentoContrato[]`, *after* these bytes are already written; relying on
 * it alone would let a bug write outside the store before anyone rejected
 * anything.
 */
export class AlmacenDeDocumentosEnDisco implements AlmacenDeDocumentos {
  private readonly raiz: string;

  constructor(raiz: string) {
    this.raiz = resolve(raiz);
  }

  async guardar(ruta: string, contenido: Uint8Array): Promise<void> {
    const destino = this.resolverDentroDeLaRaiz(ruta);

    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
  }

  /**
   * The containment check runs here too, before the read.
   *
   * It is the same rule as `guardar`, applied to the method that a URL can
   * reach. The controller never builds this path from a request — it reads it
   * off the aggregate, which validated it when the contract was sealed — so
   * this check should be unreachable. Keeping it means a future caller that
   * forgets gets an error instead of a copy of `/etc/passwd`.
   */
  async leer(ruta: string): Promise<Uint8Array> {
    const origen = this.resolverDentroDeLaRaiz(ruta);

    return new Uint8Array(await readFile(origen));
  }

  private resolverDentroDeLaRaiz(ruta: string): string {
    if (isAbsolute(ruta)) {
      throw new Error(
        `No se puede acceder a "${ruta}": tiene que ser una ruta relativa al almacén de documentos.`,
      );
    }

    const destino = resolve(this.raiz, ruta);
    const raizConSeparador = this.raiz.endsWith(sep)
      ? this.raiz
      : this.raiz + sep;

    if (destino !== this.raiz && !destino.startsWith(raizConSeparador)) {
      throw new Error(
        `No se puede acceder a "${ruta}": queda fuera del almacén de documentos.`,
      );
    }

    return destino;
  }
}
