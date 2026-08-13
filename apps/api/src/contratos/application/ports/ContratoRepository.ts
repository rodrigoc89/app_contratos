import type { FechaCalendario } from "../../../shared/domain/FechaCalendario";
import type { Contrato, EstadoContrato } from "../../domain/Contrato";
import type { TerminoInterpretado } from "../interpretarTerminoDeBusqueda";

/**
 * One row of the office list screen — a read model, not the aggregate
 * (DESIGN.md D4). Hydrating twenty aggregates to render five fields each
 * would pull every signature, document and event along with them: slow, and
 * a privacy over-fetch of exactly the evidence `vistas.ts` exists to keep
 * server-side under Ley 25.326.
 */
export interface ResumenDeContrato {
  readonly id: string;
  readonly numero: number | null;
  readonly estado: EstadoContrato;
  /** Display form, untouched — dotting and normalisation are presentation. */
  readonly comodatarioNombreCompleto: string;
  /** Digits only, as stored. */
  readonly comodatarioDni: string;
  readonly fechaFirma: FechaCalendario | null;
  /** The ordering key (R-2.2): storage-assigned, never domain state. */
  readonly creadoEn: Date;
}

export interface CriteriosDeBusqueda {
  /**
   * Already interpreted by `interpretarTerminoDeBusqueda`, never a raw
   * string — so no adapter can re-decide what the user typed.
   */
  readonly termino: TerminoInterpretado | null;
  /** Empty means every state; never a hidden default. */
  readonly estados: readonly EstadoContrato[];
  /** 1-based. */
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export interface ResultadoDeBusqueda {
  readonly resumenes: readonly ResumenDeContrato[];
  /** Untruncated match count, before paging. */
  readonly total: number;
}

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

  /**
   * The office list and search (DESIGN.md D4). Filtering, ordering
   * (`creadoEn DESC, id DESC` — R-2.2), paging and the untruncated `total`
   * all live behind this one method, so `ContratosEnMemoria` and
   * `PrismaContratoRepository` can be driven by the exact same scenario
   * table (`escenariosDeBusqueda.testing.ts`, DESIGN.md D8).
   */
  buscar(criterios: CriteriosDeBusqueda): Promise<ResultadoDeBusqueda>;
}
