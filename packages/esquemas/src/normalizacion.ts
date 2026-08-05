/**
 * The normalisation rules the contract's value objects apply, restated as
 * plain functions the browser can run.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Read this before touching anything in this file.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * **The domain is the authority.** `Dni`, `DireccionMac`, `MetrosCano` and
 * `NumeroWhatsapp` in `apps/api/src/contratos/domain` decide what a valid
 * value is. What lives here is a *pre-check*, so the technician learns about a
 * mistyped DNI while the field still has focus instead of after the customer
 * has already signed — which DESIGN.md §5.1 calls the worst failure this
 * system has.
 *
 * The direction that matters is therefore one-way: **everything the domain
 * rejects, this must reject too.** The reverse is allowed to drift a little —
 * a schema that is slightly stricter costs a technician one retype; a schema
 * that is looser costs a customer a second visit to their house.
 *
 * That direction is not left to discipline. `apps/api` has a test
 * (`esquemasContraDominio.spec.ts`) that feeds every rejection case the domain
 * unit tests use through these very functions and fails if either side lets
 * something through the other refuses.
 */

// ---------------------------------------------------------------------- DNI

const SEPARADORES_DNI = /[.\s]/g;
const DIGITOS_DNI = /^\d{7,8}$/;

/** Mirrors `Dni.crear`: dots and whitespace are noise, not data. */
export function normalizarDni(entrada: string): string {
  return entrada.replace(SEPARADORES_DNI, "");
}

export function esDniValido(entrada: string): boolean {
  return DIGITOS_DNI.test(normalizarDni(entrada));
}

// ---------------------------------------------------------------------- MAC

const SEPARADORES_MAC = /[:\-.\s]/g;
const DOCE_HEX = /^[0-9A-F]{12}$/;

/** Mirrors `DireccionMac.crear`: colons, hyphens, dots and spaces all go. */
export function normalizarDireccionMac(entrada: string): string {
  return entrada.replace(SEPARADORES_MAC, "").toUpperCase();
}

export function esDireccionMacValida(entrada: string): boolean {
  return DOCE_HEX.test(normalizarDireccionMac(entrada));
}

// ------------------------------------------------------------ metros de caño

/** Mirrors `MetrosCano`: no installation has a mast this long. */
export const MAXIMO_METROS_CANO = 200;

/**
 * Mirrors `MetrosCano.aNumero`. A Spanish keyboard yields "7,5" and an
 * `input[type=number]` yields "7.5"; both mean the same seven and a half
 * metres.
 */
export function metrosCanoANumero(entrada: number | string): number | null {
  if (typeof entrada === "number") {
    return entrada;
  }

  const normalizada = entrada.trim().replace(",", ".");
  if (normalizada === "") {
    return null;
  }

  const metros = Number(normalizada);
  return Number.isNaN(metros) ? null : metros;
}

export function tieneHastaDosDecimales(metros: number): boolean {
  return Number.isInteger(Number((metros * 100).toFixed(6)));
}

// ---------------------------------------------------------------- WhatsApp

const CODIGO_PAIS = "54";
const MARCA_MOVIL = "9";
const LARGO_NACIONAL = 10;

/**
 * Mirrors `NumeroWhatsapp.aNumeroNacional`: reduces every shape an Argentine
 * dictates their number in — trunk zero, legacy "15", country code, the
 * mobile nine — to the bare ten national digits, or `null` when it cannot be
 * one.
 */
export function numeroWhatsappNacional(entrada: string): string | null {
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
    digitos = sinPrefijoQuince(digitos) ?? digitos;
  }

  return digitos.length === LARGO_NACIONAL ? digitos : null;
}

/**
 * Argentine area codes are 2 to 4 digits and the national number is always
 * 10, so the only workable approach is to try each position and keep the one
 * that produces a valid length.
 */
function sinPrefijoQuince(digitos: string): string | null {
  for (const inicioArea of [2, 3, 4]) {
    if (digitos.slice(inicioArea, inicioArea + 2) === "15") {
      return digitos.slice(0, inicioArea) + digitos.slice(inicioArea + 2);
    }
  }
  return null;
}

export function esNumeroWhatsappValido(entrada: string): boolean {
  return numeroWhatsappNacional(entrada) !== null;
}
