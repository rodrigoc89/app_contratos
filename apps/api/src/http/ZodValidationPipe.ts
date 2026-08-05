import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodType } from "zod";

import type { CuerpoDeError } from "./respuestaDeError";

/**
 * Validates a request payload against a Zod schema.
 *
 *     @Post()
 *     crear(@Body(new ZodValidationPipe(EsquemaBorrador)) datos: DatosBorrador) { … }
 *
 * Zod rather than `class-validator` because DESIGN.md §5.1 commits to sharing
 * one schema definition between the React client and this server: DNI format,
 * MAC format and required fields get exactly one definition, so client and
 * server agree by construction. A contract rejected by the server *after* the
 * customer has already signed is the worst failure this system has, and it is
 * precisely what two drifting copies of the same rules produce.
 *
 * The pipe is deliberately empty of domain knowledge — it takes whatever
 * schema it is handed, including non-object ones.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown, metadatos?: ArgumentMetadata): T {
    const resultado = this.esquema.safeParse(valor);

    if (resultado.success) {
      return resultado.data;
    }

    // A scalar schema — a path parameter, a query string — produces issues
    // with an empty `path`, because there is no field inside it to point at.
    // NestJS knows the name it was asked to validate and passes it in
    // `metadatos.data`, so a rejected `:tipo` says "tipo" rather than
    // "(cuerpo)", which a caller with several parameters cannot act on.
    const sinRuta = metadatos?.data ?? "(cuerpo)";

    const campos: Record<string, string> = {};
    for (const issue of resultado.error.issues) {
      const campo = issue.path.join(".") || sinRuta;
      // First message per field: a form shows one line under one input.
      campos[campo] ??= issue.message;
    }

    // The body is echoed nowhere. Ley 25.326 makes the DNI, the WhatsApp
    // number and the address personal data, and a 400 travels to the access
    // log and to whatever error tracker is installed later. The field name is
    // enough to fix the form; the value never leaves the request.
    const cuerpo: CuerpoDeError = {
      error: {
        mensaje: "Revise los datos cargados: hay campos incompletos o inválidos.",
        codigo: "validacion",
        campos,
      },
    };

    throw new BadRequestException(cuerpo);
  }
}
