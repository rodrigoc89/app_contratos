import type { DependenciasDeSesion } from "./ports/puertos";

export interface EntradaCerrarSesion {
  readonly tokenDeRefresco: string;
}

/**
 * Signs a device out by revoking the token family it holds.
 *
 * **The whole family, not just the presented token.** A session is a chain of
 * rotated tokens; revoking only the last link would leave an attacker who
 * copied an earlier link free to keep refreshing after the technician believes
 * they signed out. This is also the operation the office runs against a lost
 * tablet.
 *
 * **Silent on an unknown token.** Answering "no such token" would hand anyone
 * holding a stolen token a free liveness oracle, and there is nothing a client
 * could do with the answer. Logout therefore always succeeds.
 *
 * Note what it does *not* do: the access token already in the tablet's memory
 * stays valid until it expires. That is inherent to stateless JWTs and is why
 * `JWT_ACCESO_MINUTOS` is capped at an hour in `configuracion.ts`.
 */
export class CerrarSesion {
  constructor(private readonly deps: DependenciasDeSesion) {}

  async ejecutar(entrada: EntradaCerrarSesion): Promise<void> {
    const hash = this.deps.generador.hashDe(entrada.tokenDeRefresco ?? "");
    const token = await this.deps.tokens.buscarPorHash(hash);

    if (token === null) {
      return;
    }

    const revocados = await this.deps.tokens.revocarFamilia(
      token.familiaId,
      "cierre_de_sesion",
      this.deps.reloj.ahora(),
    );

    this.deps.registro.informar("Sesión cerrada", {
      usuarioId: token.usuarioId,
      familia: token.familiaId,
      tokensRevocados: revocados,
    });
  }
}
