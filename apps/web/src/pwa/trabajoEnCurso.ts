/**
 * DESIGN.md D9 — the mid-visit registry backing `hayTrabajoEnCurso`: "any
 * contract open, any signature captured, any unflushed autosave" suppresses
 * the PWA update prompt. A module-level singleton, same pattern as
 * `datos/sesion/estadoSesion.ts` — precisely so callers outside React
 * (`ColaDeGuardado`) and inside it (`EnvioDeFirma`) mark the same registry
 * without threading a prop or a context down to either.
 *
 * A `Set` of independent keys, not one boolean: two callers can each have
 * their own reason to be "in progress" at once (an unflushed edit AND an
 * open signing step), and the registry must stay true until every one of
 * them clears its own key — not just the last one to change state.
 */
const CLAVES_ACTIVAS = new Set<string>();

export function marcarTrabajoEnCurso(clave: string, activo: boolean): void {
  if (activo) {
    CLAVES_ACTIVAS.add(clave);
  } else {
    CLAVES_ACTIVAS.delete(clave);
  }
}

export function hayTrabajoEnCurso(): boolean {
  return CLAVES_ACTIVAS.size > 0;
}

/** Test-only reset. Also safe to call in production at a hard boundary (none currently calls it). */
export function limpiarTrabajoEnCurso(): void {
  CLAVES_ACTIVAS.clear();
}
