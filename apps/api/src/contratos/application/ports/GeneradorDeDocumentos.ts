import type { FirmanteComodante } from "../../../firmantes/domain/FirmanteComodante";
import type { PlantillaContrato } from "../../../plantillas/domain/PlantillaContrato";
import type { Contrato, DocumentoContrato } from "../../domain/Contrato";

export interface EntradaGeneracion {
  /** Already numbered, dated and holding both customer signatures. */
  readonly contrato: Contrato;
  readonly plantilla: PlantillaContrato;
  readonly firmante: FirmanteComodante;
}

/**
 * Renders the two PDFs, hashes them and stores them.
 *
 * Server-side by design: rendering on the tablet would tie the document's
 * appearance to whatever fonts and zoom that device happens to have, and the
 * integrity hash belongs where the evidence is kept.
 */
export interface GeneradorDeDocumentos {
  generar(entrada: EntradaGeneracion): Promise<readonly DocumentoContrato[]>;
}
