import type { FirmanteComodante } from "../../../firmantes/domain/FirmanteComodante";

export interface FirmanteRepository {
  /** The comodante signatory whose pre-loaded signature is stamped today. */
  activo(): Promise<FirmanteComodante>;
}
