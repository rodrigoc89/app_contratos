import { Module } from "@nestjs/common";

import { ConfiguracionModule } from "./config/ConfiguracionModule";
import { ContratosModule } from "./contratos/ContratosModule";
import { SaludModule } from "./http/SaludController";
import { IdentidadModule } from "./identidad/IdentidadModule";
import { PrismaModule } from "./persistencia/PrismaModule";

/**
 * The application root.
 *
 * Deliberately thin: it names the modules and nothing else. `ConfiguracionModule`
 * and `PrismaModule` are `@Global()`, so they are listed here once and are
 * available everywhere without being threaded through every feature module.
 *
 * `ContratosModule` is the contract-signing feature, and it arrived exactly as
 * this file predicted: one more import and nothing else. It gets
 * authentication for free, because `IdentidadModule` registers the auth guard
 * globally — its endpoints were protected the moment they existed, without
 * importing anything.
 */
@Module({
  imports: [
    ConfiguracionModule,
    PrismaModule,
    IdentidadModule,
    ContratosModule,
    SaludModule,
  ],
})
export class AppModule {}
