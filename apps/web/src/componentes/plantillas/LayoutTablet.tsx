import type { ReactNode } from "react";

interface PropiedadesLayoutTablet {
  readonly children: ReactNode;
}

export function LayoutTablet({ children }: PropiedadesLayoutTablet) {
  return (
    <div>
      <main>{children}</main>
    </div>
  );
}
