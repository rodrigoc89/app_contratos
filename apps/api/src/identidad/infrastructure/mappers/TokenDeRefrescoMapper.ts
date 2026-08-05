import type { MotivoDeRevocacion } from "../../domain/TokenDeRefresco";
import { TokenDeRefresco } from "../../domain/TokenDeRefresco";

/** The `usuario_tokens_refresco` row, as Prisma hands it back on a read. */
export interface FilaTokenDeRefresco {
  id: string;
  usuarioId: string;
  familiaId: string;
  tokenHash: string;
  expiraEn: Date;
  creadoEn: Date;
  revocadoEn: Date | null;
  motivoRevocacion: MotivoDeRevocacion | null;
  reemplazadoPor: string | null;
}

/**
 * Goes through `rehidratar`, not `emitir`: a stored row may already be
 * revoked or rotated, and only `rehidratar` accepts (and validates) that
 * full history. A row that claims to be revoked with no reason is corrupt
 * data, and the domain refuses to build a `TokenDeRefresco` out of it rather
 * than silently dropping the inconsistency.
 */
export function tokenDesdeFila(fila: FilaTokenDeRefresco): TokenDeRefresco {
  return TokenDeRefresco.rehidratar({
    id: fila.id,
    usuarioId: fila.usuarioId,
    familiaId: fila.familiaId,
    hash: fila.tokenHash,
    emitidoEn: fila.creadoEn,
    expiraEn: fila.expiraEn,
    revocadoEn: fila.revocadoEn,
    motivoDeRevocacion: fila.motivoRevocacion,
    reemplazadoPor: fila.reemplazadoPor,
  });
}

/**
 * `hash` -> `tokenHash`, `motivoDeRevocacion` -> `motivoRevocacion` and
 * `emitidoEn` -> `creadoEn` are the column renames; everything else keeps
 * its domain name.
 */
export function filaDesdeToken(token: TokenDeRefresco): FilaTokenDeRefresco {
  return {
    id: token.id,
    usuarioId: token.usuarioId,
    familiaId: token.familiaId,
    tokenHash: token.hash,
    expiraEn: token.expiraEn,
    creadoEn: token.emitidoEn,
    revocadoEn: token.revocadoEn,
    motivoRevocacion: token.motivoDeRevocacion,
    reemplazadoPor: token.reemplazadoPor,
  };
}
