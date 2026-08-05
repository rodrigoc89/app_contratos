import { DomainError } from "./DomainError";

/**
 * Raised when the thing an operation names does not exist — a contract id
 * that matches no row, a document that was never sealed onto a contract.
 *
 * It is the third answer in the same family as `ConflictoDeEstado` and
 * `EstadoAlmacenadoInconsistente`, and it exists for the same reason they do:
 * so the *status* is carried by the domain rather than re-derived downstream
 * from the wording of a message.
 *
 * What separates it from a plain `DomainError` is what the caller should do
 * next. A validation error names a field, and correcting it works. This one
 * names nothing correctable: the technician is looking at a stale screen, or
 * followed a link to a contract that was never created. Answering 400 would
 * send them hunting for a typo in a form they filled in correctly, and 409
 * would suggest a race that never happened. `respuestaDeError` maps it to 404.
 *
 * Like `ConflictoDeEstado`, being a subclass of `DomainError` means the
 * mapping has to test it *before* the generic branch; its tests pin that
 * ordering.
 *
 * Its message reaches the client, so it must name what was not found in terms
 * the caller already knows — the id they sent — and nothing about how or where
 * the lookup happened.
 */
export class RecursoNoEncontrado extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "RecursoNoEncontrado";
  }
}
