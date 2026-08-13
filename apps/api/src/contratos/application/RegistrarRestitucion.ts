import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { Contrato } from "../domain/Contrato";
import { buscarContrato } from "./buscarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

export interface ComandoRegistrarRestitucion {
  readonly contratoId: string;
  readonly fecha: string;
  /** From the verified token, never from the body. */
  readonly usuarioId: string;
}

/**
 * Records that the company's equipment came back from a terminated contract.
 * This is what closes the outstanding-equipment report DESIGN.md §3 is built
 * on: `estado = dado_de_baja AND fecha_restitucion IS NULL` is hardware
 * sitting at the home of someone who is no longer a customer.
 *
 * Carries no reason, unlike the other two: equipment coming back is a fact,
 * not a decision.
 */
export class RegistrarRestitucion {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(comando: ComandoRegistrarRestitucion): Promise<Contrato> {
    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    contrato.registrarRestitucion({
      fecha: FechaCalendario.desdeIso(comando.fecha),
      usuarioId: comando.usuarioId,
    });

    await this.contratos.guardar(contrato);
    return contrato;
  }
}
