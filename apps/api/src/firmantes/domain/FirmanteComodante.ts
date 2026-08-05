import { Dni } from "../../contratos/domain/value-objects/Dni";
import { textoRequerido } from "../../shared/domain/texto";

export interface DatosFirmanteComodante {
  id: string;
  version: string;
  nombreCompleto: string;
  dni: string;
  imagenFirmaPng: string;
}

/**
 * The company side of the contract, with its pre-loaded signature.
 *
 * The owner does not travel to installations, so their signature is stamped
 * from here. It is versioned like the template because every contract must
 * record which signature image was placed on it.
 *
 * That image is a real person's handwritten signature: it must never reach the
 * public frontend bundle or any publicly readable storage, and it is read
 * server-side only, while rendering the PDF.
 */
export class FirmanteComodante {
  private constructor(
    readonly id: string,
    readonly version: string,
    readonly nombreCompleto: string,
    readonly dni: Dni,
    readonly imagenFirmaPng: string,
  ) {}

  static crear(datos: DatosFirmanteComodante): FirmanteComodante {
    return new FirmanteComodante(
      textoRequerido(datos.id, "identificador del firmante"),
      textoRequerido(datos.version, "versión del firmante"),
      textoRequerido(datos.nombreCompleto, "nombre del comodante"),
      Dni.crear(datos.dni),
      textoRequerido(datos.imagenFirmaPng, "imagen de firma del comodante"),
    );
  }

  /** Printed under the comodante signature block. */
  get aclaracion(): string {
    return this.nombreCompleto;
  }

  /** Everything about this signatory except the signature itself. */
  resumenPublico(): ResumenFirmante {
    return {
      id: this.id,
      version: this.version,
      nombreCompleto: this.nombreCompleto,
      dni: this.dni.formateado,
    };
  }

  /**
   * Serialising this entity must never carry the signature image.
   *
   * The image is the owner's real handwritten signature: leaked, anyone can
   * paste it onto any document. Rather than trusting every future controller
   * to remember to strip the field, the entity refuses to serialise it at all.
   * Code that genuinely needs the image — the PDF renderer — reads
   * `imagenFirmaPng` explicitly, which is a deliberate act.
   */
  toJSON(): ResumenFirmante {
    return this.resumenPublico();
  }
}

export interface ResumenFirmante {
  readonly id: string;
  readonly version: string;
  readonly nombreCompleto: string;
  readonly dni: string;
}
