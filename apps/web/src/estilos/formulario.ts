/**
 * design-system-migration PR17 (task 17.2) — the form shape shared by
 * `FormularioComodatario`, `FormularioEquipos` and `PaginaLogin`, ported once
 * from the retired `.formulario*` rules (organismos.css). espacio-3/4/5 map
 * onto Tailwind's 4px step as 3/4/6 (D3).
 */

/**
 * No padding of its own, measured rather than guessed — puppeteer against
 * the running dev server at 360x640 and 390x844 (técnico session, answered
 * from `scripts/fixtures/handheld`). This used to end in `p-6`, and on the
 * two draft steps that lands INSIDE `LayoutTecnico`'s `main` (`p-4`),
 * so every edge carried two gutters at once. On both steps and at every
 * viewport the document ran exactly 40.5px past the last painted pixel —
 * 24px from here, 16px from `main` — and on step 2 at 390x844 that was the
 * WHOLE defect: the last painted pixel was at 835.5px, inside the 844px
 * viewport, yet the document measured 876px. 32px of scroll with nothing in
 * it. Step 1 measured 906px (see `FormularioComodatario`'s own note for the
 * other 16px).
 *
 * A page gutter belongs to the page, which is how the office subtree already
 * works: `LayoutPanel`'s `main` pads and `DetalleDeContrato` does not. The
 * two técnico steps now take `main`'s 16px and nothing more; `PaginaLogin`
 * renders this same shape with no layout above it, so it supplies its own —
 * pinned by "supplies its own gutter…" in `PaginaLogin.spec.tsx`.
 */
export const CLASE_FORMULARIO = "mx-auto max-w-[640px]";

/** `.formulario > h1, .formulario > h2` — the shared step title. */
export const CLASE_TITULO_FORMULARIO = "mb-4 border-b-2 border-primario pb-2 text-grande font-bold tracking-tight";

/** `.formulario__campo` (16px effective margin, the later of its two declarations wins). */
export const CLASE_CAMPO_FORMULARIO = "mb-4";

/** `.formulario__campo label` — only `FormularioComodatario` wrapped its fields this way; the other two keep `Etiqueta`'s default. */
export const CLASE_ETIQUETA_FORMULARIO = "text-texto-suave font-bold";

/** `.formulario__fieldset`. */
export const CLASE_FIELDSET_FORMULARIO = "my-4 rounded-base border-2 border-borde-suave p-3";

/** `.formulario__fieldset > legend`. */
export const CLASE_LEYENDA_FORMULARIO = "px-2 font-bold tracking-wide text-texto-suave uppercase";

/** `.etiqueta--opcion` — the whole radio row is the target; `min-h-toque` is ported 1:1 even though `base.css` already sizes the radio itself. */
export const CLASE_ETIQUETA_OPCION = "mb-0 flex min-h-toque cursor-pointer items-center gap-3";

/** `.formulario > .boton, .formulario__acciones` — breathing room above the primary action. */
export const CLASE_ACCIONES_FORMULARIO = "mt-6 flex flex-wrap gap-3";
