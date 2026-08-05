import { DomainError } from "../../../shared/domain/DomainError";

const MAXIMO_METROS = 200;

/**
 * Metres of mast tubing handed over in comodato (clause PRIMERA).
 *
 * Zero is valid: not every installation needs mast tubing, and forcing a
 * technician to invent a number would be worse than recording none.
 */
export class MetrosCano {
  private constructor(readonly valor: number) {}

  static crear(entrada: number | string): MetrosCano {
    const metros = MetrosCano.aNumero(entrada);

    if (metros === null || !Number.isFinite(metros)) {
      throw new DomainError(
        `Los metros de caño "${entrada}" no son válidos: ingresá un número, por ejemplo 7,5.`,
      );
    }
    if (metros < 0) {
      throw new DomainError("Los metros de caño no pueden ser negativos.");
    }
    if (metros > MAXIMO_METROS) {
      throw new DomainError(
        `Los metros de caño no pueden superar los ${MAXIMO_METROS}. Revisá el valor cargado.`,
      );
    }
    if (!MetrosCano.tieneHastaDosDecimales(metros)) {
      throw new DomainError(
        "Los metros de caño admiten como máximo dos decimales.",
      );
    }

    return new MetrosCano(metros);
  }

  private static aNumero(entrada: number | string): number | null {
    if (typeof entrada === "number") {
      return entrada;
    }

    // A Spanish keyboard yields "7,5"; an input[type=number] yields "7.5".
    const normalizada = (entrada ?? "").trim().replace(",", ".");
    if (normalizada === "") {
      return null;
    }

    const metros = Number(normalizada);
    return Number.isNaN(metros) ? null : metros;
  }

  private static tieneHastaDosDecimales(metros: number): boolean {
    return Number.isInteger(Number((metros * 100).toFixed(6)));
  }

  esIgualA(otro: MetrosCano): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor.toString();
  }
}
