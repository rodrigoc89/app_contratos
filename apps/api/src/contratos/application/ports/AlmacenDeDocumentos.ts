/**
 * Writes finished document bytes into the document store.
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
}
