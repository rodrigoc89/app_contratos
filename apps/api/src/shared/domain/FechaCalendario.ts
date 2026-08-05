import { DomainError } from "./DomainError";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const NOMBRES_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/**
 * A calendar date — a day on a wall calendar, with no time and no timezone.
 *
 * A comodato is signed on a date and expires on a date. Modelling those with
 * `Date` would tie them to an instant: a contract signed at 21:30 in Santiago
 * del Estero is already the following day in UTC, which would shift both the
 * printed date and the expiry that governs equipment restitution by one day.
 *
 * Deliberately dependency-free so the domain layer stays pure.
 */
export class FechaCalendario {
  private constructor(
    readonly anio: number,
    readonly mes: number,
    readonly dia: number,
  ) {}

  static crear(anio: number, mes: number, dia: number): FechaCalendario {
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
      throw new DomainError(
        `La fecha ${anio}-${mes}-${dia} no es válida: año, mes y día tienen que ser números enteros.`,
      );
    }
    if (mes < 1 || mes > 12) {
      throw new DomainError(`La fecha ${anio}-${mes}-${dia} no es válida: el mes tiene que estar entre 1 y 12.`);
    }
    if (dia < 1 || dia > FechaCalendario.diasEnMes(anio, mes)) {
      throw new DomainError(
        `La fecha ${anio}-${mes}-${dia} no es válida: ese mes no tiene ese día.`,
      );
    }

    return new FechaCalendario(anio, mes, dia);
  }

  static desdeIso(iso: string): FechaCalendario {
    const partes = ISO.exec((iso ?? "").trim());
    if (partes === null) {
      throw new DomainError(
        `La fecha "${iso}" no es válida: se espera el formato AAAA-MM-DD.`,
      );
    }

    const [, anio, mes, dia] = partes as unknown as [string, string, string, string];
    return FechaCalendario.crear(Number(anio), Number(mes), Number(dia));
  }

  /**
   * Reads an instant as the calendar date it was in a given timezone. This is
   * how a server timestamp becomes the date printed on the contract.
   */
  static enZona(instante: Date, zonaHoraria: string): FechaCalendario {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: zonaHoraria,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instante);

    const leer = (tipo: Intl.DateTimeFormatPartTypes): number => {
      const parte = partes.find((p) => p.type === tipo);
      if (parte === undefined) {
        throw new DomainError(
          `No se pudo leer la fecha en la zona horaria "${zonaHoraria}".`,
        );
      }
      return Number(parte.value);
    };

    return FechaCalendario.crear(leer("year"), leer("month"), leer("day"));
  }

  /**
   * Adds whole months, clamping to the last day when the target month is
   * shorter — the 31st of January plus one month is the 28th of February.
   */
  sumarMeses(meses: number): FechaCalendario {
    if (!Number.isInteger(meses)) {
      throw new DomainError("Solo se pueden sumar meses enteros.");
    }

    const totalMeses = this.anio * 12 + (this.mes - 1) + meses;
    const anio = Math.floor(totalMeses / 12);
    const mes = (totalMeses % 12) + 1;
    const dia = Math.min(this.dia, FechaCalendario.diasEnMes(anio, mes));

    return new FechaCalendario(anio, mes, dia);
  }

  private static diasEnMes(anio: number, mes: number): number {
    // Day zero of the next month is the last day of this one. UTC keeps the
    // host timezone out of the calculation.
    return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  }

  esIgualA(otra: FechaCalendario): boolean {
    return this.iso === otra.iso;
  }

  esAnteriorA(otra: FechaCalendario): boolean {
    return this.iso < otra.iso;
  }

  /** ISO form, e.g. "2026-08-04". Sortable as a plain string. */
  get iso(): string {
    const mes = String(this.mes).padStart(2, "0");
    const dia = String(this.dia).padStart(2, "0");
    return `${this.anio}-${mes}-${dia}`;
  }

  /** Argentine form used on the printed contract, e.g. "04/08/2026". */
  get formateado(): string {
    const mes = String(this.mes).padStart(2, "0");
    const dia = String(this.dia).padStart(2, "0");
    return `${dia}/${mes}/${this.anio}`;
  }

  /** Spanish month name, for "a los ___ días del mes de ___ del año 20__". */
  get nombreMes(): string {
    return NOMBRES_MES[this.mes - 1] as string;
  }

  toString(): string {
    return this.iso;
  }
}
