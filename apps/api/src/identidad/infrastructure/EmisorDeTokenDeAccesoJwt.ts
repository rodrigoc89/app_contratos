import { JwtService } from "@nestjs/jwt";

import type { ConfiguracionJwt } from "../../config/configuracion";
import { esRolUsuario } from "../domain/Usuario";
import type {
  ClaimsDeAcceso,
  EmisorDeTokenDeAcceso,
} from "../application/ports/puertos";

/**
 * Signs and verifies the short-lived access token.
 *
 * HS256 with a shared secret, because there is exactly one process issuing and
 * one process verifying (DESIGN.md §10: a single VPS). Asymmetric keys would
 * buy nothing here and add a key-distribution problem.
 *
 * The payload holds the user id and the role, and nothing else. A JWT payload
 * is base64, not encryption: a name or a DNI in there would be personal data
 * sitting in plain sight in a tablet's storage, and no guard needs it.
 *
 * Note what this class cannot do: **an issued access token cannot be revoked.**
 * It is verified by signature alone, so a stolen one works until it expires.
 * That is the entire reason `JWT_ACCESO_MINUTOS` is capped at an hour and
 * defaults to 15 minutes, and the reason revocation lives on the refresh token
 * instead.
 */
export class EmisorDeTokenDeAccesoJwt implements EmisorDeTokenDeAcceso {
  private readonly jwt: JwtService;
  private readonly segundosDeVida: number;

  constructor(private readonly config: ConfiguracionJwt) {
    this.segundosDeVida = config.minutosDeAcceso * 60;
    this.jwt = new JwtService({
      secret: config.secreto,
      signOptions: { algorithm: "HS256" },
      verifyOptions: { algorithms: ["HS256"] },
    });
  }

  async emitir(claims: ClaimsDeAcceso): Promise<string> {
    return await this.firmar(claims, this.segundosDeVida);
  }

  async verificar(token: string): Promise<ClaimsDeAcceso> {
    // `algorithms` is pinned above: without it, a token with `alg: none` or a
    // token signed with HS256 against a public key would be accepted.
    const carga = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
      secret: this.config.secreto,
      algorithms: ["HS256"],
    });

    const usuarioId = carga["sub"];
    const rol = carga["rol"];

    // The signature only proves the payload was not edited; it does not prove
    // it says anything sensible. A role that no longer exists — dropped in a
    // later version, or fabricated by whoever held an old secret — must not
    // reach `RolesGuard` and quietly match nothing.
    if (typeof usuarioId !== "string" || usuarioId === "" || !esRolUsuario(rol)) {
      throw new Error("El token de acceso no tiene los datos esperados.");
    }

    return { usuarioId, rol };
  }

  /**
   * Test-only seam for issuing an already-expired token. Exposed here rather
   * than faked with timers because "does verification actually reject an
   * expired token?" is a property of the JWT library, and stubbing the clock
   * would test the stub.
   */
  async emitirParaPruebas(
    claims: ClaimsDeAcceso,
    segundosDeVida: number,
  ): Promise<string> {
    return await this.firmar(claims, segundosDeVida);
  }

  private async firmar(
    claims: ClaimsDeAcceso,
    segundosDeVida: number,
  ): Promise<string> {
    const emitidoEn = Math.floor(Date.now() / 1000);

    return await this.jwt.signAsync(
      {
        sub: claims.usuarioId,
        rol: claims.rol,
        iat: emitidoEn,
        exp: emitidoEn + segundosDeVida,
      },
      { secret: this.config.secreto },
    );
  }
}
