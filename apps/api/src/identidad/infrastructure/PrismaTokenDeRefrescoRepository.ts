import type { PrismaClient } from "../../../generated/prisma/client";
import type { TokenDeRefrescoRepository } from "../application/ports/puertos";
import type {
  MotivoDeRevocacion,
  TokenDeRefresco,
} from "../domain/TokenDeRefresco";
import { filaDesdeToken, tokenDesdeFila } from "./mappers/TokenDeRefrescoMapper";

/**
 * Postgres implementation of `TokenDeRefrescoRepository`.
 *
 * `guardar` upserts by id: the refresh flow both inserts a brand-new token
 * (login, rotation's successor) and re-saves one already on disk (rotation's
 * predecessor, once `rotarPor` has mutated it) in the same request.
 */
export class PrismaTokenDeRefrescoRepository
  implements TokenDeRefrescoRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async guardar(token: TokenDeRefresco): Promise<void> {
    const fila = filaDesdeToken(token);

    await this.prisma.tokenDeRefresco.upsert({
      where: { id: fila.id },
      create: fila,
      update: fila,
    });
  }

  async buscarPorHash(hash: string): Promise<TokenDeRefresco | null> {
    const fila = await this.prisma.tokenDeRefresco.findUnique({
      where: { tokenHash: hash },
    });

    return fila === null ? null : tokenDesdeFila(fila);
  }

  /**
   * A single `updateMany` rather than a read-then-write loop: that is what
   * makes the count returned here trustworthy and keeps a lost-tablet
   * revocation atomic instead of racing a concurrent refresh on the same
   * family.
   *
   * `revocadoEn: null` in the WHERE clause does two jobs at once: it scopes
   * the statement to the live tokens of this family (the partial index
   * `idx_tokens_refresco_vivos` exists for exactly this predicate), and it
   * stops an already-revoked row's `motivoRevocacion` from being overwritten
   * — which would destroy the very audit trail the CHECK constraint
   * `usuario_tokens_refresco_revocacion_completa` and
   * `TokenDeRefresco.rehidratar` both work to keep honest.
   */
  async revocarFamilia(
    familiaId: string,
    motivo: MotivoDeRevocacion,
    instante: Date,
  ): Promise<number> {
    const resultado = await this.prisma.tokenDeRefresco.updateMany({
      where: { familiaId, revocadoEn: null },
      data: { revocadoEn: instante, motivoRevocacion: motivo },
    });

    return resultado.count;
  }
}
