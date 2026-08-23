import type { ReactNode } from "react";

interface PropiedadesLayoutTecnico {
  readonly children: ReactNode;
  /** Injected by the route tree — see `LayoutPanel` for why. */
  readonly cabecera?: ReactNode;
}

export function LayoutTecnico({ children, cabecera }: PropiedadesLayoutTecnico) {
  return (
    <div className="layout-tecnico">
      {cabecera}
      <main className="layout-tecnico__contenido">{children}</main>
    </div>
  );
}
