import { DomainError } from "../../shared/domain/DomainError";

/**
 * The single message every failed login answers with.
 *
 * "Wrong password", "no such user" and "that account is disabled" are three
 * different facts, and telling them apart is exactly what lets an attacker
 * turn a list of surnames into a list of real accounts before trying a single
 * password. The office knows why someone cannot get in; the login form does
 * not have to.
 */
export const MENSAJE_CREDENCIALES_INVALIDAS =
  "Usuario o contraseña incorrectos.";

/**
 * Raised when a login attempt fails, for any reason.
 *
 * Maps to HTTP 401 in the global exception filter — never 400, never 403, and
 * never with a reason attached.
 */
export class CredencialesInvalidas extends DomainError {
  constructor(message: string = MENSAJE_CREDENCIALES_INVALIDAS) {
    super(message);
    this.name = "CredencialesInvalidas";
  }
}

/**
 * Raised when a refresh or logout is presented with a token that is unknown,
 * expired, already revoked, or belongs to an account that can no longer
 * authenticate.
 *
 * Deliberately one error for all of those: the client's only useful reaction
 * is the same in every case — send the technician back to the login screen.
 */
export class SesionInvalida extends DomainError {
  constructor(
    message = "La sesión expiró o fue cerrada. Inicie sesión nuevamente.",
  ) {
    super(message);
    this.name = "SesionInvalida";
  }
}
