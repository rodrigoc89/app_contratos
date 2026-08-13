/**
 * Turns the ids `EventoContrato.usuarioId` records into names a person can
 * read.
 *
 * A port owned by `contratos`, deliberately, rather than a reach into
 * `identidad`'s `UsuarioRepository`. The contract module needs exactly one
 * narrow question answered — *what is this id called?* — and has no business
 * being able to load, create or authenticate a user. Stating that as its own
 * one-method port is what keeps the dependency honest about its size.
 *
 * It is also why `contrato_eventos.usuario_id` carries no foreign key to
 * `usuarios`: the event is a legal record of what happened, and it must keep
 * answering that question even if the identity row it points at is ever
 * removed. Resolution is best-effort by design — an id with no name is a
 * screen with no name, never a failed read of the contract.
 */
export interface DirectorioDeAutores {
  /**
   * Returns only the ids it could resolve. Callers must treat a missing key
   * as "no name available" rather than an error, and an empty `ids` must not
   * reach the database at all — the common case is a contract whose only
   * events are `creado` and `firmado`, which have no actor.
   */
  nombresPorId(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
