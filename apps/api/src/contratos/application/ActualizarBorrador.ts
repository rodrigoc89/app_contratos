import { DomainError } from "../../shared/domain/DomainError";
import { Comodatario } from "../domain/Comodatario";
import type { DatosComodatario } from "../domain/Comodatario";
import type { Contrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import type { DatosEquipos } from "../domain/Equipos";
import { buscarContrato } from "./buscarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";

export interface ComandoActualizarBorrador {
  readonly contratoId: string;
  readonly comodatario?: DatosComodatario;
  readonly equipos?: DatosEquipos;
}

/**
 * Corrects a draft before anything is signed.
 *
 * Either half may be sent on its own, because the tablet fills the customer's
 * data at the door and the equipment once the install is finished.
 *
 * **There is no counterpart for a signed contract, and there never will be.**
 * `actualizarComodatario` and `actualizarEquipos` both refuse on anything past
 * `borrador` and say so with `ConflictoDeEstado`, which this use case lets
 * through untouched — a signed contract with wrong data is annulled and
 * re-signed from scratch (DESIGN.md §3). That costs a second visit to the
 * customer, and that cost is the price of the signature meaning anything.
 */
export class ActualizarBorrador {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(comando: ComandoActualizarBorrador): Promise<Contrato> {
    if (comando.comodatario === undefined && comando.equipos === undefined) {
      throw new DomainError(
        "No hay nada para actualizar: envíe los datos del cliente, los equipos o ambos.",
      );
    }

    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    // Both value objects are built before either is applied. Applying as we
    // go would let a valid customer land on the aggregate and an invalid
    // antenna reject the call, leaving the in-memory contract holding a
    // change that was never saved and never asked for.
    const comodatario =
      comando.comodatario === undefined
        ? null
        : Comodatario.crear(comando.comodatario);
    const equipos =
      comando.equipos === undefined ? null : Equipos.crear(comando.equipos);

    if (comodatario !== null) {
      contrato.actualizarComodatario(comodatario);
    }
    if (equipos !== null) {
      contrato.actualizarEquipos(equipos);
    }

    await this.contratos.guardar(contrato);

    return contrato;
  }
}
