import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";

import type { PrismaClient } from "../../generated/prisma/client";
import { Publico } from "../identidad/interface/decorators/Publico";
import { PRISMA } from "../persistencia/PrismaModule";

export interface EstadoDeSalud {
  readonly estado: "ok" | "degradado";
  readonly baseDeDatos: "ok" | "sin-conexion";
  readonly activoDesdeSegundos: number;
}

/**
 * Liveness plus a real database round-trip.
 *
 * The round-trip is the point. A process that is up but cannot reach Postgres
 * is useless to a technician standing at a customer's house, and a health
 * check that only proves the event loop is turning would keep such a process
 * in the load balancer. So this endpoint actually asks the database a
 * question.
 *
 * `@Publico()` because a monitor has no session, and by design there is no way
 * to reach any endpoint without one otherwise.
 */
@Controller("salud")
export class SaludController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Publico()
  @Get()
  @HttpCode(200)
  async consultar(): Promise<EstadoDeSalud> {
    const activoDesdeSegundos = Math.floor(process.uptime());

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503, not 500: this is a statement about availability, and it is what
      // a monitor or a reverse proxy is looking for. The reason is logged by
      // the Prisma client itself; it is not echoed, because a connection
      // error message carries the host and often the user of the database.
      throw new ServiceUnavailableException({
        error: {
          mensaje: "El servicio no puede conectarse a la base de datos.",
          codigo: "sin_base_de_datos",
        },
        estado: "degradado",
        baseDeDatos: "sin-conexion",
        activoDesdeSegundos,
      });
    }

    return { estado: "ok", baseDeDatos: "ok", activoDesdeSegundos };
  }
}

@Module({ controllers: [SaludController] })
export class SaludModule {}
