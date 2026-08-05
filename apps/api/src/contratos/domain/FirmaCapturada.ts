import { DomainError } from "../../shared/domain/DomainError";

/**
 * A tap is one or two samples. A pen drawing anything at all produces dozens
 * at 60 Hz, so this threshold separates a signature from a finger poking the
 * screen to get past the step.
 */
export const MINIMO_PUNTOS_FIRMA = 10;

export type TipoDocumentoFirmado = "condiciones_generales" | "comodato";

const DOCUMENTOS: readonly TipoDocumentoFirmado[] = [
  "condiciones_generales",
  "comodato",
];

export interface PuntoFirma {
  readonly x: number;
  readonly y: number;
  /** Milliseconds since capture started. */
  readonly t: number;
  /** Pen pressure, when the tablet reports it. */
  readonly presion?: number;
}

export type TrazoFirma = readonly PuntoFirma[];

export interface DatosFirmaCapturada {
  documento: TipoDocumentoFirmado;
  imagenPng: string;
  trazos: readonly TrazoFirma[];
}

/**
 * A signature captured on the tablet.
 *
 * Two things are stored, and both matter for different reasons. The **image**
 * is what gets printed on the PDF. The **raw strokes with their timestamps**
 * are the forensic evidence: a pasted image has no stroke timing, a hand
 * moving across a screen does. If a customer ever denies having signed, this
 * is what answers them.
 */
export class FirmaCapturada {
  private constructor(
    readonly documento: TipoDocumentoFirmado,
    readonly imagenPng: string,
    readonly trazos: readonly TrazoFirma[],
  ) {}

  static crear(datos: DatosFirmaCapturada): FirmaCapturada {
    if (!DOCUMENTOS.includes(datos.documento)) {
      throw new DomainError(
        `El documento "${datos.documento}" no es uno de los que se firman.`,
      );
    }

    const imagenPng = (datos.imagenPng ?? "").trim();
    if (imagenPng === "") {
      throw new DomainError(
        "La firma no tiene imagen: no habría nada para imprimir en el contrato.",
      );
    }

    const trazos = datos.trazos ?? [];
    if (trazos.length === 0) {
      throw new DomainError("La firma está vacía: pedile al cliente que firme.");
    }

    let puntos = 0;
    for (const trazo of trazos) {
      if (trazo.length === 0) {
        throw new DomainError("La firma tiene un trazo vacío.");
      }
      FirmaCapturada.validarTrazo(trazo);
      puntos += trazo.length;
    }

    if (puntos < MINIMO_PUNTOS_FIRMA) {
      throw new DomainError(
        "Eso no es una firma, es un toque en la pantalla. Pedile al cliente que firme.",
      );
    }

    return new FirmaCapturada(
      datos.documento,
      imagenPng,
      Object.freeze(trazos.map((trazo) => Object.freeze([...trazo]))),
    );
  }

  private static validarTrazo(trazo: TrazoFirma): void {
    let anterior = Number.NEGATIVE_INFINITY;

    for (const punto of trazo) {
      if (
        !Number.isFinite(punto.x) ||
        !Number.isFinite(punto.y) ||
        !Number.isFinite(punto.t)
      ) {
        throw new DomainError(
          "La firma tiene un punto inválido: las coordenadas y el tiempo tienen que ser números.",
        );
      }
      if (punto.t < anterior) {
        throw new DomainError(
          "La firma tiene tiempos que retroceden, así que el trazo no puede ser auténtico.",
        );
      }
      anterior = punto.t;
    }
  }

  get cantidadTrazos(): number {
    return this.trazos.length;
  }

  get cantidadPuntos(): number {
    return this.trazos.reduce((total, trazo) => total + trazo.length, 0);
  }

  /** How long the person took to sign, across all strokes. */
  get duracionMs(): number {
    const tiempos = this.trazos.flatMap((trazo) =>
      trazo.map((punto) => punto.t),
    );

    return Math.max(...tiempos) - Math.min(...tiempos);
  }
}
