import { HttpStatus } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { FiltroDeExcepciones } from "./FiltroDeExcepciones";
import type { CuerpoDeError } from "./respuestaDeError";

/**
 * Everything an HTTP server of this application needs beyond its modules.
 *
 * It lives in a function rather than inline in `main.ts` so the integration
 * tests boot the *same* server the operator does. A body-size limit that only
 * exists in `main.ts` is a limit no test ever exercises, and this particular
 * one has a failure mode that must never be discovered in a customer's
 * kitchen.
 */

/**
 * The largest request body this API will read.
 *
 * Express's default is 100 kB, which a signing request blows straight past —
 * and the failure mode is the worst one this system has: the customer signs,
 * the request dies with 413, and the signature is gone. So the number is
 * chosen deliberately from what a signing actually weighs:
 *
 * | Part                                   | Realistic | Bounded by                    |
 * |----------------------------------------|-----------|-------------------------------|
 * | 2 signature PNGs, base64               | ~200 kB   | 400 kB each (`EsquemaFirma…`) |
 * | 2 stroke arrays, ~200 points each      | ~20 kB    | 60 × 4 000 points per firma   |
 * | Customer data, device id, geolocation  | < 1 kB    | field-level `max()`           |
 *
 * A realistic signing is a few hundred kilobytes; two very large canvases plus
 * a long, slow signature still land under a megabyte. **2 MB** leaves that
 * roughly a 3× margin and is still small enough not to be a memory attack:
 * the global throttler allows 120 requests a minute, so the worst case a
 * single client can force into memory is bounded and the box is a 4 GB VPS
 * (DESIGN.md §10) whose real memory consumer is Chromium, not this.
 *
 * Raising it further would buy nothing — the per-field caps in
 * `@contratos/esquemas` bite first — and lowering it would put the limit back
 * inside the range a real signature can reach.
 */
export const LIMITE_CUERPO = "2mb";

/** For the tests, which need the number rather than the express spelling. */
export const LIMITE_CUERPO_BYTES = 2 * 1024 * 1024;

const MENSAJE_DEMASIADO_GRANDE =
  "El envío es demasiado grande y el servidor no lo aceptó. Vuelva a capturar las firmas y reintente; si sigue pasando, avise a la oficina.";

const MENSAJE_CUERPO_INVALIDO =
  "El servidor no pudo leer los datos enviados. Reintente desde la aplicación.";

interface ErrorDeCuerpo {
  readonly type?: string;
  readonly status?: number;
  readonly statusCode?: number;
}

interface RespuestaExpress {
  headersSent: boolean;
  status(codigo: number): RespuestaExpress;
  type(tipo: string): RespuestaExpress;
  send(cuerpo: string): unknown;
}

/**
 * Turns a body-parser failure into this API's error body.
 *
 * It has to exist as express middleware rather than as a Nest exception
 * filter: the parsers run *before* Nest's router, so an oversized or
 * unparseable body never reaches a controller and never reaches
 * `FiltroDeExcepciones`. Without this, express's default error handler
 * answers — with an HTML page, and in development with a stack trace in it.
 * A tablet parsing that as JSON shows the technician nothing useful, and the
 * stack trace is exactly what `respuestaDeError` exists to prevent.
 *
 * Four parameters, because that is how express recognises an error handler.
 */
export function middlewareDeCuerpoInvalido(
  error: unknown,
  _peticion: unknown,
  respuesta: RespuestaExpress,
  siguiente: (error?: unknown) => void,
): void {
  const detalle = error as ErrorDeCuerpo | null;
  const estado = detalle?.status ?? detalle?.statusCode ?? 0;

  if (estado !== HttpStatus.PAYLOAD_TOO_LARGE && estado !== HttpStatus.BAD_REQUEST) {
    siguiente(error);
    return;
  }

  const esDemasiadoGrande = estado === HttpStatus.PAYLOAD_TOO_LARGE;

  const cuerpo: CuerpoDeError = {
    error: {
      mensaje: esDemasiadoGrande
        ? MENSAJE_DEMASIADO_GRANDE
        : MENSAJE_CUERPO_INVALIDO,
      codigo: esDemasiadoGrande ? "cuerpo_demasiado_grande" : "cuerpo_invalido",
    },
  };

  if (respuesta.headersSent) {
    siguiente(error);
    return;
  }

  // `type` + `send` rather than `json`, so the answer is identical whether or
  // not express's json serialiser was configured — and the payload that
  // failed is echoed nowhere, because it is where the DNI and the signature
  // were.
  respuesta
    .status(estado)
    .type("application/json")
    .send(JSON.stringify(cuerpo));
}

/**
 * Applies the body limits, the global error filter and the body-parser error
 * handler, in the order they have to run.
 *
 * The order is load-bearing: express walks *forward* from the layer that
 * failed, so `middlewareDeCuerpoInvalido` only ever sees a parser error if it
 * is registered after the parsers.
 */
export function configurarHttp(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: LIMITE_CUERPO });
  app.useBodyParser("urlencoded", { limit: LIMITE_CUERPO, extended: true });

  app.useGlobalFilters(new FiltroDeExcepciones());
  app.use(middlewareDeCuerpoInvalido);
}
