import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { ContextoDeFirma } from "../domain/ContextoDeFirma";
import type { Contrato } from "../domain/Contrato";
import type { FirmaCapturada } from "../domain/FirmaCapturada";
import type { ContratoRepository } from "./ports/ContratoRepository";
import type { FirmanteRepository } from "./ports/FirmanteRepository";
import type { GeneradorDeDocumentos } from "./ports/GeneradorDeDocumentos";
import type { PlantillaRepository } from "./ports/PlantillaRepository";
import type { Reloj } from "./ports/Reloj";

/**
 * Argentina runs on a single offset, but naming the zone keeps the intent
 * explicit: contract dates are calendar dates in Argentina, not in UTC.
 */
export const ZONA_HORARIA_CONTRATO = "America/Argentina/Cordoba";

export interface ComandoFirmarContrato {
  contratoId: string;
  firmas: readonly FirmaCapturada[];
  contexto: ContextoDeFirma;
}

/**
 * Seals a draft into a signed contract.
 *
 * The whole operation is one unit: number, date, template snapshot, signatory
 * snapshot, both signatures, both rendered PDFs and their hashes. Nothing is
 * persisted until all of it exists — if rendering fails, the stored contract
 * is still a draft and the technician can retry without the customer having
 * signed into a void.
 */
export class FirmarContrato {
  constructor(
    private readonly contratos: ContratoRepository,
    private readonly plantillas: PlantillaRepository,
    private readonly firmantes: FirmanteRepository,
    private readonly documentos: GeneradorDeDocumentos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(comando: ComandoFirmarContrato): Promise<Contrato> {
    const contrato = await this.contratos.porId(comando.contratoId);
    if (contrato === null) {
      throw new DomainError(
        `No existe el contrato ${comando.contratoId}.`,
      );
    }

    const [plantilla, firmante] = await Promise.all([
      this.plantillas.vigente(),
      this.firmantes.activo(),
    ]);

    // The sequence may leave gaps if signing fails after this point. That is
    // preferable to a tablet-side number, which could collide outright.
    const numero = await this.contratos.siguienteNumero();

    contrato.firmar({
      numero,
      plantillaVersionId: plantilla.id,
      firmanteId: firmante.id,
      fechaFirma: FechaCalendario.enZona(
        this.reloj.ahora(),
        ZONA_HORARIA_CONTRATO,
      ),
      firmas: comando.firmas,
      contexto: comando.contexto,
    });

    const documentos = await this.documentos.generar({
      contrato,
      plantilla,
      firmante,
    });
    contrato.registrarDocumentos(documentos);

    await this.contratos.guardar(contrato);

    return contrato;
  }
}
