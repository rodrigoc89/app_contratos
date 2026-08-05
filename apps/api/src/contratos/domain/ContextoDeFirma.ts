import { DomainError } from "../../shared/domain/DomainError";
import { textoRequerido } from "../../shared/domain/texto";

export interface Geolocalizacion {
  readonly latitud: number;
  readonly longitud: number;
}

export interface DatosContextoDeFirma {
  tecnicoId: string;
  dispositivoId: string;
  capturadoEn: Date;
  ip?: string | null;
  userAgent?: string | null;
  geo?: Geolocalizacion | null;
}

/**
 * The circumstances a signature was captured in.
 *
 * Who was holding the tablet, which tablet it was, and when the server saw it.
 * None of this proves the signature on its own, but together with the stroke
 * data it is what turns "someone signed" into "this technician captured this
 * signature on this device at this moment".
 *
 * IP, user agent and location are best-effort: a missing GPS permission must
 * never stop an installation from being closed.
 */
export class ContextoDeFirma {
  private constructor(
    readonly tecnicoId: string,
    readonly dispositivoId: string,
    /** Stored as epoch millis: a `Date` field would be mutable evidence. */
    private readonly capturadoEnMs: number,
    readonly ip: string | null,
    readonly userAgent: string | null,
    readonly geo: Geolocalizacion | null,
  ) {}

  /** A fresh Date every read, so the captured instant cannot be moved. */
  get capturadoEn(): Date {
    return new Date(this.capturadoEnMs);
  }

  static crear(datos: DatosContextoDeFirma): ContextoDeFirma {
    if (Number.isNaN(datos.capturadoEn?.getTime())) {
      throw new DomainError("El momento de la firma no es una fecha válida.");
    }

    return new ContextoDeFirma(
      textoRequerido(datos.tecnicoId, "técnico que toma la firma"),
      textoRequerido(datos.dispositivoId, "dispositivo"),
      datos.capturadoEn.getTime(),
      ContextoDeFirma.opcional(datos.ip),
      ContextoDeFirma.opcional(datos.userAgent),
      ContextoDeFirma.validarGeo(datos.geo ?? null),
    );
  }

  private static opcional(valor: string | null | undefined): string | null {
    const limpio = (valor ?? "").trim();
    return limpio === "" ? null : limpio;
  }

  private static validarGeo(geo: Geolocalizacion | null): Geolocalizacion | null {
    if (geo === null) {
      return null;
    }
    // Never echo the coordinates: they locate the customer's home, and this
    // message travels to logs and error trackers.
    if (!Number.isFinite(geo.latitud) || geo.latitud < -90 || geo.latitud > 90) {
      throw new DomainError("La latitud capturada no es válida.");
    }
    if (
      !Number.isFinite(geo.longitud) ||
      geo.longitud < -180 ||
      geo.longitud > 180
    ) {
      throw new DomainError("La longitud capturada no es válida.");
    }

    return { latitud: geo.latitud, longitud: geo.longitud };
  }
}
