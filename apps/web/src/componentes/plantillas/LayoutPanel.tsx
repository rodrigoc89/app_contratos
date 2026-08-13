import type { ReactNode } from "react";

interface PropiedadesLayoutPanel {
  readonly children: ReactNode;
}

/**
 * DESIGN.md D13 — the office shell. A sibling to `LayoutTablet`, never a
 * modification of it: `LayoutTablet`'s name declares a device assumption
 * (`max-width: 720px`) that would waste most of a 1920px monitor, and it
 * carries its own spec plus the técnico flow depending on it.
 *
 * `.layout-panel` is what `panel.css` rebinds `--fuente-base` to 16px on —
 * a desktop operator reading for hours wants the browser default, not the
 * 18px `:root` value sized for a tablet held at arm's length.
 */
export function LayoutPanel({ children }: PropiedadesLayoutPanel) {
  return (
    <div className="layout-panel">
      <main className="layout-panel__contenido">{children}</main>
    </div>
  );
}
