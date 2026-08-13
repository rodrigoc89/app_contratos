import type { EstadoContrato } from "../domain/Contrato";
import { interpretarTerminoDeBusqueda } from "./interpretarTerminoDeBusqueda";
import type {
  ContratoRepository,
  ResultadoDeBusqueda,
} from "./ports/ContratoRepository";

export interface DatosBusqueda {
  /** The raw search box value, already trimmed by the schema; may be absent. */
  readonly termino?: string;
  /** Empty means every state — see R-2.6. */
  readonly estados: readonly EstadoContrato[];
  readonly pagina: number;
  readonly tamanoPagina: number;
}

/**
 * The office list and search — thin on purpose, in `ConsultarContrato`'s
 * idiom.
 *
 * Its whole job is to call `interpretarTerminoDeBusqueda` **exactly once**
 * and hand the already-interpreted term to the repository, so neither
 * `PrismaContratoRepository` nor `ContratosEnMemoria` gets a second chance
 * to decide what the operator typed (DESIGN.md D4).
 */
export class BuscarContratos {
  constructor(private readonly contratos: ContratoRepository) {}

  async ejecutar(datos: DatosBusqueda): Promise<ResultadoDeBusqueda> {
    return await this.contratos.buscar({
      termino: interpretarTerminoDeBusqueda(datos.termino ?? ""),
      estados: datos.estados,
      pagina: datos.pagina,
      tamanoPagina: datos.tamanoPagina,
    });
  }
}
