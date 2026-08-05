import { Global, Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";

import { CONFIGURACION, type Configuracion } from "../config/configuracion";
import type { PrismaClient } from "../../generated/prisma/client";
import { crearPrismaClient } from "../shared/infrastructure/persistence/prismaClient";

/** Injection token for the shared `PrismaClient`. */
export const PRISMA = Symbol("PRISMA");

/**
 * Closes the pool when the process is shutting down.
 *
 * A separate provider rather than a lifecycle hook on the client itself,
 * because `PrismaClient` is created by a plain factory (`crearPrismaClient`)
 * that predates NestJS and has no business knowing about it.
 */
@Injectable()
class CierreDePrisma implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * One `PrismaClient` for the whole process, built from the validated
 * configuration.
 *
 * Global because every feature module needs it and threading a `PrismaModule`
 * import through each of them would be ceremony. The connection string comes
 * from `Configuracion`, never from `process.env` read at the point of use — so
 * a missing `DATABASE_URL` is caught by the config validator at boot rather
 * than by the first query.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [CONFIGURACION],
      useFactory: (config: Configuracion): PrismaClient =>
        crearPrismaClient(config.urlBaseDeDatos),
    },
    CierreDePrisma,
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
