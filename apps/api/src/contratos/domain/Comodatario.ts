import { textoRequerido } from "../../shared/domain/texto";
import { Dni } from "./value-objects/Dni";
import { NumeroWhatsapp } from "./value-objects/NumeroWhatsapp";

/** The template hardcodes the province; it is not a field the customer fills. */
export const PROVINCIA = "Santiago del Estero";

export interface DatosComodatario {
  nombreCompleto: string;
  dni: string;
  domicilioCalle: string;
  ciudad: string;
  whatsapp: string;
}

/**
 * The customer receiving the equipment in comodato.
 *
 * `whatsapp` is not on the paper form: it exists because the customer is
 * entitled to their copy of the contract and digital delivery needs somewhere
 * to send it.
 */
export class Comodatario {
  private constructor(
    readonly nombreCompleto: string,
    readonly dni: Dni,
    readonly domicilioCalle: string,
    readonly ciudad: string,
    readonly whatsapp: NumeroWhatsapp,
  ) {}

  static crear(datos: DatosComodatario): Comodatario {
    return new Comodatario(
      textoRequerido(datos.nombreCompleto, "nombre y apellido"),
      Dni.crear(datos.dni),
      textoRequerido(datos.domicilioCalle, "domicilio"),
      textoRequerido(datos.ciudad, "ciudad"),
      NumeroWhatsapp.crear(datos.whatsapp),
    );
  }

  get provincia(): string {
    return PROVINCIA;
  }

  /** Printed under the signature, as the contract's closing block requires. */
  get aclaracion(): string {
    return this.nombreCompleto;
  }
}
