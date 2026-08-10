import type { LabelHTMLAttributes, ReactNode } from "react";

interface PropiedadesEtiqueta extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly children: ReactNode;
}

export function Etiqueta({ children, ...resto }: PropiedadesEtiqueta) {
  return (
    <label {...resto} className="etiqueta">
      {children}
    </label>
  );
}
