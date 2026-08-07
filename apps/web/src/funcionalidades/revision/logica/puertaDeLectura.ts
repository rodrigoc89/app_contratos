/**
 * DESIGN.md D2 — the reading gate is a pure state machine per document, with
 * two invariants each proven by a named test in `puertaDeLectura.spec.ts`:
 *
 * 1. A gate can never be `completo` before a measurement. `sin_medir` is the
 *    only starting state (`estadoInicialDePuerta`), and `completo` is
 *    reachable only through `medir()` — fed a real, post-`load` measurement
 *    — or `confirmar()`. Both take an already-existing `EstadoPuerta` as
 *    input, so there is no constructor path in this module that produces
 *    `completo` on its own: "opened on load" is structurally unrepresentable.
 * 2. A document that fits without scrolling (`scrollHeight <= clientHeight`)
 *    never opens its own gate from the measurement alone (spec
 *    `document-review`, "Document fits without scrolling requires explicit
 *    confirmation"). Only the explicit tap (`confirmar()`) can complete it,
 *    and the motive is kept distinct (`cabe_sin_desplazar` vs
 *    `desplazado_al_final`) so both a test and, later, an audit can tell
 *    which path was taken.
 *
 * A re-measurement — reflow, rotation, late fonts — can only move a gate
 * *toward* pending, never open one it did not already open: `medir()` never
 * returns `completo` from the "fits" branch unless it already held that
 * state via a prior tap.
 */

export interface MedicionDeDesplazamiento {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
}

export type EstadoPuerta =
  | { readonly estado: "sin_medir" }
  | { readonly estado: "pendiente"; readonly motivo: "falta_desplazar" }
  | { readonly estado: "pendiente"; readonly motivo: "cabe_sin_desplazar_falta_confirmar" }
  | { readonly estado: "completo"; readonly motivo: "desplazado_al_final" | "cabe_sin_desplazar" };

/** A few px of slack for sub-pixel layout rounding, not a policy knob. */
const TOLERANCIA_PX = 2;

export function estadoInicialDePuerta(): EstadoPuerta {
  return { estado: "sin_medir" };
}

/**
 * Feeds one real measurement into the gate.
 *
 * - Fits without scrolling, already `completo` via `cabe_sin_desplazar` →
 *   stays as is (a re-fit does not revoke a tap already given).
 * - Fits without scrolling, otherwise → `cabe_sin_desplazar_falta_confirmar`.
 *   Never `completo` from this branch — that is the whole point of the tap.
 * - Does not fit and the viewport is at (or past) the bottom → `completo` /
 *   `desplazado_al_final`. This is the one legitimate way to open a gate by
 *   measurement alone: it can only be produced by scrolling that already
 *   happened, not by the frame's own dimensions.
 * - Otherwise → `pendiente` / `falta_desplazar`. The DOM keeps the real
 *   scroll position; this state only records that unread content remains.
 */
export function medir(estadoActual: EstadoPuerta, medicion: MedicionDeDesplazamiento): EstadoPuerta {
  const { scrollTop, clientHeight, scrollHeight } = medicion;
  const cabeSinDesplazar = scrollHeight <= clientHeight + TOLERANCIA_PX;

  if (cabeSinDesplazar) {
    if (estadoActual.estado === "completo" && estadoActual.motivo === "cabe_sin_desplazar") {
      return estadoActual;
    }
    return { estado: "pendiente", motivo: "cabe_sin_desplazar_falta_confirmar" };
  }

  const llegoAlFinal = scrollTop + clientHeight >= scrollHeight - TOLERANCIA_PX;
  if (llegoAlFinal) {
    return { estado: "completo", motivo: "desplazado_al_final" };
  }

  return { estado: "pendiente", motivo: "falta_desplazar" };
}

/**
 * The explicit tap required for a document that fits without scrolling
 * (spec `document-review`). A no-op from every other state: this control
 * exists only to close the one gap a measurement cannot close by itself, not
 * to act as a generic "mark as read" button.
 */
export function confirmar(estadoActual: EstadoPuerta): EstadoPuerta {
  if (estadoActual.estado === "pendiente" && estadoActual.motivo === "cabe_sin_desplazar_falta_confirmar") {
    return { estado: "completo", motivo: "cabe_sin_desplazar" };
  }
  return estadoActual;
}
