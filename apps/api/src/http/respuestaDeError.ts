import { HttpException, HttpStatus } from "@nestjs/common";
import type { CodigoDeError, CuerpoDeError } from "@contratos/esquemas";

import {
  CredencialesInvalidas,
  SesionInvalida,
} from "../identidad/domain/ErroresDeIdentidad";
import { ConflictoDeConcurrencia } from "../shared/domain/ConflictoDeConcurrencia";
import { ConflictoDeEstado } from "../shared/domain/ConflictoDeEstado";
import { DomainError } from "../shared/domain/DomainError";
import { EstadoAlmacenadoInconsistente } from "../shared/domain/EstadoAlmacenadoInconsistente";
import { RecursoNoEncontrado } from "../shared/domain/RecursoNoEncontrado";

/**
 * `CodigoDeError` and `CuerpoDeError` moved into `@contratos/esquemas`
 * (DESIGN.md D7), so the client can switch on the same codes instead of a
 * hand-copied union. Re-exported here, **unchanged**, because
 * `configuracionHttp.ts` and `ZodValidationPipe.ts` both do
 * `import type { CuerpoDeError } from "./respuestaDeError"` — dropping this
 * re-export turns a two-file move into a four-file one for no benefit. Do
 * not remove it without updating both of those imports first.
 */
export type { CodigoDeError, CuerpoDeError };

/**
 * Statuses a client has to branch on, given a code of their own so the React
 * side reads a name instead of re-deriving meaning from a number: 401 sends
 * the technician back to the login screen, 403 hides a button, 429 means wait.
 */
const CODIGO_POR_ESTADO: Readonly<Record<number, CodigoDeError>> = {
  [HttpStatus.UNAUTHORIZED]: "no_autenticado",
  [HttpStatus.FORBIDDEN]: "sin_permiso",
  [HttpStatus.NOT_FOUND]: "no_encontrado",
  [HttpStatus.TOO_MANY_REQUESTS]: "demasiadas_peticiones",
};

/**
 * `@nestjs/throttler` raises "ThrottlerException: Too Many Requests", and the
 * person who sees it is a technician on a tablet. Replaced rather than
 * translated at the throttler, because a 429 can also come from elsewhere and
 * this is the one place that decides what a client is told.
 */
const MENSAJE_DEMASIADAS_PETICIONES =
  "Demasiados intentos seguidos. Espere un minuto y vuelva a intentar.";

export interface RespuestaDeError {
  readonly estado: number;
  readonly cuerpo: CuerpoDeError;
  /**
   * True when the cause was not something the client did — the filter logs
   * these with the full exception and the correlation id.
   */
  readonly esInesperado: boolean;
}

const MENSAJE_GENERICO =
  "Ocurrió un error inesperado en el servidor. Vuelva a intentar; si sigue pasando, informe a la oficina la referencia";

/**
 * Turns any thrown value into the response the client will actually see.
 *
 * A pure function, separate from the filter, so the mapping is unit-testable
 * without an HTTP server — and so the rules below are visible in one place
 * rather than spread through a `catch`.
 *
 * The invariant it exists to hold: **nothing about the inside of this server,
 * and nothing personal about a customer, leaves through an error body.** The
 * domain already keeps DNI, phone numbers and GPS coordinates out of its
 * messages under Ley 25.326 (see `ContextoDeFirma.validarGeo`); this function
 * must not undo that by attaching a stack trace, a connection string or an
 * echo of the request.
 */
