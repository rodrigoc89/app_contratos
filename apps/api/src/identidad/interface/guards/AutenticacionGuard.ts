import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  EMISOR_DE_TOKEN_DE_ACCESO,
  type EmisorDeTokenDeAcceso,
} from "../../application/ports/puertos";
import { CLAVE_PUBLICO } from "../decorators/Publico";
import {
  CLAVE_USUARIO_AUTENTICADO,
  type UsuarioAutenticado,
} from "../decorators/UsuarioActual";

const ESQUEMA_BEARER = /^bearer$/i;

/**
 * The global authentication guard: **everything is protected by default.**
 *
 * Registered as an `APP_GUARD` in `IdentidadModule`, so it runs before every
 * handler in the application, including ones written months from now by
 * someone who never read this file. A route opts out only by carrying
 * `@Publico()`. That default matters more here than the guard itself: a
 * contract endpoint added without thinking must answer 401, not hand a
 * customer's DNI to an anonymous caller.
 *
 * Its whole job is to turn a signature into an identity and park it on the
 * request. It never decides *what* that identity may do — that is `RolesGuard`
 * — and it never reads anything the client could have chosen.
 *
 * Every dependency is injected through an explicit token, including
 * `Reflector`. That is not decoration: it keeps DI working identically under
 * jiti (which emits decorator metadata) and under the test transpiler
 * (which does not), so the wiring a test exercises is the wiring that ships.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EMISOR_DE_TOKEN_DE_ACCESO)
    private readonly emisor: EmisorDeTokenDeAcceso,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublica =
      this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) === true;

    const token = this.tokenDeLaPeticion(contexto);

    if (token === null) {
      if (esPublica) {
        return true;
      }
      throw new UnauthorizedException(
        "Esta operación necesita una sesión iniciada.",
      );
    }

    let claims: UsuarioAutenticado;
    try {
      claims = await this.emisor.verificar(token);
    } catch {
      // A public route with a broken token is still a public route: the
      // health check must answer while a tablet is holding an expired token.
      if (esPublica) {
        return true;
      }
      // Deliberately generic. The issuer knows whether this was an expired
      // token, a bad signature or a foreign issuer; the client does not need
      // to, and telling it turns the endpoint into a token oracle.
      throw new UnauthorizedException(
        "La sesión expiró o no es válida. Inicie sesión nuevamente.",
      );
    }

    // Assigned, never merged: whatever the client put on the request under
    // this key is overwritten by what the signature actually proved.
    const peticion = contexto
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    peticion[CLAVE_USUARIO_AUTENTICADO] = {
      usuarioId: claims.usuarioId,
      rol: claims.rol,
    } satisfies UsuarioAutenticado;

    return true;
  }

  private tokenDeLaPeticion(contexto: ExecutionContext): string | null {
    const peticion = contexto.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const cabecera = peticion.headers?.["authorization"];
    if (typeof cabecera !== "string") {
      return null;
    }

    const [esquema, valor] = cabecera.split(" ");
    if (esquema === undefined || !ESQUEMA_BEARER.test(esquema)) {
      return null;
    }

    const token = (valor ?? "").trim();
    return token === "" ? null : token;
  }
}
