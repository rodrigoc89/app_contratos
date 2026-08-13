import type { EstadoContrato } from "@contratos/esquemas";

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
 * The badge. Colour is the second channel and never the only one — the
 * Spanish label always renders inside it, because the four tints differ in
 * hue and barely in luminance and carry nothing on their own to a
 * colour-blind reader. `panel.css` paints from `data-estado`.
 */
export function InsigniaDeEstado({ estado }: { readonly estado: EstadoContrato }) {
  return (
    <span className="insignia-estado" data-estado={estado}>
      {etiquetaDeEstado(estado)}
    </span>
  );
}
