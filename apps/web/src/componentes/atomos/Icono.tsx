import type { ReactNode } from "react";

interface PropiedadesIcono {
  readonly etiqueta: string;
  readonly children: ReactNode;
}

export function Icono({ etiqueta, children }: PropiedadesIcono) {
  return (
    <span role="img" aria-label={etiqueta} className="icono">
      {children}
    </span>
  );
}
