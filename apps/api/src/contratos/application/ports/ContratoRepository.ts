import type { Contrato } from "../../domain/Contrato";

export interface ContratoRepository {
  porId(id: string): Promise<Contrato | null>;

  guardar(contrato: Contrato): Promise<void>;

  /**
   * Allocates the next contract number. The server owns this sequence: the
   * tablet must never invent a number, or two technicians signing at the same
   * time would produce the same one.
   */
  siguienteNumero(): Promise<number>;
}
