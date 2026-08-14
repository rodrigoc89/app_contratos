import { Boton } from "../../../componentes/atomos/Boton";
import { usarCierreDeSesion } from "../usarCierreDeSesion";

/**
 * R-3.2 (DESIGN.md D10) — `oficina`/`admin` no longer land here: PR2 gives
 * them `/contratos` directly. This screen survives as `rutaInicialPara`'s
 * unknown-role fallback only, so its copy stopped naming the office —
 * naming it now would be false the moment any recognized role has its own
 * home. It exists so an unrecognized role never reads as a broken login.
 */
export function PanelNoDisponible() {
  // Task 21: carries the explicit-logout reason so `PaginaLogin` shows a
  // confirmation distinct from a mid-visit expiry, same as the reactive
  // redirect `GuardiaDeSesion` would otherwise perform on its own.
  //
  // The leaving itself lives in `usarCierreDeSesion`, shared with
  // `CabeceraDeSesion`: this screen's handler was a copy of the header's,
  // made before PR #61 fixed the header, and a copy inherits a shape but not
  // its later corrections.
  const salir = usarCierreDeSesion("cierre_explicito");

  return (
    <div className="panel-no-disponible">
      <p>Todavía no hay un panel disponible para su rol.</p>
      {/* `void` rather than passing `salir` straight through: `onClick`
          expects a void return, and handing React an async function makes it
          discard a promise it never inspects. */}
      <Boton onClick={() => void salir()}>Cerrar sesión</Boton>
    </div>
  );
}
