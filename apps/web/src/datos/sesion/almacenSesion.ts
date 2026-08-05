/**
 * Persists only the refresh token, in `localStorage`, over
 * `estadoSesion.ts`'s in-memory-only holder (DESIGN.md D4: "access token in
 * memory only; refresh token in localStorage"). An OS-level kill of the PWA
 * would otherwise force a technician to re-authenticate in a customer's
 * home.
 *
 * Deliberately narrow: never the access token, never a signature, never
 * form data. Listed in `convencionDeAlmacenamiento.spec.ts`'s allowlist —
 * the one visible exception to "storage APIs live under `almacenamiento/`".
 */
const CLAVE_TOKEN_DE_REFRESCO = "contratos.sesion.tokenDeRefresco";

export function guardarTokenDeRefresco(tokenDeRefresco: string): void {
  localStorage.setItem(CLAVE_TOKEN_DE_REFRESCO, tokenDeRefresco);
}

export function obtenerTokenDeRefrescoGuardado(): string | null {
  return localStorage.getItem(CLAVE_TOKEN_DE_REFRESCO);
}

export function borrarTokenDeRefrescoGuardado(): void {
  localStorage.removeItem(CLAVE_TOKEN_DE_REFRESCO);
}
