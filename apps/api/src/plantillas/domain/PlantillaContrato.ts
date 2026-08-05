import type { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { textoRequerido } from "../../shared/domain/texto";
import type { TipoDocumentoFirmado } from "../../shared/domain/TipoDocumentoFirmado";

export interface DatosPlantillaContrato {
  id: string;
  version: string;
  condicionesGeneralesHtml: string;
  comodatoHtml: string;
  vigenteDesde: FechaCalendario;
}

/**
 * An immutable version of the contract text.
 *
 * It carries **two** legal texts, because the contract is two documents the
 * customer signs separately: the general conditions of use and the comodato
 * agreement itself.
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
    private readonly contenidos: Record<TipoDocumentoFirmado, string>,
    readonly vigenteDesde: FechaCalendario,
  ) {}

  static crear(datos: DatosPlantillaContrato): PlantillaContrato {
    return new PlantillaContrato(
      textoRequerido(datos.id, "identificador de plantilla"),
      textoRequerido(datos.version, "versión de plantilla"),
      {
        condiciones_generales: textoRequerido(
          datos.condicionesGeneralesHtml,
          "texto de las condiciones generales",
        ),
        comodato: textoRequerido(
          datos.comodatoHtml,
          "texto del contrato de comodato",
        ),
      },
      datos.vigenteDesde,
    );
  }

  contenidoDe(documento: TipoDocumentoFirmado): string {
    return this.contenidos[documento];
  }

  get condicionesGeneralesHtml(): string {
    return this.contenidos.condiciones_generales;
  }

  get comodatoHtml(): string {
    return this.contenidos.comodato;
  }
}
