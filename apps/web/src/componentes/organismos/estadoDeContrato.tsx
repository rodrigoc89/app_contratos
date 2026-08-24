import type { EstadoContrato } from "@contratos/esquemas";
import { cva } from "class-variance-authority";

/**
 * The one place a storage enum becomes something a person reads, shared by
 * the list and the detail.
 *
 * Extracted rather than copied: a second map is a second place for
 * `dado_de_baja` to reach the screen verbatim, and the two screens would
 * drift the first time an estado is added. `Record<EstadoContrato, string>`
 * makes that addition a compile error rather than a blank cell.
 */
const ETIQUETA_ESTADO: Record<EstadoContrato, string> = {
  borrador: "Borrador",
  vigente: "Vigente",
  dado_de_baja: "Dado de baja",
  anulado: "Anulado",
};

export function etiquetaDeEstado(estado: EstadoContrato): string {
  return ETIQUETA_ESTADO[estado];
}

/**
 * design-system-migration PR11 (guard 14) — visual redesign, `[data-estado=...]`
 * attribute strategy kept verbatim (design.md D1 singles it out as the guard
 * that survives this migration best). Colour is the second channel and never
 * the only one — the Spanish label always renders inside the badge, because
 * the four tints differ in hue and barely in luminance and carry nothing on
 * their own to a colour-blind reader. `border-current` matches the border to
 * each tint's own foreground, same as the retired `border: 1px solid
 * currentcolor` rule.
 */
const insigniaDeEstado = cva(
  "inline-block whitespace-nowrap rounded-full border border-current px-2 py-0.5 text-sm font-semibold leading-relaxed",
  {
    variants: {
      estado: {
        vigente: "bg-estado-vigente-fondo text-estado-vigente-texto",
        borrador: "bg-estado-borrador-fondo text-estado-borrador-texto",
        dado_de_baja: "bg-estado-baja-fondo text-estado-baja-texto",
        anulado: "bg-estado-anulado-fondo text-estado-anulado-texto",
      },
    },
  },
);

export function InsigniaDeEstado({ estado }: { readonly estado: EstadoContrato }) {
  return (
    <span className={insigniaDeEstado({ estado })} data-estado={estado}>
      {etiquetaDeEstado(estado)}
    </span>
  );
}
