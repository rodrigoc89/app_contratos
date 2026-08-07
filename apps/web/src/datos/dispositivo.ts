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

export function obtenerDispositivoId(): string {
  const existente = localStorage.getItem(CLAVE_DISPOSITIVO_ID);
  if (existente !== null) {
    return existente;
  }

  const nuevo = crypto.randomUUID();
  localStorage.setItem(CLAVE_DISPOSITIVO_ID, nuevo);
  return nuevo;
}
