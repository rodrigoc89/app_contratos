import type { PrismaClient } from "../../../generated/prisma/client";
import type { DirectorioDeAutores } from "../application/ports/DirectorioDeAutores";

/**
 * Reads names out of `usuarios` for the contract history, and nothing else.
 *
 * It answers with `nombreCompleto`, not `nombreUsuario`: the history line is
 * read by people asking *who ended this customer's agreement*, and "Marcela
 * Coronel" answers that where "oficina2" only names a login. The login name
 * stays where it belongs, on the login screen.
 *
 * The `select` is narrow on purpose. `usuarios` also holds `hashContrasena`,
 * and an adapter that pulled whole rows would put an argon2id digest one
 * careless `JSON.stringify` away from a response — `Usuario.toJSON` refuses
 * to serialise it, but this adapter never builds a `Usuario` at all, so that
 * protection does not apply here.
 */
export class PrismaDirectorioDeAutores implements DirectorioDeAutores {
  constructor(private readonly prisma: PrismaClient) {}

  async nombresPorId(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const unicos = [...new Set(ids)];
    // The common contract has only `creado` and `firmado`, neither of which
    // has an actor. `IN ()` is not a query worth sending.
    if (unicos.length === 0) {
      return new Map();
    }

    const filas = await this.prisma.usuario.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nombreCompleto: true },
    });

    // No `activo` filter: a deactivated account cannot log in, but what it
    // already did remains true and the record has to keep saying so.
    return new Map(filas.map((fila) => [fila.id, fila.nombreCompleto]));
  }
}
