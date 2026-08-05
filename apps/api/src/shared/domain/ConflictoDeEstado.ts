import { DomainError } from "./DomainError";

/**
 * Raised when the request is well formed, its data is valid, and the operation
 * still cannot happen — because the aggregate is not in a state where it means
 * anything. A signed contract cannot be signed again; a draft has no rendered
 * documents to seal; equipment only comes back from a contract that was
 * actually terminated.
 *
 * What separates it from a plain `DomainError` is what the caller has to do
 * next. A validation error names a field, and sending the request again with
 * that field corrected works. Here there is no field to correct: **retrying the
 * exact same request will fail the exact same way, forever.** Either someone
 * else already performed the operation, or the technician is looking at a stale
 * screen and has to reload it before deciding what to do. That difference is
 * the whole reason HTTP separates 409 from 400, and `respuestaDeError` maps
 * this type to 409.
 *
 * The type exists so that mapping is carried by the domain rather than
 * re-derived downstream from the wording of a message. A new state guard gets
 * its status by extending this class; one that forgets is not silently answered
 * as bad input, because the domain tests assert the type directly.
 */
export class ConflictoDeEstado extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictoDeEstado";
  }
}
