import { fechaCalendarioDesdeColumna } from "../../../shared/infrastructure/persistence/columnaFecha";
import { PlantillaContrato } from "../../domain/PlantillaContrato";

/** The `plantillas_contrato` row, as Prisma hands it back on a read. */
export interface FilaPlantillaContrato {
  id: string;
  version: string;
  contenidoHtml: string;
  vigenteDesde: Date;
}

/**
 * `checksum` deliberately never appears here: the domain class carries no
 * such field (see PlantillaContrato.ts), so there is nothing for a mapper to
 * round-trip. Computing and storing it is a separate repository concern the
 * read side of this port does not need.
 */
export function plantillaContratoDesdeFila(
  fila: FilaPlantillaContrato,
): PlantillaContrato {
  return PlantillaContrato.crear({
    id: fila.id,
    version: fila.version,
    contenidoHtml: fila.contenidoHtml,
    vigenteDesde: fechaCalendarioDesdeColumna(fila.vigenteDesde),
  });
}
