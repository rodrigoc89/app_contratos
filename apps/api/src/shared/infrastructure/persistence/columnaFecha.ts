import { FechaCalendario } from "../../domain/FechaCalendario";

/**
 * Converts between {@link FechaCalendario} — a wall-calendar date with no
 * timezone — and the `Date` objects that flow through a Postgres `@db.Date`
 * column via Prisma.
 *
 * Postgres hands back (and expects) those columns as an instant at UTC
 * midnight. Reading it with the host's LOCAL date components
 * (`getFullYear`/`getMonth`/`getDate`) would shift the day backwards on any
 * machine west of UTC — which is every machine this API runs on, per
 * DESIGN.md. Every read and write of a `@db.Date` column must go through
 * these two functions, using the UTC-suffixed `Date` methods exclusively, so
 * the result never depends on the host timezone.
 */

/** Builds the UTC-midnight `Date` a `@db.Date` column expects. */
export function columnaFechaDesde(fecha: FechaCalendario): Date {
  return new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia));
}

export function columnaFechaDesdeOrNull(fecha: FechaCalendario | null): Date | null {
  return fecha === null ? null : columnaFechaDesde(fecha);
}

/** Reads a `@db.Date` column's UTC-midnight instant back as a calendar date. */
export function fechaCalendarioDesdeColumna(columna: Date): FechaCalendario {
  return FechaCalendario.crear(
    columna.getUTCFullYear(),
    columna.getUTCMonth() + 1,
    columna.getUTCDate(),
  );
}

export function fechaCalendarioDesdeColumnaOrNull(
  columna: Date | null,
): FechaCalendario | null {
  return columna === null ? null : fechaCalendarioDesdeColumna(columna);
}
