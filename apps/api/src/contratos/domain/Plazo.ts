import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";

/** Ten years, as agreed with the business. Clause SEGUNDA reads in months. */
export const PLAZO_ESTANDAR_MESES = 120;

/**
 * Term of the comodato (clause SEGUNDA).
 *
 * The expiry date is always derived, never supplied. It is the date that
 * triggers the obligation to return the equipment, so letting anyone type it
 * would put the company's most important deadline at the mercy of a typo.
 */
export class Plazo {
  private constructor(
    readonly fechaInicio: FechaCalendario,
    readonly meses: number,
    readonly fechaVencimiento: FechaCalendario,
  ) {}

  static crear(fechaInicio: FechaCalendario, meses: number): Plazo {
    if (!Number.isInteger(meses) || meses <= 0) {
      throw new DomainError(
        `El plazo de ${meses} no es válido: tiene que ser una cantidad entera de meses mayor a cero.`,
      );
    }

    return new Plazo(fechaInicio, meses, fechaInicio.sumarMeses(meses));
  }

  static estandarDesde(fechaInicio: FechaCalendario): Plazo {
    return Plazo.crear(fechaInicio, PLAZO_ESTANDAR_MESES);
  }

  /**
   * Clause SEGUNDA extinguishes the contract on the expiry date, so the term
   * is still running on that day and lapses the day after.
   */
  estaVencidoAl(fecha: FechaCalendario): boolean {
    return this.fechaVencimiento.esAnteriorA(fecha);
  }
}
