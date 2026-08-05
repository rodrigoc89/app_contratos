import { randomUUID } from "node:crypto";

import { Catch, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";

import { respuestaDeError } from "./respuestaDeError";

interface RespuestaHttp {
  status(codigo: number): RespuestaHttp;
  json(cuerpo: unknown): unknown;
}

interface PeticionHttp {
  method?: string;
  url?: string;
}

/**
 * The last thing that runs before anything reaches a client.
 *
 * Registered globally in `main.ts`, catching everything — including whatever a
 * future contract controller throws. The mapping itself lives in
 * `respuestaDeError`, a pure function with its own tests; this class is only
 * the plumbing plus the one thing that genuinely needs a side effect:
 * **unexpected errors are logged here in full, and answered generically.**
 *
 * The correlation id is what joins the two halves. The client is told
 * "quote reference X"; the server log holds reference X next to the actual
 * stack trace. An operator can then answer a phone call without the error body
 * ever having contained a connection string, a file path or a customer's DNI.
 */
@Catch()
export class FiltroDeExcepciones implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const referencia = randomUUID();
    const { estado, cuerpo, esInesperado } = respuestaDeError(
      excepcion,
      referencia,
    );

    const http = host.switchToHttp();
    const peticion = http.getRequest<PeticionHttp>();

    if (esInesperado) {
      // Everything, server-side: this is the only copy of what went wrong.
      // The request method and path are logged; the body never is, because it
      // is exactly where the DNI, the address and the WhatsApp number live.
      this.logger.error(
        `${peticion.method ?? "?"} ${peticion.url ?? "?"} falló — referencia ${referencia}`,
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    } else if (estado >= 500) {
      this.logger.error(
        `${peticion.method ?? "?"} ${peticion.url ?? "?"} → ${estado} — referencia ${referencia}`,
      );
    }

    http.getResponse<RespuestaHttp>().status(estado).json(cuerpo);
  }
}
