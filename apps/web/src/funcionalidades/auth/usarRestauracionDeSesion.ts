import { useEffect, useState } from "react";

import { obtenerTokenDeRefrescoGuardado } from "../../datos/sesion/almacenSesion";
import { obtenerSesionActual } from "../../datos/sesion/estadoSesion";
import { refrescarSesion } from "../../datos/sesion/refresco";

/**
 * Task 22, spec `web-auth-session` / DESIGN.md D4 — the cold-start restore.
 *
 * A page load starts with no in-memory session (`estadoSesion.ts`'s module
 * state resets on every reload) but a refresh token may still be sitting in
 * `localStorage` from a previous visit (`almacenSesion.ts`) — that promise
 * was previously undelivered: nothing ever read it back (Engram observation
 * #53). This hook is the one production caller that closes the gap. It
 * calls `refrescarSesion()`, the same single-flight mutex `clienteHttp`'s
 * 401 interceptor already funnels through (DESIGN.md D4), so a boot
 * restore and a mid-visit refresh can never present two different tokens.
 *
 * `restaurando` starts `true` synchronously — before the first paint —
 * only when there is a stored token and no in-memory session yet. That is
 * what stops `GuardiaDeSesion` from ever rendering the login screen for a
 * técnico whose session is about to be restored. When there is nothing to
 * restore it starts `false`, so every existing test that never touches
 * `almacenSesion.ts` sees no behaviour change.
 */
export function usarRestauracionDeSesion(): boolean {
  const [restaurando, establecerRestaurando] = useState(
    () => obtenerSesionActual() === null && obtenerTokenDeRefrescoGuardado() !== null,
  );

  useEffect(() => {
    if (!restaurando) {
      return;
    }
    let cancelado = false;
    void refrescarSesion()
      .catch(() => {
        // `ejecutarRefresco` (refresco.ts) already cleared the in-memory
        // session and the dead stored token on a refused refresh
        // (task 22) — nothing further to do here.
      })
      .finally(() => {
        if (!cancelado) {
          establecerRestaurando(false);
        }
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount while `restaurando` starts true; it never flips back to true afterwards.
  }, []);

  return restaurando;
}
