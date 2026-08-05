import { DomainError } from "./DomainError";

/**
 * Trims a mandatory text field, failing with a message that names the field.
 *
 * The technician reads these errors standing next to the customer, so the
 * message has to point at the box to fix.
 */
export function textoRequerido(valor: string, campo: string): string {
  const limpio = (valor ?? "").trim();

  if (limpio === "") {
    throw new DomainError(`El campo ${campo} es obligatorio.`);
  }

  return limpio;
}
