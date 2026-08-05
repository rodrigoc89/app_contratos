/**
 * Raised when an invariant of the business domain is violated.
 *
 * These messages are shown to the technician standing in front of the
 * customer, so they must say what is wrong and how to fix it — never leak
 * internal detail.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
