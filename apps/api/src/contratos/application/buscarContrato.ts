import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import type { Contrato } from "../domain/Contrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

/**
 * Loads a contract or says, in the domain's own vocabulary, that there is
 * none.
 *
 * Every use case that takes a contract id begins this way, and each of them
 * getting its own `if (contrato === null)` would eventually produce four
 * slightly different messages and, sooner or later, one that answered 400
 * instead of 404. `RecursoNoEncontrado` is what carries the status, so it is
 * raised in exactly one place.
 *
 * The message names the id the caller already sent and nothing else — not the
 * table, not the query, not whether the id ever existed.
 */
export async function buscarContrato(
  contratos: ContratoRepository,
  contratoId: string,
): Promise<Contrato> {
  const contrato = await contratos.porId(contratoId);

  if (contrato === null) {
    throw new RecursoNoEncontrado(`No existe el contrato ${contratoId}.`);
  }

  return contrato;
}
