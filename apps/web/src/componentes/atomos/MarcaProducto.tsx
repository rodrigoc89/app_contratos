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
 * No props, no state — a pure name, styled entirely through `atomos.css`.
 */
export function MarcaProducto() {
  return (
    <span className="marca-producto">
      <span className="marca-producto__empresa">IES.NET</span> Contratos
    </span>
  );
}
