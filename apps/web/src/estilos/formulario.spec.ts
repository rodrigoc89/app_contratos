import { describe, expect, it } from "vitest";

import { CLASE_ACCIONES_FORMULARIO, CLASE_FORMULARIO } from "./formulario";

/**
 * The técnico reported a short vertical scroll on both draft steps that
 * showed nothing. Measured with puppeteer against the running dev server
 * (técnico session answered from `scripts/fixtures/handheld`), before this
 * change:
 *
 *   step 1 @ 390x844: scrollHeight 906 vs innerHeight 844 (62px of scroll)
 *   step 2 @ 390x844: scrollHeight 876 vs innerHeight 844 (32px of scroll)
 *
 * and, at every viewport and on both steps, exactly 40.5px of document sat
 * BELOW the last painted pixel: `LayoutTecnico`'s `main` gutter (`p-4`, 16px)
 * plus a second, redundant one this constant declared on top of it (24px).
 * Step 2's last painted pixel was at 835.5px — inside the 844px viewport —
 * so its whole scroll was that doubled gutter and nothing else.
 *
 * A page gutter belongs to the page. `LayoutPanel`'s office subtree already
 * works that way (`main` pads, `DetalleDeContrato` does not), and the two
 * técnico steps are the only place where a second one stacked on top.
 * `PaginaLogin` renders this same shape with no layout above it, so it
 * supplies its own gutter at its call site — pinned in `PaginaLogin.spec.tsx`.
 */
describe("CLASE_FORMULARIO — the page gutter belongs to the page", () => {
  it("declares no padding of its own, so it cannot double the container's", () => {
    expect(CLASE_FORMULARIO).not.toMatch(/(?:^|\s)p[xytblrse]?-/);
  });

  /**
   * Disclosed while measuring, and deliberately NOT changed here: the
   * reading-width utility below is inert in the real build. `tema.css` ends
   * its scan of this directory ("@source not"), because the prose in these
   * files reads as utility candidates to a lexical scanner — so a utility
   * that appears ONLY here is never compiled. `mx-auto` survives because
   * `LayoutTecnico`/`LayoutPanel` also name it; the 640px width does not
   * appear in any scanned file, and is absent from `dist/`'s CSS. It costs
   * nothing on a handheld (every measured viewport is narrower than 640px)
   * and fixing it means changing what that scan covers, which is guard 1's
   * ground and its own change.
   */
  it("still centres itself and names its reading width", () => {
    expect(CLASE_FORMULARIO).toMatch(/(?:^|\s)mx-auto(?:\s|$)/);
    expect(CLASE_FORMULARIO).toMatch(/(?:^|\s)max-w-\[640px\](?:\s|$)/);
  });
});

/**
 * The 24px above the primary action is this row's job, and only a row can
 * do it: `Boton` renders `inline-flex`, and an atomic inline-level box does
 * not margin-collapse with the block sibling before it. Measured on step 1
 * before this change, where the submit sat bare in the form: the last field
 * wrapper's `mb-4` (16px) and the button's own `mt-6` (24px) both applied in
 * full — a 40px gap where the source comment claimed 24. Step 2, whose
 * submit already lived in this row, measured exactly 24px.
 */
describe("CLASE_ACCIONES_FORMULARIO — the actions row owns the space above the action", () => {
  it("is a block-level row, so the previous field's margin collapses into its own", () => {
    expect(CLASE_ACCIONES_FORMULARIO).toMatch(/(?:^|\s)mt-6(?:\s|$)/);
    expect(CLASE_ACCIONES_FORMULARIO).toMatch(/(?:^|\s)flex(?:\s|$)/);
  });
});
