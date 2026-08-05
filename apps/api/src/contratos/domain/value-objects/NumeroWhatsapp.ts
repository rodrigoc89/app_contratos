import { DomainError } from "../../../shared/domain/DomainError";

const CODIGO_PAIS = "54";
const MARCA_MOVIL = "9";
const LARGO_NACIONAL = 10;

/**
 * Argentine mobile number used to deliver the signed contract over WhatsApp.
 *
 * The technician types whatever the customer dictates, and Argentines dictate
 * their number in at least five different ways: with the trunk zero, with the
 * legacy "15" mobile prefix, with or without the country code. All of them
 * mean the same phone, and WhatsApp only accepts one of them, so normalising
 * here is what keeps a contract from failing to reach its owner.
 *
 * Only Argentine numbers are accepted: the field fleet installs locally, and a
 * foreign number is far more likely to be a typing slip than a real customer.
 */
export class NumeroWhatsapp {
  private constructor(private readonly nacional: string) {}

  static crear(entrada: string): NumeroWhatsapp {
    const nacional = NumeroWhatsapp.aNumeroNacional((entrada ?? "").trim());

    if (nacional === null) {
      throw new DomainError(
        `El número de WhatsApp "${entrada}" no es válido: ingresá el código de área y el número, sin el 0 y sin el 15. Por ejemplo 385 4123456.`,
      );
    }

    return new NumeroWhatsapp(nacional);
  }

  /**
   * Reduces any accepted shape to the bare 10-digit national number
   * (area code + subscriber), or null when it cannot be one.
   */
  private static aNumeroNacional(entrada: string): string | null {
    let digitos = entrada.replace(/\D/g, "");

    if (digitos.startsWith("00")) {
      digitos = digitos.slice(2);
    }
    if (digitos.startsWith(CODIGO_PAIS)) {
      digitos = digitos.slice(CODIGO_PAIS.length);
    }
    // The mobile nine only ever precedes a full national number.
    if (digitos.startsWith(MARCA_MOVIL) && digitos.length > LARGO_NACIONAL) {
      digitos = digitos.slice(1);
    }
    if (digitos.startsWith("0")) {
      digitos = digitos.slice(1);
    }
    if (digitos.length === LARGO_NACIONAL + 2) {
      digitos = NumeroWhatsapp.sinPrefijoQuince(digitos) ?? digitos;
    }

    return digitos.length === LARGO_NACIONAL ? digitos : null;
  }

  /**
   * Removes the legacy "15" that sits between the area code and the
   * subscriber number. Argentine area codes are 2 to 4 digits long and the
   * national number is always 10, so the only workable approach is to try
   * each position and keep the one that produces a valid length.
   */
  private static sinPrefijoQuince(digitos: string): string | null {
    for (const inicioArea of [2, 3, 4]) {
      if (digitos.slice(inicioArea, inicioArea + 2) === "15") {
        return digitos.slice(0, inicioArea) + digitos.slice(inicioArea + 2);
      }
    }
    return null;
  }

  /** E.164 form, e.g. "+5493854123456". */
  get valor(): string {
    return `+${this.paraProveedor}`;
  }

  /** Digits only, which is what the WhatsApp Cloud API expects. */
  get paraProveedor(): string {
    return `${CODIGO_PAIS}${MARCA_MOVIL}${this.nacional}`;
  }

  esIgualA(otro: NumeroWhatsapp): boolean {
    return this.nacional === otro.nacional;
  }

  toString(): string {
    return this.valor;
  }
}
