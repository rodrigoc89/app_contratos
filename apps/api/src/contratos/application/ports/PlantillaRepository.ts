import type { PlantillaContrato } from "../../../plantillas/domain/PlantillaContrato";

export interface PlantillaRepository {
  /** The template version currently in force, to be snapshotted on signing. */
  vigente(): Promise<PlantillaContrato>;
}
