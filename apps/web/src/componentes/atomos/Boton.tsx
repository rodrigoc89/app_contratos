import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../utils/cn";

/**
 * design-system-migration PR7 (guards 3/4/6) — visual redesign.
 * Guard 3: `inline-flex`, never bare `inline` (silently inert `min-height`);
 * the touch floor lives in the `tamano` variant (`min-h-toque min-w-toque`,
 * D3's `--spacing-toque`). Guard 4: `variante: destructivo` differs from
 * `primario` by colour token alone, never DOM position — the >=32px gap is
 * a composition concern (`gap-8` in the caller, proven as a fixture;
 * final confirmation against the real signature flow lands in PR13).
 * Guard 6 (D6): `outline-none` pairs with `focus-visible:ring-2
 * ring-offset-2 ring-foco`, never removes focus outright — the ring only
 * appears on `focus-visible:`, carries non-zero width, and resolves
 * `--color-foco`, the same token `tema.css`'s global `:focus-visible` uses.
 */
const varianteBoton = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-base border-2 font-sans text-base font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variante: {
        primario: "border-primario bg-primario text-white hover:border-primario-oscuro hover:bg-primario-oscuro",
        secundario: "border-primario bg-fondo text-primario hover:border-primario-oscuro hover:text-primario-oscuro",
        destructivo: "border-error bg-error text-white hover:border-error hover:bg-error",
      },
      tamano: {
        estandar: "min-h-toque min-w-toque px-5 py-3",
      },
    },
    defaultVariants: { variante: "primario", tamano: "estandar" },
  },
);

/** Every `tamano` key `varianteBoton` declares — guard 3 iterates this, so a future size stays covered by construction. */
export const TAMANOS_BOTON = ["estandar"] as const;

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof varianteBoton> {
  readonly children: ReactNode;
}

/**
 * `className` is merged through `cn()` (`clsx` + `tailwind-merge`) rather
 * than concatenated. String concatenation let two conflicting `bg-*`
 * classes both land in the DOM with an unpredictable winner; `cn()` merges
 * deterministically, so a caller's utility always wins over the atom's own
 * default.
 */
export function Boton({ children, type = "button", className, variante, tamano, ...resto }: PropiedadesBoton) {
  return (
    <button type={type} {...resto} className={cn(varianteBoton({ variante, tamano }), className)}>
      {children}
    </button>
  );
}
