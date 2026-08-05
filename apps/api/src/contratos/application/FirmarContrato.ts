import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import type { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Contrato } from "../domain/Contrato";
import type { FirmaCapturada } from "../domain/FirmaCapturada";
import { Plazo } from "../domain/Plazo";
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
      throw new RecursoNoEncontrado(
        `No existe el contrato ${comando.contratoId}.`,
      );
    }

    // Retry safety. The tablet is on a field connection, so a request that
    // times out *after* this method already sealed the contract will be sent
    // again. `ConflictoDeEstado` — not a plain `DomainError` — is what makes
    // that second attempt a 409: retrying it will fail forever, there is no
    // field to correct, and the technician has to reload the screen and see
    // that the contract is already signed.
    //
    // The aggregate's own `firmar()` raises the same type. This guard is here
    // so the refusal costs no contract number and no PDF render, and it has
    // to speak the same language or the status would depend on which of the
    // two noticed first.
    if (contrato.estaFirmado) {
      throw new ConflictoDeEstado(
        `El contrato ${comando.contratoId} no se puede firmar porque ya está ${contrato.estado}.`,
      );
    }

    // Reject an incomplete signature set before spending a PDF render on it.
    Contrato.validarJuegoDeFirmas(comando.firmas);

    const [plantilla, firmante] = await Promise.all([
      this.plantillas.vigente(),
      this.firmantes.activo(),
    ]);

    // The sequence may leave gaps if signing fails after this point. That is
    // preferable to a tablet-side number, which could collide outright.
    const numero = await this.contratos.siguienteNumero();
    const fechaFirma = FechaCalendario.enZona(
      this.reloj.ahora(),
      ZONA_HORARIA_CONTRATO,
    );

    // Render BEFORE touching the aggregate. Chromium running out of memory is
    // the likeliest failure on a modest VPS, and when it happens the contract
    // has to still be a draft the technician can retry — not a half-signed
    // record with a consumed number and no PDF behind it.
    const documentos = await this.documentos.generar({
      numero,
      fechaFirma,
      plazo: Plazo.estandarDesde(fechaFirma),
      comodatario: contrato.comodatario,
      equipos: contrato.equipos,
      firmas: comando.firmas,
      plantilla,
      firmante,
    });

    // From here on nothing awaits: the aggregate goes from draft to fully
    // sealed in one synchronous run.
    contrato.firmar({
      numero,
      plantillaVersionId: plantilla.id,
      firmanteId: firmante.id,
      fechaFirma,
      firmas: comando.firmas,
      contexto: comando.contexto,
    });
    contrato.registrarDocumentos(documentos);

    await this.contratos.guardar(contrato);

    return contrato;
  }
}
