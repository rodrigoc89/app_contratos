import { useNavigate } from "react-router-dom";

import type { MotivoCierreDeSesion } from "../../datos/sesion/estadoSesion";
import { cerrarSesion } from "../../datos/sesion/sesion";

/** Named so the union in `estadoSesion` keeps type-checking this value. */
const MOTIVO: MotivoCierreDeSesion = "cierre_explicito";

/**
 * The one way out of the app (DESIGN.md D4/D8).
 *
 * Both logout controls — `CabeceraDeSesion`'s header button and the
 * `PanelNoDisponible` fallback screen — used to carry their own copy of
 * "await `cerrarSesion`, then navigate to `/login`". That duplication was
 * not harmless: PR #61 taught the header to survive a rejecting
 * `cerrarSesion`, and the copy, written earlier, never inherited the fix and
 * kept stranding the person on the screen they had just tapped to leave. A
 * third copy would have repeated it. There is one copy now.
 *
 * The reason is carried unconditionally, and used to be a parameter only
 * because the header passed none — so leaving from the header, the control
 * almost everyone taps, landed on a silent login screen while the fallback
 * screen confirmed the very same action. `PaginaLogin` shows its
 * confirmation from router state alone (`motivoDesdeEstado`), never from
 * `obtenerMotivoUltimoCierre()`, so the message exists only if this
 * navigation carries it. Every caller of this hook is a person deliberately
 * tapping "Cerrar sesión"; an expiry reaches `/login` through
 * `GuardiasDeRuta` instead, with its own reason. There is nothing left for a
 * caller to decide.
 *
 * Returns the handler rather than performing anything itself, because the
 * two screens differ entirely in their surroundings — a header with a
 * username, versus a standalone screen — and only the leaving is shared.
 */
export function usarCierreDeSesion(): () => Promise<void> {
  const navegar = useNavigate();

  return async function salir(): Promise<void> {
    try {
      await cerrarSesion();
    } catch {
      // Swallowed on purpose. `cerrarSesion` already handles the logout
      // request failing on its own, so the network is not what reaches here;
      // the local cleanup before it is — `borrarTokenDeRefrescoGuardado`
      // reaches for `localStorage`, which raises a SecurityError when the
      // browser blocks storage. By then the in-memory session is already
      // cleared, so leaving is the only sensible outcome: there is nothing
      // to decide and nothing to tell the person holding the tablet.
      //
      // It cannot simply be left uncaught: both call sites discard the
      // promise with `void`, and `void` only evaluates its operand and
      // throws the value away — it attaches no rejection handler. That is
      // exactly how this escaped as a browser `unhandledrejection` while
      // every test assertion stayed green.
      //
      // Nothing is logged either: this path runs while holding session and
      // customer data, and Ley 25.326 keeps DNI, phone numbers and GPS
      // coordinates out of anything we write down.
    } finally {
      // In the `finally` because `cerrarSesion` clears local state before
      // anything that can throw (DESIGN.md D4) — a failure must never trap
      // someone in a session they asked to leave. Leaving happens either way.
      //
      // The reason travels in router state and nowhere else: it names an
      // action, not a person, so nothing here carries customer data
      // (Ley 25.326), and `PaginaLogin` reads it from exactly this spot.
      //
      // `void` because under `RouterProvider` (a data router, see
      // `rutas/enrutador.tsx`) `navegar` returns `Promise<void>` that settles
      // once the login route's loaders have run. This is the last statement
      // of a `finally`, nothing reads the result, and awaiting it would only
      // delay resolving `salir()` — which both call sites already discard.
      void navegar("/login", { replace: true, state: { motivo: MOTIVO } });
    }
  };
}
