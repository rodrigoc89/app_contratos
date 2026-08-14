import { CredencialesInvalidas } from "../domain/ErroresDeIdentidad";
import { TokenDeRefresco } from "../domain/TokenDeRefresco";
import type { ResumenUsuario, Usuario } from "../domain/Usuario";
import type { DependenciasDeSesion, SesionEmitida } from "./ports/puertos";

export interface EntradaIniciarSesion {
  readonly nombreUsuario: string;
  readonly contrasena: string;
}

/**
 * Exchanges a username and password for a session.
 *
 * Two rules shape everything below, and both are about what the *failure* path
 * gives away:
 *
 * 1. **One error, one message.** Unknown user, wrong password and deactivated
 *    account all answer `CredencialesInvalidas` with the same text. Anything
 *    else turns the login form into a directory of who works here.
 *
 * 2. **One password verification, always.** The unknown-user branch verifies
 *    the attempt against a decoy digest instead of returning early, so the
 *    endpoint takes the same argon2id-shaped amount of time whether or not the
 *    username exists. A same-message login that answers in 1 ms for unknown
 *    users and 80 ms for real ones has not hidden anything.
 */
export class IniciarSesion {
  constructor(private readonly deps: DependenciasDeSesion) {}

  async ejecutar(entrada: EntradaIniciarSesion): Promise<SesionEmitida> {
    const usuario = await this.deps.usuarios.buscarPorNombreUsuario(
      entrada.nombreUsuario ?? "",
    );

    const contrasenaCorrecta = await this.deps.hasher.verificar(
      usuario?.hashDeContrasena ?? this.deps.hasher.hashSenuelo(),
      entrada.contrasena ?? "",
    );

    // Both conditions are checked after the verification above, never instead
    // of it, so every rejection costs the same work.
    if (usuario === null || !contrasenaCorrecta || !usuario.puedeAutenticarse) {
      this.deps.registro.advertir("Intento de inicio de sesión rechazado", {
        // The username is logged (an operator needs to see the account being
        // hammered); the password and the digest never are.
        nombreUsuario: (entrada.nombreUsuario ?? "").trim().toLowerCase(),
        motivo: motivoDelRechazo(usuario, contrasenaCorrecta),
      });

      throw new CredencialesInvalidas();
    }

    return await this.abrirSesion(usuario);
  }

  /**
   * Mints the pair and opens a brand-new token family.
   *
   * A family per login is what keeps one lost tablet from logging out the
   * rest: revoking a family takes down that device's chain and nothing else.
   */
  private async abrirSesion(usuario: Usuario): Promise<SesionEmitida> {
    const ahora = this.deps.reloj.ahora();
    const generado = this.deps.generador.generar();

    const token = TokenDeRefresco.emitir({
      id: this.deps.ids.nuevo(),
      usuarioId: usuario.id,
      familiaId: this.deps.ids.nuevo(),
      hash: generado.hash,
      emitidoEn: ahora,
      expiraEn: new Date(
        ahora.getTime() + diasEnMs(this.deps.vida.diasDeRefresco),
      ),
    });

    await this.deps.tokens.guardar(token);

    const tokenDeAcceso = await this.deps.emisor.emitir({
      usuarioId: usuario.id,
      rol: usuario.rol,
    });

    this.deps.registro.informar("Sesión iniciada", {
      usuarioId: usuario.id,
      rol: usuario.rol,
      familia: token.familiaId,
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

function motivoDelRechazo(
  usuario: Usuario | null,
  contrasenaCorrecta: boolean,
): string {
  if (usuario === null) {
    return "usuario_inexistente";
  }
  if (!contrasenaCorrecta) {
    return "contrasena_incorrecta";
  }
  return "usuario_inactivo";
}

export function diasEnMs(dias: number): number {
  return dias * 24 * 60 * 60 * 1000;
}

/** Shared by login and refresh so both answer with exactly the same shape. */
export function sesionEmitida(datos: {
  tokenDeAcceso: string;
  minutosDeAcceso: number;
  tokenDeRefresco: string;
  diasDeRefresco: number;
  usuario: ResumenUsuario;
}): SesionEmitida {
  return {
    tokenDeAcceso: datos.tokenDeAcceso,
    expiraEnSegundos: datos.minutosDeAcceso * 60,
    tokenDeRefresco: datos.tokenDeRefresco,
    refrescoExpiraEnSegundos: datos.diasDeRefresco * 24 * 60 * 60,
    usuario: datos.usuario,
  };
}
