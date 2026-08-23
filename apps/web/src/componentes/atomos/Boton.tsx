import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../utils/cn";

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
}

/**
 * design-system-migration PR1 — structural only: the class list moves from
 * string concatenation into a `cva` variant map so future variants (the
 * `destructivo` colour/spacing rework lands in PR7) have a real place to
 * live. `bg-primario` is a placeholder default, not the redesign.
 */
const varianteBoton = cva("boton bg-primario");

/**
 * `className` is merged through `cn()` (`clsx` + `tailwind-merge`) rather
 * than concatenated. String concatenation let two conflicting `bg-*`
 * classes both land in the DOM with an unpredictable winner; `cn()` merges
 * deterministically, so a caller's utility always wins over the atom's own
 * default.
 */
export function Boton({ children, type = "button", className, ...resto }: PropiedadesBoton) {
  return (
    <button type={type} {...resto} className={cn(varianteBoton(), className)}>
      {children}
    </button>
  );
}
