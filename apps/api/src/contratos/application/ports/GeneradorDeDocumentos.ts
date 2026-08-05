import type { FirmanteComodante } from "../../../firmantes/domain/FirmanteComodante";
import type { PlantillaContrato } from "../../../plantillas/domain/PlantillaContrato";
import type { FechaCalendario } from "../../../shared/domain/FechaCalendario";
import type { Comodatario } from "../../domain/Comodatario";
import type { DocumentoContrato } from "../../domain/Contrato";
import type { Equipos } from "../../domain/Equipos";
import type { FirmaCapturada } from "../../domain/FirmaCapturada";
import type { Plazo } from "../../domain/Plazo";

/**
 * Everything the renderer needs, as plain values.
 *
 * Deliberately NOT the `Contrato` aggregate: rendering happens before the
 * draft is signed, precisely so that a rendering failure leaves the contract a
 * draft the technician can retry. Handing over the aggregate would invite
 * sealing it halfway.
 */
export interface EntradaGeneracion {
  readonly numero: number;
  readonly fechaFirma: FechaCalendario;
  readonly plazo: Plazo;
  readonly comodatario: Comodatario;
  readonly equipos: Equipos;
  readonly firmas: readonly FirmaCapturada[];
  readonly plantilla: PlantillaContrato;
  readonly firmante: FirmanteComodante;
}

/**
 * Renders the two PDFs, hashes them and stores them.
 *
 * Server-side by design: rendering on the tablet would tie the document's
 * appearance to whatever fonts and zoom that device happens to have, and the
 * integrity hash belongs where the evidence is kept.
 *
 * Implementations must write inside the document store and return paths
 * relative to it — the aggregate rejects absolute paths and traversal.
 */
export interface GeneradorDeDocumentos {
  generar(entrada: EntradaGeneracion): Promise<readonly DocumentoContrato[]>;
}
