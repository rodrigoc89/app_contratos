import { ErrorDeApi } from "./clienteHttp";

/**
 * One shared retry primitive, used by autosave *and* signing (DESIGN.md
 * D3a). It cannot live inside the autosave queue alone: `POST
 * /contratos/:id/firmar` does not go through that queue, and signing is the
 * request where a spurious `conflicto_de_concurrencia` is most expensive —
 * the customer has already signed.
 *
 * Exactly one retry, immediately, with the same body. If the retry also
 * fails — with `conflicto_de_concurrencia` or anything else — that failure
 * propagates; nothing here loops a third time.
 *
 * `conflicto_de_estado` is a different 409 on purpose (see
 * `packages/esquemas/src/respuestas.ts`) and is never retried here: it means
 * the write is impossible given the contract's current state, not that two
 * writers collided. Retrying it would resend a request that is already known
 * to fail.
 */
export async function conReintentoDeConcurrencia<T>(ejecutar: () => Promise<T>): Promise<T> {
  try {
    return await ejecutar();
  } catch (error) {
    if (error instanceof ErrorDeApi && error.codigo === "conflicto_de_concurrencia") {
      return await ejecutar();
    }
    throw error;
  }
}
