/**
 * Reads and writes finished document bytes in the document store.
 *
 * Split out from `GeneradorDeDocumentos` so rendering stays testable without
 * touching disk: a fake store can capture what would have been written, and
 * the real filesystem adapter (or, later, an offsite-replicating one) is a
 * separate, independently testable concern.
 *
 * `ruta` is always relative to the store's root — the same rule the
 * `Contrato` aggregate enforces on `DocumentoContrato.ruta` (no absolute
 * paths, no `..`). Callers build it from the contract number and the document
 * type and nothing else.
 */
export interface AlmacenDeDocumentos {
  guardar(ruta: string, contenido: Uint8Array): Promise<void>;

  /**
   * Reads a stored document back, for the download endpoint.
   *
   * Rejects when the document is not there rather than answering empty: a
   * signed contract whose PDF has gone missing is an incident, and zero bytes
   * would still hash to something and still look like a document.
   *
   * Implementations must apply the same containment check `guardar` does.
   * Nothing today builds a read path from user input — the controller looks
   * the document up on the aggregate, which only ever holds paths the
   * aggregate already validated — but this is the method reachable from a
   * URL, and "no caller does that yet" is not a property a store should rely
   * on.
   */
  leer(ruta: string): Promise<Uint8Array>;
}
