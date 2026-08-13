import type { LabelHTMLAttributes, ReactNode } from "react";

interface PropiedadesEtiqueta extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly children: ReactNode;
}

/**
 * `className` is merged rather than replaced, for the reason `Boton` states:
 * a fixed class after `{...resto}` does protect the base class, and in doing
 * so makes the atom unable to accept a modifier at all — the prop is dropped
 * in silence, with no error for the caller who passed it.
 */
export function Etiqueta({ children, className, ...resto }: PropiedadesEtiqueta) {
  const clases = className === undefined ? "etiqueta" : `etiqueta ${className}`;
  return (
    <label {...resto} className={clases}>
      {children}
    </label>
  );
}
