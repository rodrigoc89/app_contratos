import { textoRequerido } from "../../shared/domain/texto";
import { DireccionMac } from "./value-objects/DireccionMac";
import { MetrosCano } from "./value-objects/MetrosCano";

export interface DatosEquipos {
  antenaModelo: string;
  antenaMac: string;
  poe: boolean;
  canoMetros: number | string;
}

/**
 * The equipment handed over in comodato (clause PRIMERA).
 *
 * A fixed set, not an open item list: the contract lists exactly an antenna
 * with its MAC, whether a PoE injector was included, and the metres of mast
 * tubing used.
 */
export class Equipos {
  private constructor(
    readonly antenaModelo: string,
    readonly antenaMac: DireccionMac,
    readonly poe: boolean,
    readonly canoMetros: MetrosCano,
  ) {}

  static crear(datos: DatosEquipos): Equipos {
    return new Equipos(
      textoRequerido(datos.antenaModelo, "modelo de antena"),
      DireccionMac.crear(datos.antenaMac),
      datos.poe,
      MetrosCano.crear(datos.canoMetros),
    );
  }

  /** The contract prints "POE _____SI_____ NO______". */
  get poeImpreso(): "SI" | "NO" {
    return this.poe ? "SI" : "NO";
  }
}
