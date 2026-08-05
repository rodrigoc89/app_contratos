/**
 * Mints the identifier a new contract is created with.
 *
 * A port rather than a direct `randomUUID()` call for the usual reason: the
 * use case stays free of `node:crypto`, and a test can fix the id instead of
 * asserting against a random one.
 *
 * The server owns this. DESIGN.md §2 dropped offline-first precisely so that
 * nothing on the tablet has to invent identifiers — no client-generated
 * UUIDs, no sync queue, no collision to resolve later.
 */
export interface IdentificadorUnico {
  nuevo(): string;
}
