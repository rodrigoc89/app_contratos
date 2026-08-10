import type { ReactNode } from "react";

interface PropiedadesLayoutTablet {
  readonly children: ReactNode;
}

export function LayoutTablet({ children }: PropiedadesLayoutTablet) {
  return (
    <div className="layout-tablet">
      <main className="layout-tablet__contenido">{children}</main>
    </div>
  );
}
