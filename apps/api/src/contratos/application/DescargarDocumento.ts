import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import { NOMBRE_DOCUMENTO } from "../../shared/domain/TipoDocumentoFirmado";
import type { TipoDocumentoFirmado } from "../../shared/domain/TipoDocumentoFirmado";
import { buscarContrato } from "./buscarContrato";
import type { AlmacenDeDocumentos } from "./ports/AlmacenDeDocumentos";
import type { ContratoRepository } from "./ports/ContratoRepository";

export interface ComandoDescargarDocumento {
  readonly contratoId: string;
  readonly documento: TipoDocumentoFirmado;
}

export interface DocumentoDescargado {
  readonly documento: TipoDocumentoFirmado;
  readonly nombreArchivo: string;
  readonly sha256: string;
  readonly contenido: Uint8Array;
}

/**
 * Serves one of a signed contract's two PDFs.
 *
 * **The requested type never becomes a path.** It is matched against the
 * documents the aggregate actually carries, and the path handed to the store
 * is the one the aggregate validated when the contract was sealed — no
 * absolute paths, no traversal (`Contrato.registrarDocumentos`). So a crafted
 * `:tipo` in the URL finds nothing and gets a 404; it cannot describe a file.
 * `AlmacenDeDocumentosEnDisco.leer` checks containment again anyway, because
 * a store should not depend on its callers being careful.
 */
export class DescargarDocumento {
  constructor(
    private readonly contratos: ContratoRepository,
    private readonly almacen: AlmacenDeDocumentos,
  ) {}

  async ejecutar(
    comando: ComandoDescargarDocumento,
  ): Promise<DocumentoDescargado> {
    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    if (!contrato.estaFirmado) {
      throw new ConflictoDeEstado(
        "El contrato todavía es un borrador: no hay documento firmado para descargar.",
      );
    }

    const documento = contrato.documentos.find(
      (uno) => uno.documento === comando.documento,
    );

    if (documento === undefined) {
      // Deliberately does not name the store, the path or the type that was
      // asked for — the last of those is attacker-controlled and echoing it
      // would put it into every log line this response produces.
      throw new RecursoNoEncontrado(
        `El contrato ${comando.contratoId} no tiene ese documento firmado.`,
      );
    }

    return {
      documento: documento.documento,
      nombreArchivo: `contrato-${contrato.numero}-${documento.documento}.pdf`,
      sha256: documento.sha256,
      // Rejects rather than answering empty when the bytes are gone: a signed
      // contract with a missing PDF is an incident, and a zero-byte download
      // would still look like a document to whoever opened it.
      contenido: await this.almacen.leer(documento.ruta),
    };
  }
}

/** Human name of a document, for anything a person reads. */
export const nombreLegibleDelDocumento = (
  documento: TipoDocumentoFirmado,
): string => NOMBRE_DOCUMENTO[documento];
