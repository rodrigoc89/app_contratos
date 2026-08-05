import { Comodatario } from "../domain/Comodatario";
import type { DatosComodatario } from "../domain/Comodatario";
import { Contrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import type { DatosEquipos } from "../domain/Equipos";
import type { ContratoRepository } from "./ports/ContratoRepository";
import type { IdentificadorUnico } from "./ports/IdentificadorUnico";

export interface ComandoCrearBorrador {
  readonly comodatario: DatosComodatario;
  readonly equipos: DatosEquipos;
}

/**
 * Opens a contract: customer data and equipment, nothing signed.
 *
 * A draft has no legal value and no contract number — the number, the date,
 * the template snapshot and the signatory all arrive at signing time and not
 * before. Keeping this use case that small is what makes the tablet's autosave
 * (DESIGN.md §2) safe to call as often as it likes: it can never half-create
 * something that looks signed.
 *
 * Both value objects are built before the aggregate exists, so a mistyped DNI
 * or MAC is refused with the domain's own message and nothing reaches the
 * database.
 */
export class CrearBorrador {
  constructor(
    private readonly contratos: ContratoRepository,
    private readonly ids: IdentificadorUnico,
  ) {}

  async ejecutar(comando: ComandoCrearBorrador): Promise<Contrato> {
    const contrato = Contrato.crearBorrador({
      id: this.ids.nuevo(),
      comodatario: Comodatario.crear(comando.comodatario),
      equipos: Equipos.crear(comando.equipos),
    });

    await this.contratos.guardar(contrato);

    return contrato;
  }
}
