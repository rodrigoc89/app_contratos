import { normalizarDni } from "@contratos/esquemas";

import { normalizarTexto } from "../../shared/domain/normalizarTexto";

/**
 * One search box, dispatched once to exactly one query — never re-decided by
 * an adapter.
 *
 * `BuscarContratos` calls this exactly once and hands the result to
 * `ContratoRepository.buscar`, so neither `PrismaContratoRepository` nor
 * `ContratosEnMemoria` can interpret the same raw string differently.
 */
export type TerminoInterpretado =
  | { readonly tipo: "dni"; readonly digitos: string }
  | { readonly tipo: "nombre"; readonly normalizado: string };

const SOLO_DIGITOS = /^\d+$/;

/**
 * Prisma's `contains` compiles to `LIKE '%' || $1 || '%'`: parameterised, so
 * not an injection, but `%` and `_` inside the value are still live LIKE
 * wildcards there while `String.includes` in `ContratosEnMemoria` treats
 * them literally. Stripped here — once, before either adapter ever sees the
 * term — so both sides stay identical (DESIGN.md D5). The backslash is
 * stripped too: it is `LIKE`'s escape character, and a stray one changes
 * how the character after it is read.
 */
const CARACTERES_COMODIN = /[%_\\]/g;

/**
 * Dispatch rule, in order (R-1.4):
 *   1. Apply `normalizarDni` — the same rule the domain uses to store a DNI
 *      (dots and whitespace only). A search that accepted separators the
 *      write path rejects could produce a term no stored value can match.
 *   2. Non-empty and every character a digit → a `dni` term.
 *   3. Otherwise, a non-empty `normalizarTexto(termino)` → a `nombre` term.
 *   4. Otherwise → `null`, meaning "no filter".
 *
 * A name can never be all digits, so digits winning the tie-break loses
 * nothing real — a purely numeric name is simply unreachable by name search.
 */
export function interpretarTerminoDeBusqueda(
  termino: string,
): TerminoInterpretado | null {
  const comoDni = normalizarDni(termino ?? "");
  if (comoDni !== "" && SOLO_DIGITOS.test(comoDni)) {
    return { tipo: "dni", digitos: comoDni };
  }

  const normalizado = normalizarTexto(termino ?? "").replace(
    CARACTERES_COMODIN,
    "",
  );

  return normalizado === "" ? null : { tipo: "nombre", normalizado };
}
