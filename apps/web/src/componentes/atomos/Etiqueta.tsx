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
 * design-system-migration PR8 — visual redesign. `FormularioEquipos.tsx`'s
 * `className="etiqueta--opcion"` still applies unmodified: that rule is
 * unlayered, hand-authored CSS (`estilos/atomos.css`), which always
 * outranks a Tailwind `@layer utilities` class of equal specificity
 * regardless of source order, so `cn()` passing it straight through is
 * enough — no dedicated variant needed here.
 */
export function Etiqueta({ children, className, ...resto }: PropiedadesEtiqueta) {
  return (
    <label {...resto} className={cn("mb-1 block text-base font-semibold text-texto", className)}>
      {children}
    </label>
  );
}
