import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
} from "@nestjs/common";
import { ZodValidationPipe } from "../../http/ZodValidationPipe";
import type { CerrarSesion } from "../application/CerrarSesion";
import type { IniciarSesion } from "../application/IniciarSesion";
import type { RefrescarSesion } from "../application/RefrescarSesion";
import type { SesionEmitida } from "../application/ports/puertos";
import {
  CERRAR_SESION,
  INICIAR_SESION,
  REFRESCAR_SESION,
} from "../IdentidadModule.tokens";
import { LimiteEstricto } from "./decorators/LimiteEstricto";
import { Publico } from "./decorators/Publico";
import { UsuarioActual } from "./decorators/UsuarioActual";
import type { UsuarioAutenticado } from "./decorators/UsuarioActual";
import {
  EsquemaLogin,
  EsquemaTokenDeRefresco,
  type DatosLogin,
  type DatosTokenDeRefresco,
} from "./dto/esquemasDeAuth";

/**
 * The three endpoints a tablet needs, plus one for reading back who you are.
 *
 * Login and refresh are `@Publico()` — they are how a session is obtained, so
 * requiring one would be circular. Everything else in the application is
 * protected by default by the global `AutenticacionGuard`; these two are the
 * deliberate exceptions.
 *
 * Login and refresh are also the only endpoints in the system that are rate
 * limited beyond the global default. Four roles and a handful of employees
 * means a very small username space, which makes credential stuffing against
 * this login a realistic attack rather than a theoretical one.
 */
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(INICIAR_SESION) private readonly iniciarSesion: IniciarSesion,
    @Inject(REFRESCAR_SESION) private readonly refrescarSesion: RefrescarSesion,
    @Inject(CERRAR_SESION) private readonly cerrarSesion: CerrarSesion,
  ) {}

  @Publico()
  @LimiteEstricto()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(EsquemaLogin)) datos: DatosLogin,
  ): Promise<SesionEmitida> {
    return await this.iniciarSesion.ejecutar(datos);
  }

  @Publico()
  @LimiteEstricto()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(EsquemaTokenDeRefresco))
    datos: DatosTokenDeRefresco,
  ): Promise<SesionEmitida> {
    return await this.refrescarSesion.ejecutar(datos);
  }

  /**
   * Revokes the token family the presented token belongs to.
   *
   * Public, and deliberately so: a tablet whose access token has already
   * expired must still be able to sign out cleanly, and the refresh token in
   * the body is itself the proof of who is asking. It answers 204 whether or
   * not the token was known — see `CerrarSesion` for why.
   */
  @Publico()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(EsquemaTokenDeRefresco))
    datos: DatosTokenDeRefresco,
  ): Promise<void> {
    await this.cerrarSesion.ejecutar(datos);
  }

  /**
   * Who the caller is, according to the token they presented.
   *
   * Protected by the global guard, so reaching this handler already proves a
   * valid session. It doubles as the smallest possible example of
   * `@UsuarioActual()` for the controllers that come next — this is where a
   * contract endpoint gets the `tecnicoId` it puts into `ContextoDeFirma`.
   */
  @Get("yo")
  async yo(@UsuarioActual() usuario: UsuarioAutenticado): Promise<UsuarioAutenticado> {
    return usuario;
  }
}
