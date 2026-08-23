/**
 * The IES.NET Contratos wordmark, composed by `CabeceraDeSesion` and
 * `PaginaLogin` (D2, brand-identity change).
 *
 * D1 — live text, not an SVG: no vector source of the letterforms exists, so
 * an SVG would carry our own recreation of them at the cost of three real
 * things — it cannot be recoloured by a token, it needs a hand-written
 * accessible name that can drift from the visible text, and it is invisible
 * to `convencionesDeEstilos.spec.ts`, which reads CSS. Text pays none of
 * that, and the guard this change exists to install (D6) applies to it.
 *
 * Two markup constraints, both non-negotiable:
 * 1. Never an `<h1>` — `PaginaLogin.spec.tsx:242-251` asserts exactly one
 *    `heading` at level 1; a second one throws.
 * 2. Never a link — `convencionesDeEstilos.spec.ts`'s link scan demands both
 *    touch floors of any `<a>`/`<Link>` carrying a `className`, and the
 *    wordmark names the product, it does not navigate anywhere.
 *
 * No props, no state — a pure name.
 *
 * design-system-migration PR8 — visual redesign; guards 9-12 real coverage.
 * `text-marca-azul` resolves `--color-marca-azul` (`#0076d9`, `tema.css`) —
 * 4.57:1 against `#ffffff`, never the raw `#008bff` the icon's raster asset
 * still carries (D1: that fill sits outside this guard's reach on purpose,
 * because only live text is in scope). `data-marca-producto` replaces
 * `.marca-producto` as the selector tests/callers hook into — the class
 * name itself is retired with the rest of this atom's BEM styling.
 */
export function MarcaProducto() {
  return (
    <span data-marca-producto className="text-grande font-bold text-texto">
      <span className="text-marca-azul">IES.NET</span> Contratos
    </span>
  );
}
