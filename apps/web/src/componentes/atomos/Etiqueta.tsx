import type { LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "../../utils/cn";

interface PropiedadesEtiqueta extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly children: ReactNode;
}

/**
 * `className` merges through `cn()`, for the reason `Boton` states: a fixed
 * class after `{...resto}` does protect the base class, and in doing so
 * makes the atom unable to accept a modifier at all — the prop is dropped
 * in silence, with no error for the caller who passed it.
 *
 * design-system-migration PR8 — visual redesign. PR17 converts the retired
 * `.etiqueta--opcion` radio-row shape (`FormularioEquipos.tsx`) to a plain
 * `className` override (`estilos/formulario.ts`'s `CLASE_ETIQUETA_OPCION`)
 * composed through `cn()` rather than a dedicated `cva` variant — a single
 * call site does not earn one.
 */
export function Etiqueta({ children, className, ...resto }: PropiedadesEtiqueta) {
  return (
    <label {...resto} className={cn("mb-1 block text-base font-semibold text-texto", className)}>
      {children}
    </label>
  );
}
