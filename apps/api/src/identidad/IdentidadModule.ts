import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { CONFIGURACION, type Configuracion } from "../config/configuracion";
import type { PrismaClient } from "../../generated/prisma/client";
import { PRISMA } from "../persistencia/PrismaModule";
import { CerrarSesion } from "./application/CerrarSesion";
import { IniciarSesion } from "./application/IniciarSesion";
import {
  DEPENDENCIAS_DE_SESION,
  EMISOR_DE_TOKEN_DE_ACCESO,
  GENERADOR_DE_TOKEN_DE_REFRESCO,
  HASH_DE_CONTRASENA,
  IDENTIFICADOR_UNICO,
  REGISTRO_DE_SEGURIDAD,
  RELOJ_IDENTIDAD,
  TOKEN_DE_REFRESCO_REPOSITORY,
  USUARIO_REPOSITORY,
  type DependenciasDeSesion,
  type EmisorDeTokenDeAcceso,
  type GeneradorDeTokenDeRefresco,
  type HashDeContrasena,
  type IdentificadorUnico,
  type RegistroDeSeguridad,
  type Reloj,
  type TokenDeRefrescoRepository,
  type UsuarioRepository,
} from "./application/ports/puertos";
import { RefrescarSesion } from "./application/RefrescarSesion";
import {
  IdentificadoresUuid,
  RegistroDeSeguridadNest,
  RelojDelSistemaIdentidad,
} from "./infrastructure/adaptadoresDelSistema";
import { EmisorDeTokenDeAccesoJwt } from "./infrastructure/EmisorDeTokenDeAccesoJwt";
import { GeneradorDeTokenDeRefrescoCrypto } from "./infrastructure/GeneradorDeTokenDeRefrescoCrypto";
import { HashDeContrasenaArgon2 } from "./infrastructure/HashDeContrasenaArgon2";
import { PrismaTokenDeRefrescoRepository } from "./infrastructure/PrismaTokenDeRefrescoRepository";
import { PrismaUsuarioRepository } from "./infrastructure/PrismaUsuarioRepository";
import {
  CERRAR_SESION,
  INICIAR_SESION,
  LIMITE_DE_LOGIN,
  REFRESCAR_SESION,
} from "./IdentidadModule.tokens";
import { AuthController } from "./interface/AuthController";
import { noEsRutaDeLimiteEstricto } from "./interface/decorators/LimiteEstricto";
import { AutenticacionGuard } from "./interface/guards/AutenticacionGuard";
import { RolesGuard } from "./interface/guards/RolesGuard";

const UN_MINUTO_MS = 60_000;

/**
 * A generous ceiling for everything that is not a login.
 *
 * It exists as a backstop, not as a policy: signing a contract is a handful of
 * requests and the office panel is low-traffic, so nothing legitimate comes
 * near this. The number that actually matters is `LIMITE_DE_LOGIN`, sized from
 * configuration.
 */
const LIMITE_GENERAL_POR_MINUTO = 120;

