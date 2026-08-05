import type { PrismaClient } from "../../../generated/prisma/client";
import type { UsuarioRepository } from "../application/ports/puertos";
import type { Usuario } from "../domain/Usuario";
import { filaDesdeUsuario, usuarioDesdeFila } from "./mappers/UsuarioMapper";

/**
 * Postgres implementation of `UsuarioRepository`.
 *
 * `guardar` upserts by id rather than inserting outright: the session use
 * cases re-save an existing user (e.g. `Usuario.conNuevoHash`,
 * `Usuario.desactivar`), and those return a new instance with the same id —
 * a plain `create` would collide with the primary key on that second call.
 */
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { id } });

    return fila === null ? null : usuarioDesdeFila(fila);
  }

  /**
   * The caller hands over raw input from a login form. `trim().toLowerCase()`
   * mirrors exactly what `Usuario.crear` already does to `nombreUsuario`
   * before persisting it, so a technician who fat-fingers capitals or a
   * stray space still finds the account they typed.
   */
  async buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({
      where: { nombreUsuario: nombreUsuario.trim().toLowerCase() },
    });

    return fila === null ? null : usuarioDesdeFila(fila);
  }

  async guardar(usuario: Usuario): Promise<void> {
    const fila = filaDesdeUsuario(usuario);

    await this.prisma.usuario.upsert({
      where: { id: fila.id },
      create: fila,
      update: fila,
    });
  }
}
