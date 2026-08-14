import { useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { cerrarSesion } from "../../../datos/sesion/sesion";
import { usarSesionActual } from "../usarSesionActual";

/**
 * Who is signed in, and the way out.
 *
 * Until this existed the only logout control in the app was on
 * `PanelNoDisponible` — the screen a role with no panel lands on — so a
 * técnico on the tablet and an office user on the panel had none at all.
 *
 * On a shared device that is not a convenience. `cerrarSesion` revokes the
 * whole refresh-token family server-side and clears the local draft
 * (DESIGN.md D4/D8), because a tablet passes between technicians and a
 * customer's DNI must not outlive the visit that captured it. A logout
 * nobody can reach is that protection existing on paper only.
 *
 * The username is shown for the same reason: on a device several people use,
 * "whose session is this?" has to be answerable without clicking anything.
 */
export function CabeceraDeSesion({ nombreUsuario }: { readonly nombreUsuario?: string } = {}) {
  const navegar = useNavigate();
  const sesion = usarSesionActual();
  const nombre = nombreUsuario ?? sesion?.usuario.nombreUsuario ?? "";

  async function salir(): Promise<void> {
    try {
      await cerrarSesion();
    } catch {
      // Swallowed on purpose. `cerrarSesion` already handles the logout
      // request failing; what can still reach here is the local cleanup
      // throwing before it — `localStorage` raises a SecurityError when the
      // browser blocks storage — and by then leaving is still the only
      // sensible outcome, so there is nothing to decide and nothing to tell
      // the person on the tablet.
      //
      // It cannot be left uncaught: the click handler discards the promise
      // with `void`, and `void` only evaluates its operand and throws the
      // value away — it attaches no rejection handler. So the rejection
      // escaped the component as a browser `unhandledrejection` (and made the
      // test process exit non-zero with every assertion green).
      //
      // Nothing is logged here either: this path runs while holding session
      // and customer data, and Ley 25.326 keeps DNI, phone numbers and GPS
      // coordinates out of anything we write down.
    } finally {
      // `cerrarSesion` clears local state before awaiting the request, so a
      // network failure must not strand someone in a session they asked to
      // leave. Leaving happens either way.
      navegar("/login", { replace: true });
    }
  }

  return (
    <header className="cabecera-sesion">
      <span className="cabecera-sesion__usuario">{nombre}</span>
      <Boton type="button" onClick={() => void salir()}>
        Cerrar sesión
      </Boton>
    </header>
  );
}
