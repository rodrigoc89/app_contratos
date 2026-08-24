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
  // Task 21: the login screen confirms an explicit logout distinctly from a
  // mid-visit expiry. That reason now lives inside `usarCierreDeSesion`,
  // shared with `CabeceraDeSesion`: this screen's handler was a copy of the
  // header's, made before PR #61 fixed the header, and a copy inherits a
  // shape but not its later corrections.
  const salir = usarCierreDeSesion();

  return (
    <div className="p-6" data-panel-no-disponible>
      <p>Todavía no hay un panel disponible para su rol.</p>
      {/* `void` rather than passing `salir` straight through: `onClick`
          expects a void return, and handing React an async function makes it
          discard a promise it never inspects. */}
      <Boton onClick={() => void salir()}>Cerrar sesión</Boton>
    </div>
  );
}
