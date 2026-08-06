import { Boton } from "../atomos/Boton";

interface PropiedadesAvisoDeActualizacion {
  /** Never true while `hayTrabajoEnCurso()` was true at the last check (DESIGN.md D9) — owned entirely by the caller. */
  readonly visible: boolean;
  readonly onAplicar: () => void;
}

/**
 * DESIGN.md D9's discreet, tap-to-apply affordance. Presentational only —
 * takes `visible`/`onAplicar` as props, decides nothing about whether it is
 * safe to show itself. That decision lives in `pwa/actualizacion.ts` and is
 * threaded in by `app/usePwaUpdate.ts`.
 */
export function AvisoDeActualizacion({ visible, onAplicar }: PropiedadesAvisoDeActualizacion) {
  if (!visible) {
    return null;
  }

  return (
    <div role="status">
      <p>Hay una versión nueva disponible.</p>
      <Boton type="button" onClick={onAplicar}>
        Actualizar
      </Boton>
    </div>
  );
}