export function respuestaDeError(
  excepcion: unknown,
  referencia: string,
): RespuestaDeError {
  // First, because it is a `DomainError` whose message must never be shown:
  // it names a stored id and a broken invariant, and it means our data or our
  // code is wrong, not the caller's request. It gets the generic 500 treatment
  // — including being logged in full by `FiltroDeExcepciones`.
  if (excepcion instanceof EstadoAlmacenadoInconsistente) {
    return interno(referencia);
  }

  if (excepcion instanceof CredencialesInvalidas) {
    return cliente(HttpStatus.UNAUTHORIZED, {
      mensaje: excepcion.message,
      codigo: "credenciales_invalidas",
    });
  }

  if (excepcion instanceof SesionInvalida) {
    return cliente(HttpStatus.UNAUTHORIZED, {
      mensaje: excepcion.message,
      codigo: "sesion_invalida",
    });
  }

  if (excepcion instanceof HttpException) {
    return deHttpException(excepcion);
  }

  // Before `DomainError`, which it extends: the base-class branch below would
  // otherwise swallow every state conflict and answer 400. `codigo` stays
  // `conflicto_de_estado` because that string is the client-facing contract.
  if (excepcion instanceof ConflictoDeEstado) {
    return cliente(HttpStatus.CONFLICT, {
      mensaje: excepcion.message,
      codigo: "conflicto_de_estado",
    });
  }

  // Before `DomainError` for the same reason as the branch above, and next to
  // it because it answers the same status. It is a separate branch rather than
  // a shared one because the two 409s have to stay distinguishable: this one
  // is not "you asked for something impossible", it is "you and somebody else
  // asked at the same time". Same remedy for the technician, different fact
  // for whoever reads the logs afterwards.
  if (excepcion instanceof ConflictoDeConcurrencia) {
    return cliente(HttpStatus.CONFLICT, {
      mensaje: excepcion.message,
      codigo: "conflicto_de_concurrencia",
    });
  }

  // Also before `DomainError`, and for the same reason as the branch above:
  // the base-class branch would answer 400 for something no correction to the
  // request can fix.
  if (excepcion instanceof RecursoNoEncontrado) {
    return cliente(HttpStatus.NOT_FOUND, {
      mensaje: excepcion.message,
      codigo: "no_encontrado",
    });
  }

  if (excepcion instanceof DomainError) {
    // The domain's own message is passed through verbatim, on purpose: these
    // are written for the technician standing next to the customer and they
    // are the most useful thing this API can say.
    return cliente(HttpStatus.BAD_REQUEST, {
      mensaje: excepcion.message,
      codigo: "regla_de_negocio",
    });
  }

  return interno(referencia);
}

function cliente(
  estado: number,
  error: CuerpoDeError["error"],
): RespuestaDeError {
  return { estado, cuerpo: { error }, esInesperado: false };
}

/**
 * The one answer that describes nothing: a status, a generic sentence and a
 * correlation id the caller can quote. `esInesperado` is what makes the filter
 * log the real exception next to that same id.
 */
function interno(referencia: string): RespuestaDeError {
  return {
    estado: HttpStatus.INTERNAL_SERVER_ERROR,
    cuerpo: {
      error: {
        mensaje: `${MENSAJE_GENERICO} ${referencia}.`,
        codigo: "error_interno",
        referencia,
      },
    },
    esInesperado: true,
  };
}

/**
 * `HttpException`s are raised by our own code (the guards, the Zod pipe) and
 * by NestJS itself (404 on an unknown route, 429 from the throttler). Their
 * messages are already safe, so they pass through — but a body this codebase
 * already shaped is kept intact rather than rewrapped.
 */
function deHttpException(excepcion: HttpException): RespuestaDeError {
  const estado = excepcion.getStatus();
  const respuesta = excepcion.getResponse();

  if (esCuerpoDeError(respuesta)) {
    return { estado, cuerpo: respuesta, esInesperado: false };
  }

  if (estado === HttpStatus.TOO_MANY_REQUESTS) {
    return cliente(estado, {
      mensaje: MENSAJE_DEMASIADAS_PETICIONES,
      codigo: "demasiadas_peticiones",
    });
  }

  const mensaje =
    typeof respuesta === "string"
      ? respuesta
      : mensajeDeObjeto(respuesta) ?? excepcion.message;

  return cliente(estado, {
    mensaje,
    codigo: CODIGO_POR_ESTADO[estado] ?? "http",
  });
}

function esCuerpoDeError(valor: unknown): valor is CuerpoDeError {
  if (typeof valor !== "object" || valor === null || !("error" in valor)) {
    return false;
  }

  const error = valor.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "mensaje" in error &&
    "codigo" in error
  );
}

function mensajeDeObjeto(respuesta: unknown): string | null {
  if (typeof respuesta !== "object" || respuesta === null) {
    return null;
  }

  const mensaje = (respuesta as { message?: unknown }).message;

  if (typeof mensaje === "string") {
    return mensaje;
  }
  if (Array.isArray(mensaje)) {
    return mensaje.filter((una) => typeof una === "string").join(" ");
  }

  return null;
}
