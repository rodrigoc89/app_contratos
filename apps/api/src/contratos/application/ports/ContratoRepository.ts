import type { Contrato } from "../../domain/Contrato";

export interface ContratoRepository {
  porId(id: string): Promise<Contrato | null>;

  /**
   * Persists the whole aggregate, or nothing.
   *
   * **May refuse.** An implementation that stores contracts concurrently has
   * to settle two requests holding the same one, and the way it does that is
   * by rejecting with `ConflictoDeConcurrencia` when the stored contract moved
   * on between the read and this write. Nothing was written when that happens
   * — but note that whatever the use case did *before* calling this, such as
   * rendering and storing PDFs, is outside the transaction and stays done.
   * `FirmarContrato` documents what that leaves behind.
   */
  guardar(contrato: Contrato): Promise<void>;

  /**
   * Allocates the next contract number. The server owns this sequence: the
   * tablet must never invent a number, or two technicians signing at the same
   * time would produce the same one.
   */
  siguienteNumero(): Promise<number>;
}
