import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { Contrato } from "../domain/Contrato";
import { buscarContrato } from "./buscarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

export interface ComandoDarDeBaja {
  readonly contratoId: string;
  readonly motivo: string;
  readonly fecha: string;
  /**
   * Taken from the verified token by the controller, never from the request
   * body — a request able to name its own author would make the audit trail
   * worth nothing. The schema refuses the field outright for the same reason.
   */
  readonly usuarioId: string;
}

/**
 * Ends a contract: the service stopped, the agreement no longer applies
 * (DESIGN.md §3). It does not delete, overwrite or edit anything — the signed
 * PDF and its hash stay exactly as they were, and the state lives beside the
 * document.
 *
 * Deliberately thin. Every rule — that only a `vigente` contract can be
 * terminated, that the date cannot precede the signature, that the reason is
 * required — belongs to the aggregate, which is where it stays enforceable no
 * matter who calls it. What this adds is finding the contract, turning the
 * wire's date into a calendar date, stamping the actor, and saving.
 */
export class DarDeBajaContrato {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(comando: ComandoDarDeBaja): Promise<Contrato> {
    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    contrato.darDeBaja({
      motivo: comando.motivo,
      fecha: FechaCalendario.desdeIso(comando.fecha),
      usuarioId: comando.usuarioId,
    });

    await this.contratos.guardar(contrato);
    return contrato;
  }
}
