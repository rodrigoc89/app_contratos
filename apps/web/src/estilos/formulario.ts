/**
 * design-system-migration PR17 (task 17.2) — the técnico form shape shared
 * by `FormularioComodatario`, `FormularioEquipos` and `PaginaLogin`, ported
 * once from the retired `.formulario`/`.formulario__campo`/
 * `.formulario__fieldset`/`.formulario__acciones` rules (organismos.css)
 * rather than three times. Values map `tokens.css`'s espacio scale onto
 * Tailwind's unmodified 4px step (D3): espacio-3=12px→3, espacio-4=16px→4,
 * espacio-5=24px→6.
 */
export const CLASE_FORMULARIO = "mx-auto max-w-[640px] p-6";

/** `.formulario > h1, .formulario > h2` — the shared step title. */
export const CLASE_TITULO_FORMULARIO = "mb-4 border-b-2 border-primario pb-2 text-grande font-bold tracking-tight";

/** `.formulario__campo` (16px effective margin, the later of its two declarations wins). */
export const CLASE_CAMPO_FORMULARIO = "mb-4";

/**
 * `.formulario__campo label` — muted, bolder than `Etiqueta`'s own default.
 * Only `FormularioComodatario` wraps its fields in `.formulario__campo`
 * today; `FormularioEquipos`/`PaginaLogin` never did, so their `Etiqueta`s
 * keep the atom's own default instead of this override.
 */
export const CLASE_ETIQUETA_FORMULARIO = "text-texto-suave font-bold";

/** `.formulario__fieldset`. */
export const CLASE_FIELDSET_FORMULARIO = "my-4 rounded-base border-2 border-borde-suave p-3";

/** `.formulario__fieldset > legend`. */
export const CLASE_LEYENDA_FORMULARIO = "px-2 font-bold tracking-wide text-texto-suave uppercase";

/**
 * `.etiqueta--opcion` — a radio/checkbox beside its own text, the whole row
 * as the touch target. `min-h-toque` is redundant with the 48px radio
 * itself (`base.css`'s `@layer base` rule) but ported 1:1 from the retired
 * declaration.
 */
export const CLASE_ETIQUETA_OPCION = "mb-0 flex min-h-toque cursor-pointer items-center gap-3";

/** `.formulario > .boton, .formulario__acciones` — breathing room above the primary action. */
export const CLASE_ACCIONES_FORMULARIO = "mt-6 flex flex-wrap gap-3";
