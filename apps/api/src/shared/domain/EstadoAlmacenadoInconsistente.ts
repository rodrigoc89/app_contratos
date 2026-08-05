import { DomainError } from "./DomainError";

/**
 * Raised when data read back from storage describes an aggregate that could
 * never have been built through the domain — a contract stored as `vigente`
 * with no number, a draft carrying signatures, a termination with no reason.
 *
 * This is neither of the other two failures, and that is the point. Nobody sent
 * a bad field, so it is not a 400; no operation arrived at the wrong moment, so
 * it is not a 409. Both of those answers would put the blame on the technician
 * and ask them to fix something that is not theirs to fix — the row is broken,
 * or the code that wrote it is. Retrying, correcting the form, reloading the
 * screen: none of it can help.
 *
 * So it maps to 500 with the generic message and a correlation id, and is
 * flagged as unexpected so `FiltroDeExcepciones` logs the whole exception. It
 * is still a `DomainError`, because an invariant of the business domain is what
 * was violated and the aggregate is the only place that can notice — but it is
 * the one `DomainError` whose message never reaches a client, since it names
 * internal identifiers and internal invariants.
 *
 * Being a subclass means `respuestaDeError` has to test it *before* the generic
 * `DomainError` branch. Its tests pin that ordering.
 */
export class EstadoAlmacenadoInconsistente extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "EstadoAlmacenadoInconsistente";
  }
}
