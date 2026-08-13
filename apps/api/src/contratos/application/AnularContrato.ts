import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import type { Contrato } from "../domain/Contrato";
import { buscarContrato } from "./buscarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

export interface ComandoAnular {
  readonly contratoId: string;
  readonly motivo: string;
  readonly fecha: string;
  /** From the verified token, never from the body. */
  readonly usuarioId: string;
}

/**
 * Voids a contract that was signed with wrong data — a mistyped DNI, a wrong
 * MAC (DESIGN.md §3). A signed contract is **never edited**: it is annulled
 * and a new one is created and signed from scratch, with `reemplazaA`
 * pointing back here so the chain reads from either end.
 *
 * Creating that replacement is deliberately NOT part of this use case. It is
 * a técnico's job on the tablet, with the customer present and signing again
 * — the inconvenience DESIGN.md §3 calls the price of the signature meaning
 * something. Chaining it here would let the office manufacture a replacement
 * nobody signed.
 */
export class AnularContrato {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(comando: ComandoAnular): Promise<Contrato> {
    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    contrato.anular({
      motivo: comando.motivo,
      fecha: FechaCalendario.desdeIso(comando.fecha),
      usuarioId: comando.usuarioId,
    });

    await this.contratos.guardar(contrato);
    return contrato;
  }
}
