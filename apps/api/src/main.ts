/**
 * Server entry point.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * How this runs, and why — read this before changing the scripts.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This package is ESM (`"type": "module"`), the source has extensionless
 * relative imports (`moduleResolution: "Bundler"`), `tsconfig.json` is
 * `noEmit`, and Prisma 7's `prisma-client` generator emits **TypeScript**
 * source into `generated/prisma`, outside `src`. NestJS on top of that needs
 * legacy decorators and `design:*` reflection metadata. Node 26 no longer
 * ships `--experimental-transform-types`, so the runtime cannot do it alone.
 *
 * The combination rules out the obvious options:
 *
 *   - Plain `tsc` to `dist/` emits ESM whose relative imports have no `.js`
 *     extension, so Node cannot resolve them at runtime. It type-checks and
 *     then fails on the first import.
 *   - esbuild (and therefore `tsx`) does not implement `emitDecoratorMetadata`
 *     at all — it needs the type checker. Nest's DI-by-type would silently
 *     break, and every provider would have to carry `@Inject()` forever.
 *   - SWC does implement it, but its `module.resolveFully` does not rewrite
 *     extensions for plain ESM output in the current version, so the build
 *     lands back on the same unresolvable imports.
 *
 * **The choice: run TypeScript directly through `jiti`.** It is already a
 * dependency and already how `prisma/seed.ts` runs, it resolves extensionless
 * specifiers and the generated TS client the same way the bundler-style
 * `tsconfig` says to, and it emits full decorator metadata — verified: Nest
 * resolves providers by constructor type under it.
 *
 * So the split is: **`tsc --noEmit` is the type gate, `jiti` is the runtime.**
 * There is no `dist/`. `pnpm start` runs this file; production runs the same
 * command under systemd, with jiti's on-disk transform cache warm after the
 * first boot.
 *
 * One convention follows from it, and it is load-bearing: **every injection
 * point in this codebase uses an explicit `@Inject(TOKEN)` or a `useFactory`.**
 * The test runner transpiles with esbuild, which emits no metadata; writing
 * the wiring explicitly means the container behaves identically in tests and
 * in production instead of diverging exactly where it is hardest to notice.
 */
import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import {
  cargarConfiguracion,
  CONFIGURACION,
  describirConfiguracion,
  ErrorDeConfiguracion,
  type Configuracion,
} from "./config/configuracion";
import { configurarHttp, LIMITE_CUERPO } from "./http/configuracionHttp";

async function arrancar(): Promise<void> {
  const logger = new Logger("Arranque");

  // Pre-flight. `ConfiguracionModule` validates the environment too, but it
  // does so inside the DI container, where NestJS wraps the failure in twenty
  // frames of injector stack trace — and the one thing an operator needs to
  // read at 2 a.m. is which variable is wrong. Validating here first means the
  // process dies with just that message. `cargarConfiguracion` is pure, so
  // running it twice costs nothing and cannot disagree with itself.
  cargarConfiguracion(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Errors are shaped by FiltroDeExcepciones; Nest's own default body would
    // bypass it for anything thrown before a controller is reached.
    bufferLogs: false,
    // Off here so `configurarHttp` can register the parsers with a body limit
    // sized for a signing request. Express's 100 kB default would reject two
    // signature PNGs — after the customer had already signed them.
    bodyParser: false,
  });

  const config = app.get<Configuracion>(CONFIGURACION);

  // Body limits, the global error filter and the body-parser error handler,
  // in the order they have to run. Shared with the integration tests, so the
  // server they exercise is the server that ships.
  configurarHttp(app);

  // Only when there really is an Nginx in front (DESIGN.md §10). With it on
  // and nothing proxying, any client can forge `X-Forwarded-For` and walk
  // straight through the login rate limit.
  if (config.confiarEnProxy) {
    app.set("trust proxy", 1);
  }

  /**
   * Graceful shutdown.
   *
   * `enableShutdownHooks` makes NestJS run every provider's
   * `onApplicationShutdown` on SIGTERM/SIGINT — which is how systemd stops
   * this process. `PrismaModule` already closes the connection pool that way.
   *
   * `ContratosModule` now registers `CierreDelGeneradorDeDocumentos` the same
   * way, so the headless Chromium that renders the PDFs is closed on SIGTERM
   * instead of leaking a browser process per restart on a 4 GB VPS. Nothing in
   * this file had to change for it, as predicted.
   */
  app.enableShutdownHooks();

  await app.listen(config.puerto);

  logger.log(
    `API de contratos escuchando — ${describirConfiguracion(config)} cuerpo=${LIMITE_CUERPO}`,
  );
}

arrancar().catch((error: unknown) => {
  // A bad environment must kill the process here, on the ground, and say
  // exactly which variable is wrong — not surface as a 500 in front of a
  // technician standing at a customer's house with a half-signed contract.
  if (error instanceof ErrorDeConfiguracion) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
