/**
 * Folds a name down to a comparable, storage-neutral form: lowercase, no
 * acute/diaeresis, `ñ` untouched.
 *
 * Zero imports, no I/O, no clock — this is the one pure function the whole
 * search feature hangs off (DESIGN.md D1). It is called from exactly four
 * places — the write mapper, the query interpreter, the backfill and the
 * in-memory test double — and every one of them must produce the same
 * output for the same input, or the write path and the search path store
 * and query different bytes for the same name.
 *
 * **`ñ` is deliberately protected, not merely left alone.** The idiomatic
 * `.normalize("NFD").replace(/\p{Diacritic}/gu, "")` decomposes `ñ`
 * (U+00F1) into `n` + U+0303 (combining tilde) exactly like every other
 * accented letter, then deletes the combining mark — silently turning `ñ`
 * into `n`. Step 3 below is the one line that keeps that from happening: it
 * drops every combining mark in the diacritic block EXCEPT a combining
 * tilde riding on an `n`.
 *
 * Exact rule sequence (order is load-bearing — see DESIGN.md D1):
 *   1. `NFD`-decompose, so a precomposed `ñ` (U+00F1) and an already
 *      decomposed `n` + U+0303 become byte-identical before anything else
 *      inspects them.
 *   2. Lowercase, so step 3's check is a single comparison against `"n"`.
 *   3. Walk the code points, keeping every non-mark character and every
 *      combining tilde (U+0303) whose immediately preceding retained
 *      character is `"n"`; every other mark in the U+0300–U+036F diacritic
 *      block is dropped without moving the cursor.
 *   4. `NFC`-recompose, so a surviving `n` + U+0303 becomes `ñ` again. This
 *      is also what makes the stored column and a search term agree in
 *      Postgres: `LIKE` is byte-exact and performs no Unicode
 *      normalisation of its own.
 *   5. Collapse whitespace runs to one space and trim.
 */

/** The Unicode combining-diacritical-marks block NFD ever produces here. */
const MARCA_DIACRITICA_INICIO = 0x0300;
const MARCA_DIACRITICA_FIN = 0x036f;

/** Combining tilde (U+0303) — the one mark this function refuses to drop. */
const TILDE_COMBINANTE = 0x0303;

const BASE_QUE_PROTEGE_LA_TILDE = "n";

export function normalizarTexto(valor: string): string {
  const descompuesto = valor.normalize("NFD").toLowerCase();

  let resultado = "";
  let ultimaBaseRetenida = "";

  for (const caracter of descompuesto) {
    const puntoDeCodigo = caracter.codePointAt(0) ?? 0;
    const esMarcaDiacritica =
      puntoDeCodigo >= MARCA_DIACRITICA_INICIO &&
      puntoDeCodigo <= MARCA_DIACRITICA_FIN;

    if (esMarcaDiacritica) {
      if (
        puntoDeCodigo === TILDE_COMBINANTE &&
        ultimaBaseRetenida === BASE_QUE_PROTEGE_LA_TILDE
      ) {
        resultado += caracter;
      }
      // Every other mark is dropped and the cursor does not move: the
      // character right before it stays the "last retained base" for
      // whatever mark comes next.
      continue;
    }

    resultado += caracter;
    ultimaBaseRetenida = caracter;
  }

  return resultado.normalize("NFC").replace(/\s+/g, " ").trim();
}
