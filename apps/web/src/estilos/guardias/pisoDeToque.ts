/**
 * design.md D5 — JSX/`cva` analogue of `convencionesDeEstilos.spec.ts`'s
 * touch-floor engine (guard 20): pure functions proven on fixtures
 * (`pisoDeToque.spec.ts`) before any real scan uses them. Generalises guard
 * 3's `Boton`-scoped `resuelveEjeDeToque` (PR7) to every interactive
 * element — the widening the CSS engine's own guard 20 comment names as its
 * real defect: an enumeration only covers what someone thought to list,
 * which is how two real 24px links shipped.
 */

/** Same set as the CSS engine's `ELEMENTOS_INTERACTIVOS`. `label` stays
 * absent — it forwards its click to the control it names (`convencionesDeEstilos.spec.ts:1528-1536`). */
export const ELEMENTOS_INTERACTIVOS: ReadonlySet<string> = new Set(["a", "button", "input", "select", "textarea", "summary"]);

/** A handler prop is the one signal the CSS engine had no analogue for. */
const PROPS_INTERACTIVAS: ReadonlySet<string> = new Set(["onClick", "onChange"]);
const PATRON_CURSOR_POINTER = /\bcursor-pointer\b/;
const PATRON_VARIANTE_INTERACTIVA = /\b(?:hover|focus|focus-visible|active|disabled):/;

export interface ElementoCandidato {
  readonly tag: string;
  readonly clases: string;
  readonly props?: readonly string[];
}

/** Ported `PSEUDOCLASES_INTERACTIVAS || ELEMENTOS_INTERACTIVOS.has(...) ||
 * cursor:pointer`: tag set, handler prop, `cursor-pointer`, or a state-variant prefix. */
export function esControlInteractivo(candidato: ElementoCandidato): boolean {
  if (ELEMENTOS_INTERACTIVOS.has(candidato.tag)) return true;
  if (candidato.props?.some((prop) => PROPS_INTERACTIVAS.has(prop))) return true;
  if (PATRON_CURSOR_POINTER.test(candidato.clases)) return true;
  return PATRON_VARIANTE_INTERACTIVA.test(candidato.clases);
}

/** Ported `declaraAlMenosElPiso`: `*-toque` (`size-toque` sets both axes) or
 * `w-N`/`h-N`/`min-*-N` where `N * 4 >= 48` (Tailwind's 4px step), proved
 * first by guard 3 scoped to `Boton`. */
function resuelveEjeDeToque(clases: string, eje: "w" | "h"): boolean {
  if (/\bsize-toque\b/.test(clases)) return true;
  if (new RegExp(`\\b(?:min-)?${eje}-toque\\b`).test(clases)) return true;
  const numerico = new RegExp(`\\b(?:min-)?${eje}-(\\d+)\\b`, "g");
  return [...clases.matchAll(numerico)].some((coincidencia) => Number(coincidencia[1]) * 4 >= 48);
}

/** Ported `ANCHO_COMPLETO`/`DISPLAY_DE_BLOQUE`: full-width or any block-level display satisfies the horizontal floor alone. */
export const ANCHO_COMPLETO = /\b(?:w|min-w)-full\b/;
export const DISPLAY_DE_BLOQUE = /\b(?:flex|grid|block|table)\b/;

const PATRON_CAJA_NO_INLINE = /\b(?:inline-flex|inline-grid|inline-block|flex|grid|block|table)\b/;
const PATRON_INLINE_LITERAL = /\binline\b/;

/** Ported inline veto: `display: inline` is the one declaration a
 * `min-height`/`height` utility cannot act on (`convencionesDeEstilos.spec.ts:1649-1658`,
 * the defect behind both real 24px links). Literal `inline` with no
 * box-establishing companion vetoes the vertical floor even with a sizing token. */
export function esInlineSinCaja(clases: string): boolean {
  return PATRON_INLINE_LITERAL.test(clases) && !PATRON_CAJA_NO_INLINE.test(clases);
}

/** Ported `cumplePisoVertical`. */
export function cumplePisoVertical(clases: string): boolean {
  if (esInlineSinCaja(clases)) return false;
  return resuelveEjeDeToque(clases, "h");
}

/** Ported `cumplePisoHorizontal`. */
export function cumplePisoHorizontal(clases: string): boolean {
  return resuelveEjeDeToque(clases, "w") || ANCHO_COMPLETO.test(clases) || DISPLAY_DE_BLOQUE.test(clases);
}

/** One recorded exemption, keyed on component + element rather than a CSS
 * selector — `cva` resolves one deterministic class list per call, so the
 * BEM-fallback half of `identidadesDeCobertura` has nothing to fall back
 * through here and is dropped, per D5's mapping table. */
export interface ExencionDeToque {
  readonly componente: string;
  readonly elemento: string;
  readonly porque: string;
}

/**
 * PR15 — `TablaDeContratos` converts, carrying forward both of the CSS
 * engine's `EXENCIONES` entries. The scroll region's `focus-visible:ring-*`
 * replacement (D6) triggers the same `focus-visible:` variant heuristic
 * that flags a row's `hover:` tint, for the identical reason the CSS
 * engine's `PSEUDOCLASES_INTERACTIVAS` scan matched its `:focus-visible`
 * rule — it is focusable so a keyboard can scroll it, not a pointer target.
 */
export const EXENCIONES: readonly ExencionDeToque[] = [
  {
    componente: "TablaDeContratos",
    elemento: "tbody tr",
    porque:
      "R-3.5/R-3.8: a row is not a target. It has no click handler and carries no cursor-pointer; the hover tint at tableta registers it as interactive under D5's hover: heuristic but is a mouse-only affordance separating a name from its estado, not a promise of an action. The one link inside it carries the target instead.",
  },
  {
    componente: "TablaDeContratos",
    elemento: "desplazamiento",
    porque:
      "the table's horizontal scroll region (D12). It is focusable so a keyboard can scroll it, which is why it declares a focus-visible ring, but scrolling is not a pointer target: WCAG 2.5.5 sizes things you activate. It is already full-width and far taller than the floor.",
  },
];

/** Ported `EXENCIONES.some((e) => e.base === regla.base)`. */
export function esExento(
  componente: string,
  elemento: string,
  exenciones: readonly ExencionDeToque[] = EXENCIONES,
): boolean {
  return exenciones.some((exencion) => exencion.componente === componente && exencion.elemento === elemento);
}

/** One real element the anti-rot check compares an exemption against. */
export type CandidatoDeExencion = Pick<ExencionDeToque, "componente" | "elemento">;

/** Ported "keeps every exemption earning its place" (`convencionesDeEstilos.spec.ts:1724-1731`):
 * every entry whose `{componente, elemento}` is absent from `corpus` — a
 * stale exemption naming a target nobody declares any more. */
export function exencionesSinCorrespondencia(
  exenciones: readonly ExencionDeToque[],
  corpus: readonly CandidatoDeExencion[],
): readonly ExencionDeToque[] {
  return exenciones.filter(
    (exencion) => !corpus.some((c) => c.componente === exencion.componente && c.elemento === exencion.elemento),
  );
}
