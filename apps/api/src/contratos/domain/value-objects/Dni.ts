import { DomainError } from "../../../shared/domain/DomainError";

const SOLO_SEPARADORES = /[.\s]/g;
const DIGITOS_VALIDOS = /^\d{7,8}$/;

/**
 * Argentine national identity document.
 *
 * Stored as bare digits so that "27.582.030" and "27582030" are the same
 * customer, and formatted with dots only for display — the contract is
 * printed the way people read it.
 */
export class Dni {
  private constructor(readonly valor: string) {}

  static crear(entrada: string): Dni {
    const digitos = (entrada ?? "").replace(SOLO_SEPARADORES, "");

    if (!DIGITOS_VALIDOS.test(digitos)) {
      // Never echo the attempted value: this message travels to logs and error
      // trackers, and a national ID number does not belong there.
      throw new DomainError(
        "El DNI no es válido: tiene que tener 7 u 8 dígitos, sin letras.",
      );
    }

    return new Dni(digitos);
  }

  /** Dotted form used on the printed contract, e.g. "27.582.030". */
  get formateado(): string {
    return this.valor.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  esIgualA(otro: Dni): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.formateado;
  }
}
