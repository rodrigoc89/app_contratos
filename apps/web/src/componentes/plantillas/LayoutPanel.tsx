import type { ReactNode } from "react";

interface PropiedadesLayoutPanel {
  readonly children: ReactNode;
  /**
   * Injected rather than rendered here: the header needs the session, and
   * `componentes/` may not import `datos/` (`convencionDeCapas.spec.ts`).
   * The route tree supplies it, so this template stays presentational.
   */
  readonly cabecera?: ReactNode;
}

/**
 * design.md D4 — the office shell. A sibling to `LayoutTecnico`, never a
 * modification of it: `LayoutTecnico`'s name declares a device assumption
 * (`max-width: 720px`) that would waste most of a 1920px monitor, and it
 * carries its own spec plus the técnico flow depending on it.
 *
 * The retired `panel.css` mechanism rebound the inherited `--fuente-base`
 * custom property to 16px on `.layout-panel`, then read it back with a
 * SECOND declaration on the same element — the rebind alone is inert,
 * because `body`'s `font-size` (an ancestor) had already resolved the
 * un-rebound 18px before this element's declaration ever ran; only the
 * read-back re-resolved it locally and let ordinary inheritance carry 16px
 * to descendant text. `text-[16px]` below states that same size literally,
 * on the same wrapper element, with no custom property and no separate
 * read-back step to omit: the "rebind alone is inert" bug class is
 * structurally impossible here, not merely avoided (D4, guard 7's
 * rebind/read-back half).
 */
export function LayoutPanel({ children, cabecera }: PropiedadesLayoutPanel) {
  return (
    <div className="min-h-full text-[16px]" data-layout-panel>
      {cabecera}
      <main className="mx-auto max-w-[1280px] p-4 escritorio:p-6" data-layout-panel-contenido>
        {children}
      </main>
    </div>
  );
}
