import { randomUUID } from "node:crypto";

import { Logger } from "@nestjs/common";

import type {
  IdentificadorUnico,
  RegistroDeSeguridad,
  Reloj,
} from "../application/ports/puertos";

/**
 * The three small adapters the identity use cases need from the platform:
 * the clock, unique ids, and the audit log.
 *
 * They live together because each is a handful of lines and none of them has
 * any behaviour worth a file of its own — what matters is that the use cases
 * see interfaces, so a unit test can freeze time and read back what was
 * logged.
 */

export class RelojDelSistemaIdentidad implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

export class IdentificadoresUuid implements IdentificadorUnico {
  nuevo(): string {
    return randomUUID();
  }
}

/**
 * The security audit trail, on top of the NestJS logger.
 *
 * **Nothing that reaches this class may be a secret.** The use cases pass
 * user ids, family ids, counts and reason codes — never a token, never a
 * digest, never a password. An audit log is copied into chat during an
 * incident more often than any other file on the server.
 */
export class RegistroDeSeguridadNest implements RegistroDeSeguridad {
  private readonly logger = new Logger("Seguridad");

  advertir(mensaje: string, datos?: Record<string, string | number>): void {
    this.logger.warn(`${mensaje}${formatear(datos)}`);
  }

  informar(mensaje: string, datos?: Record<string, string | number>): void {
    this.logger.log(`${mensaje}${formatear(datos)}`);
  }
}

function formatear(datos: Record<string, string | number> | undefined): string {
  if (datos === undefined) {
    return "";
  }

  const partes = Object.entries(datos).map(([clave, valor]) => `${clave}=${valor}`);
  return partes.length === 0 ? "" : ` [${partes.join(" ")}]`;
}