/**
 * Identity: users, roles, authentication (DESIGN.md §5, §9).
 *
 * Two things here are worth reading before adding anything to this
 * application:
 *
 * **Default deny.** `AutenticacionGuard` is registered as an `APP_GUARD`, so
 * it runs before *every* handler in the process, including ones added by
 * future modules that never import this one. A contract endpoint written
 * without a thought about auth answers 401. Opting out takes the explicit
 * `@Publico()` decorator, which today appears exactly three times.
 *
 * **Guard order.** `APP_GUARD` providers run in declaration order, and the
 * order below is the intended one: throttle first (cheapest, and it has to
 * apply to unauthenticated requests, which is the whole point), then
 * authenticate, then check roles. `RolesGuard` is written to assume the
 * identity is already on the request.
 *
 * Every provider is registered against an explicit token. Ports are
 * interfaces, which have no runtime value, so half of them would need tokens
 * regardless — making it universal means DI behaves identically under jiti
 * (which emits decorator metadata) and under the test transpiler (which does
 * not), so what a test wires is what ships.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [CONFIGURACION],
      useFactory: (config: Configuracion) => ({
        throttlers: [
          { name: "general", ttl: UN_MINUTO_MS, limit: LIMITE_GENERAL_POR_MINUTO },
          {
            name: LIMITE_DE_LOGIN,
            ttl: UN_MINUTO_MS,
            limit: config.loginIntentosPorMinuto,
            // Named throttlers apply to every route in the process. Without
            // this the strict credential limit would cap the whole API — the
            // office panel's searches and PDF downloads included — at five
            // requests a minute. It applies only where `@LimiteEstricto()` says.
            skipIf: noEsRutaDeLimiteEstricto,
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // ---- guards, in the order they run ----------------------------------
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    // ---- adapters --------------------------------------------------------
    {
      provide: USUARIO_REPOSITORY,
      inject: [PRISMA],
      useFactory: (prisma: PrismaClient): UsuarioRepository =>
        new PrismaUsuarioRepository(prisma),
    },
    {
      provide: TOKEN_DE_REFRESCO_REPOSITORY,
      inject: [PRISMA],
      useFactory: (prisma: PrismaClient): TokenDeRefrescoRepository =>
        new PrismaTokenDeRefrescoRepository(prisma),
    },
    {
      provide: HASH_DE_CONTRASENA,
      useFactory: (): HashDeContrasena => new HashDeContrasenaArgon2(),
    },
    {
      provide: EMISOR_DE_TOKEN_DE_ACCESO,
      inject: [CONFIGURACION],
      useFactory: (config: Configuracion): EmisorDeTokenDeAcceso =>
        new EmisorDeTokenDeAccesoJwt(config.jwt),
    },
    {
      provide: GENERADOR_DE_TOKEN_DE_REFRESCO,
      useFactory: (): GeneradorDeTokenDeRefresco =>
        new GeneradorDeTokenDeRefrescoCrypto(),
    },
    {
      provide: RELOJ_IDENTIDAD,
      useFactory: (): Reloj => new RelojDelSistemaIdentidad(),
    },
    {
      provide: IDENTIFICADOR_UNICO,
      useFactory: (): IdentificadorUnico => new IdentificadoresUuid(),
    },
    {
      provide: REGISTRO_DE_SEGURIDAD,
      useFactory: (): RegistroDeSeguridad => new RegistroDeSeguridadNest(),
    },

    // ---- the bundle the three use cases share ----------------------------
    {
      provide: DEPENDENCIAS_DE_SESION,
      inject: [
        USUARIO_REPOSITORY,
        TOKEN_DE_REFRESCO_REPOSITORY,
        HASH_DE_CONTRASENA,
        EMISOR_DE_TOKEN_DE_ACCESO,
        GENERADOR_DE_TOKEN_DE_REFRESCO,
        RELOJ_IDENTIDAD,
        IDENTIFICADOR_UNICO,
        REGISTRO_DE_SEGURIDAD,
        CONFIGURACION,
      ],
      useFactory: (
        usuarios: UsuarioRepository,
        tokens: TokenDeRefrescoRepository,
        hasher: HashDeContrasena,
        emisor: EmisorDeTokenDeAcceso,
        generador: GeneradorDeTokenDeRefresco,
        reloj: Reloj,
        ids: IdentificadorUnico,
        registro: RegistroDeSeguridad,
        config: Configuracion,
      ): DependenciasDeSesion => ({
        usuarios,
        tokens,
        hasher,
        emisor,
        generador,
        reloj,
        ids,
        registro,
        vida: {
          minutosDeAcceso: config.jwt.minutosDeAcceso,
          diasDeRefresco: config.jwt.diasDeRefresco,
        },
      }),
    },

    // ---- use cases -------------------------------------------------------
    {
      provide: INICIAR_SESION,
      inject: [DEPENDENCIAS_DE_SESION],
      useFactory: (deps: DependenciasDeSesion) => new IniciarSesion(deps),
    },
    {
      provide: REFRESCAR_SESION,
      inject: [DEPENDENCIAS_DE_SESION],
      useFactory: (deps: DependenciasDeSesion) => new RefrescarSesion(deps),
    },
    {
      provide: CERRAR_SESION,
      inject: [DEPENDENCIAS_DE_SESION],
      useFactory: (deps: DependenciasDeSesion) => new CerrarSesion(deps),
    },
  ],
  /**
   * Exported for the contract module that comes next: it needs the repository
   * to resolve a technician, and the ports if it ever wants to mint anything.
   * The decorators (`@Publico`, `@Roles`, `@UsuarioActual`) need no export —
   * they are plain imports.
   */
  exports: [USUARIO_REPOSITORY, EMISOR_DE_TOKEN_DE_ACCESO],
})
export class IdentidadModule {}
