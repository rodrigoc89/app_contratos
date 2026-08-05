import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
}

export function Boton({ children, type = "button", ...resto }: PropiedadesBoton) {
  return (
    <button type={type} {...resto}>
      {children}
    </button>
  );
}
