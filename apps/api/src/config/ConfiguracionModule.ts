import { Global, Module } from "@nestjs/common";

import { cargarConfiguracion, CONFIGURACION } from "./configuracion";

/**
 * Makes the validated configuration injectable everywhere.
 *
 * `cargarConfiguracion` runs once, here, at module construction — which is
 * before the HTTP server is created. A bad environment therefore takes the
 * process down during boot, with a message naming every offending variable,
 * instead of surfacing as a 500 the first time someone tries to log in.
 *
 * `process.env` is read in exactly this one place in the whole application.
 * Nothing loads a `.env` file: that is the operator's job (systemd's
 * `EnvironmentFile=`, or the dev script). See `.env.example`.
 */
@Global()
@Module({
  providers: [
    {
      provide: CONFIGURACION,
      useFactory: () => cargarConfiguracion(process.env),
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
