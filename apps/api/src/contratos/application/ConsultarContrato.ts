import type { Contrato } from "../domain/Contrato";
import { buscarContrato } from "./buscarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

/**
 * Reads one contract back.
 *
 * Thin on purpose — it is `buscarContrato` with a name the controller can be
 * wired to. It exists so the HTTP layer depends on the application layer
 * rather than reaching into the repository directly, which is what keeps the
 * "who may read a contract" question answerable in one place when DESIGN.md
 * §9's *"the technician sees only their own contracts"* rule is implemented
 * with the office panel in Phase 2.
 */
export class ConsultarContrato {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(contratoId: string): Promise<Contrato> {
    return await buscarContrato(this.contratos, contratoId);
  }
}
