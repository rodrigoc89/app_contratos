import { Boton } from "../../../componentes/atomos/Boton";
import { MarcaProducto } from "../../../componentes/atomos/MarcaProducto";
import { usarCierreDeSesion } from "../usarCierreDeSesion";
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
  const sesion = usarSesionActual();
  const nombre = nombreUsuario ?? sesion?.usuario.nombreUsuario ?? "";
  // `usarCierreDeSesion` owns the leaving AND the confirmation the login
  // screen shows on arrival — the same unit `PanelNoDisponible` calls, so
  // neither the rejection handling PR #61 added here nor that message can go
  // missing from one control and not the other again.
  const salir = usarCierreDeSesion();

  return (
    <header className="cabecera-sesion">
      <MarcaProducto />
      <span className="cabecera-sesion__usuario">{nombre}</span>
      <Boton type="button" onClick={() => void salir()}>
        Cerrar sesión
      </Boton>
    </header>
  );
}
