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
 * DESIGN.md D13 — the office shell. A sibling to `LayoutTablet`, never a
 * modification of it: `LayoutTablet`'s name declares a device assumption
 * (`max-width: 720px`) that would waste most of a 1920px monitor, and it
 * carries its own spec plus the técnico flow depending on it.
 *
 * `.layout-panel` is what `panel.css` rebinds `--fuente-base` to 16px on,
 * AND reads back with `font-size` — a desktop operator reading for hours
 * wants the browser default, not the 18px `:root` value sized for a tablet
 * held at arm's length. The read-back is what carries the rebind to
 * inherited text; without it `body`'s already-computed 18px stands (see the
 * rule's own comment in `panel.css`).
 */
export function LayoutPanel({ children, cabecera }: PropiedadesLayoutPanel) {
  return (
    <div className="layout-panel">
      {cabecera}
      <main className="layout-panel__contenido">{children}</main>
    </div>
  );
}
