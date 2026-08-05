import type { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { textoRequerido } from "../../shared/domain/texto";

export interface DatosPlantillaContrato {
  id: string;
  version: string;
  contenidoHtml: string;
  vigenteDesde: FechaCalendario;
}

/**
 * An immutable version of the contract text.
 *
 * Versions are never edited, only superseded. The legal text carries prices
 * inline — the technical visit, the password change, the USD 130 penalty —
 * and Argentine inflation moves those several times a year. A contract signed
 * in March must keep rendering March's numbers forever, so every contract
 * stores the version it was signed against and renders from that copy.
 */
export class PlantillaContrato {
  private constructor(
    readonly id: string,
    readonly version: string,
    readonly contenidoHtml: string,
    readonly vigenteDesde: FechaCalendario,
  ) {}

  static crear(datos: DatosPlantillaContrato): PlantillaContrato {
    return new PlantillaContrato(
      textoRequerido(datos.id, "identificador de plantilla"),
      textoRequerido(datos.version, "versión de plantilla"),
      textoRequerido(datos.contenidoHtml, "contenido de la plantilla"),
      datos.vigenteDesde,
    );
  }
}
