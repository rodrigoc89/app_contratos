import type { ReactNode } from "react";

interface PropiedadesLayoutTablet {
  readonly children: ReactNode;
  /** Injected by the route tree — see `LayoutPanel` for why. */
  readonly cabecera?: ReactNode;
}

export function LayoutTablet({ children, cabecera }: PropiedadesLayoutTablet) {
  return (
    <div className="layout-tablet">
      {cabecera}
      <main className="layout-tablet__contenido">{children}</main>
    </div>
  );
}
