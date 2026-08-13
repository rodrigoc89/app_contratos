/**
 * DESIGN.md D8/R8 — the tablet's own generated identifier. It is forensic
 * evidence recorded in `ContextoDeFirma` alongside `firmar`'s request, but a
 * weaker claim than it looks: it survives an app kill (it lives in
 * `localStorage`, not memory) but not a reinstall or a storage clear.
 * Accepted for Phase 1 — the stronger identity claim is the técnico's own,
 * and that one comes from the verified token, never from anything the
 * client sends (see `ContratosController.firmar`'s own note).
 *
 * Listed in `convencionDeAlmacenamiento.spec.ts`'s allowlist — the storage
 * confinement guard's one other visible exception besides
 * `datos/sesion/almacenSesion.ts`.
 */
const CLAVE_DISPOSITIVO_ID = "contratos.dispositivo.id";

/**
 * `crypto.randomUUID` exists only in a secure context, and calling it outside
 * one throws rather than returning undefined. That threw inside the assembly
 * of the signing request, before the `fetch` — so the técnico saw "Error
 * inesperado. No se pudo firmar el contrato", the request never left the
 * device, and the server log stayed clean because nothing reached it.
 *
 * `EsquemaFirmarContrato` already states the principle this broke, about the
 * field right next to this one: *"a denied location permission must never
 * stop an installation from being closed."* A device identifier is the same
 * kind of evidence, and it must not be what stops a signature either. It is
 * forensic garnish; the identity claim that matters is the técnico's, and
 * that comes from the verified token.
 *
 * `crypto.getRandomValues` carries no such restriction, so the fallback is
 * still cryptographically strong — just without the convenience wrapper.
 * `Math.random()` is deliberately not a third rung: an identifier that looks
 * authoritative and is not is worse evidence than one that admits what it is.
 */
function generarIdentificador(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // No source of randomness worth the name. Say so in the record rather than
  // invent an identifier: every device answering this shares one value, which
  // is exactly what the string admits.
  return "dispositivo-sin-identificador";
}

export function obtenerDispositivoId(): string {
  const existente = localStorage.getItem(CLAVE_DISPOSITIVO_ID);
  if (existente !== null) {
    return existente;
  }

  const nuevo = generarIdentificador();
  localStorage.setItem(CLAVE_DISPOSITIVO_ID, nuevo);
  return nuevo;
}
