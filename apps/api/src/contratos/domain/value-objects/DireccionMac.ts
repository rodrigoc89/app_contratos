import { DomainError } from "../../../shared/domain/DomainError";

const SEPARADORES = /[:\-.\s]/g;
const DOCE_HEX = /^[0-9A-F]{12}$/;

/**
 * MAC address of the antenna handed over in comodato.
 *
 * This is the only field that ties a signed contract to the physical device
 * the company may later need to reclaim, so it is normalised aggressively:
 * barcodes, stickers and hand typing all produce different shapes of the same
 * address.
 */
export class DireccionMac {
  private constructor(readonly valor: string) {}

  static crear(entrada: string): DireccionMac {
    const hex = (entrada ?? "").replace(SEPARADORES, "").toUpperCase();

    if (!DOCE_HEX.test(hex)) {
      throw new DomainError(
        `La dirección MAC "${entrada}" no es válida: tiene que tener 12 dígitos hexadecimales, por ejemplo AC:8B:A9:12:34:56.`,
      );
    }

    return new DireccionMac(DireccionMac.conDosPuntos(hex));
  }

  private static conDosPuntos(hex: string): string {
    const pares: string[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      pares.push(hex.slice(i, i + 2));
    }
    return pares.join(":");
  }

  esIgualA(otro: DireccionMac): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
