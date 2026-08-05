import { SesionInvalida } from "../domain/ErroresDeIdentidad";
import { TokenDeRefresco } from "../domain/TokenDeRefresco";
import type { MotivoDeRevocacion } from "../domain/TokenDeRefresco";
import type { Usuario } from "../domain/Usuario";
import { diasEnMs, sesionEmitida } from "./IniciarSesion";
import type { DependenciasDeSesion, SesionEmitida } from "./ports/puertos";

export interface EntradaRefrescarSesion {
  readonly tokenDeRefresco: string;
}

/**
 * Trades a refresh token for a fresh pair, and burns the one it consumed.
 *
 * **Rotation.** Every successful refresh issues a new token and revokes the
 * one presented, inside the same family. A refresh token is therefore usable
 * exactly once.
 *
 * **Reuse detection.** That single-use property is what makes theft
 * detectable. The legitimate tablet always moves on to the successor, so it
 * can never present a burnt token again. If a burnt token does come back, two
 * copies of it exist — and nothing in the request distinguishes the thief from
 * the technician. So the entire family is revoked and the incident is logged:
 * the technician logs in again with their password, which the thief does not
 * have.
 *
 * **Deactivation.** The user is re-read from the repository on every refresh
 * rather than trusted from the token. That is what makes "deactivate this
 * technician from the office" take effect within one access-token lifetime on
 * a tablet that is already in the field.
 */
export class RefrescarSesion {
  constructor(private readonly deps: DependenciasDeSesion) {}

  async ejecutar(entrada: EntradaRefrescarSesion): Promise<SesionEmitida> {
    const ahora = this.deps.reloj.ahora();
    const hash = this.deps.generador.hashDe(entrada.tokenDeRefresco ?? "");
    const token = await this.deps.tokens.buscarPorHash(hash);

    if (token === null) {
      this.deps.registro.advertir(
        "Refresco rechazado: el token no figura en la base",
      );
      throw new SesionInvalida();
    }

    if (token.estaRevocado) {
      await this.rechazarTokenMuerto(token, ahora);
    }

    if (token.estaVencidoEn(ahora)) {
      await this.cerrarFamilia(token, "cierre_de_sesion", ahora, {
        mensaje: "Refresco rechazado: el token venció",
      });
      throw new SesionInvalida();
    }

    const usuario = await this.deps.usuarios.buscarPorId(token.usuarioId);

    if (usuario === null || !usuario.puedeAutenticarse) {
      await this.cerrarFamilia(token, "usuario_inactivo", ahora, {
        mensaje:
          "Refresco rechazado: el usuario ya no puede autenticarse; se revoca la familia",
        usuarioId: token.usuarioId,
      });
      throw new SesionInvalida();
    }

    return await this.rotar(token, usuario, ahora);
  }

  /**
   * A token that is already revoked came back. Always rejected — but *why* it
   * was revoked decides what the log should say, and that distinction is the
   * difference between an alert worth acting on and noise.
   *
   * `rotacion` is the theft signal. A rotated token was burnt by a successful
   * refresh, which means the legitimate device already holds its successor and
   * has no way to present this one again. Two copies exist, and nothing in the
   * request says which holder is the thief, so the family goes.
   *
   * Every other reason is an ordinary dead session: the technician signed out,
   * the account was deactivated, or an earlier reuse already killed the family.
   * Calling those "theft" would train whoever reads these logs to ignore the
   * word by the time it matters.
   */
  private async rechazarTokenMuerto(
    token: TokenDeRefresco,
    ahora: Date,
  ): Promise<never> {
    const motivoPrevio = token.motivoDeRevocacion ?? "desconocido";
    const sospechaDeRobo = motivoPrevio === "rotacion";

    // Revoked either way. On a rotation this is what closes the family; on the
    // other reasons the family is already down and this returns zero.
    const revocados = await this.deps.tokens.revocarFamilia(
      token.familiaId,
      "reuso_detectado",
      ahora,
    );

    this.deps.registro.advertir(
      sospechaDeRobo
        ? "Se reutilizó un token de refresco ya rotado: se presume robo y se revoca toda la familia"
        : "Se presentó un token de refresco que ya estaba revocado; la sesión sigue cerrada",
      {
        usuarioId: token.usuarioId,
        familia: token.familiaId,
        motivoPrevio,
        tokensRevocados: revocados,
      },
    );

    throw new SesionInvalida();
  }

  private async cerrarFamilia(
    token: TokenDeRefresco,
    motivo: MotivoDeRevocacion,
    ahora: Date,
    registro: { mensaje: string; usuarioId?: string },
  ): Promise<void> {
    const revocados = await this.deps.tokens.revocarFamilia(
      token.familiaId,
      motivo,
      ahora,
    );

    this.deps.registro.advertir(registro.mensaje, {
      usuarioId: registro.usuarioId ?? token.usuarioId,
      familia: token.familiaId,
      tokensRevocados: revocados,
    });
  }

  private async rotar(
    token: TokenDeRefresco,
    usuario: Usuario,
    ahora: Date,
  ): Promise<SesionEmitida> {
    const generado = this.deps.generador.generar();

    const sucesor = TokenDeRefresco.emitir({
      id: this.deps.ids.nuevo(),
      usuarioId: usuario.id,
      // Same family: the chain must stay revocable as one unit.
      familiaId: token.familiaId,
      hash: generado.hash,
      emitidoEn: ahora,
      expiraEn: new Date(
        ahora.getTime() + diasEnMs(this.deps.vida.diasDeRefresco),
      ),
    });

    // Successor first. If the process dies between the two writes, the worst
    // outcome is an unused extra row; doing it the other way round would leave
    // the technician holding a token that was burnt without a replacement.
    await this.deps.tokens.guardar(sucesor);

    token.rotarPor(sucesor.id, ahora);
    await this.deps.tokens.guardar(token);

    const tokenDeAcceso = await this.deps.emisor.emitir({
      usuarioId: usuario.id,
      rol: usuario.rol,
    });

    return sesionEmitida({
      tokenDeAcceso,
      minutosDeAcceso: this.deps.vida.minutosDeAcceso,
      tokenDeRefresco: generado.valor,
      diasDeRefresco: this.deps.vida.diasDeRefresco,
      usuario: usuario.resumenPublico(),
    });
  }
}
