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
 *
 * design-system-migration PR11 — visual redesign. Previously unstyled
 * (neither `estilos/organismos.css` nor `panel.css` ever declared a rule for
 * it). `Boton`'s existing outlined `secundario` variant supplies the
 * "discreet" register D9 asks for without inventing new CSS — the same
 * reuse-over-invention precedent PR10 set for `BarraDeBusqueda`'s chips.
 */
export function AvisoDeActualizacion({ visible, onAplicar }: PropiedadesAvisoDeActualizacion) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-between gap-3 rounded-base border-2 border-borde-suave bg-fondo p-4 text-texto"
    >
      <p className="m-0">Hay una versión nueva disponible.</p>
      <Boton type="button" variante="secundario" onClick={onAplicar}>
        Actualizar
      </Boton>
    </div>
  );
}
