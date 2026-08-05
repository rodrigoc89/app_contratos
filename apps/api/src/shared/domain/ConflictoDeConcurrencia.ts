import { DomainError } from "./DomainError";

/**
 * Raised when two writers touched the same aggregate at the same time and this
 * one lost: the stored row had already moved on by the time the save ran, so
 * the write was refused rather than applied on top of somebody else's.
 *
 * It is the fourth answer in the family that starts at `ConflictoDeEstado`,
 * and the reason it is not simply that class is that the two mean genuinely
 * different things. A `ConflictoDeEstado` says somebody asked for something
 * the contract cannot do — retrying the exact same request will fail the exact
 * same way, forever. This one says **nobody did anything invalid**: two
 * requests were in flight over one contract, both were legitimate, and only
 * one of them could win. The remedy the caller is given happens to be the same
 * — reload the screen and look at what is actually stored — which is why
 * `respuestaDeError` maps this to 409 as well.
 *
 * Keeping the type distinct is what makes the difference readable *afterwards*.
 * A retried signing request answered 409 is the system working as designed; a
 * burst of these is a symptom — a tablet double-tapping, a client retrying
 * while the first request is still in flight, an office panel racing a
 * technician — and telling those apart in a log or a metric is impossible once
 * both have collapsed into one code. So it carries its own
 * `conflicto_de_concurrencia`, and, like its siblings, `respuestaDeError` has
 * to test it *before* the generic `DomainError` branch; its tests pin that.
 *
 * Its message reaches the technician, so it says what happened in terms of the
 * contract in front of them and never mentions versions, rows or transactions.
 */
export class ConflictoDeConcurrencia extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictoDeConcurrencia";
  }
}
