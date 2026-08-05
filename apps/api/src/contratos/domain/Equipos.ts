import { DomainError } from "../../shared/domain/DomainError";
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
      booleanoRequerido(datos.poe, "PoE"),
      MetrosCano.crear(datos.canoMetros),
    );
  }

  /** The contract prints "POE _____SI_____ NO______". */
  get poeImpreso(): "SI" | "NO" {
    return this.poe ? "SI" : "NO";
  }
}

/**
 * Every other field here goes through a value object that validates itself.
 * A boolean has no value object to hide behind, and the `boolean` in
 * `DatosEquipos` is only a compile-time promise — this data arrives from an
 * HTTP request, where a caller can send anything.
 *
 * Without this check the coercion is silent and lands on paper: `"no"` is
 * truthy, `poeImpreso` returns `"SI"`, and a signed contract states that a
 * PoE injector was handed over when it was not. The schema in
 * `@contratos/esquemas` catches it first, but the domain is the authority on
 * what a valid set of equipment is, and it should not depend on someone
 * remembering to validate upstream.
 */
function booleanoRequerido(valor: boolean, campo: string): boolean {
  if (typeof valor !== "boolean") {
    throw new DomainError(`El campo ${campo} tiene que ser sí o no.`);
  }

  return valor;
}
