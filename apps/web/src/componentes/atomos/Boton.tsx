import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
}

/**
 * `className` is merged rather than replaced. Putting a fixed `className`
 * after `{...resto}` did protect the base class from being clobbered, but it
 * also made the atom unable to accept a modifier at all: the prop was
 * silently dropped, so a caller styling a destructive action got nothing and
 * no error. Merging keeps `boton` guaranteed and lets a caller add to it.
 */
export function Boton({ children, type = "button", className, ...resto }: PropiedadesBoton) {
  const clases = className === undefined ? "boton" : `boton ${className}`;
  return (
    <button type={type} {...resto} className={clases}>
      {children}
    </button>
  );
}
