/**
 * design-system-migration PR17 (task 17.2) — the form shape shared by
 * `FormularioComodatario`, `FormularioEquipos` and `PaginaLogin`, ported once
 * from the retired `.formulario*` rules (organismos.css). espacio-3/4/5 map
 * onto Tailwind's 4px step as 3/4/6 (D3).
 */
export const CLASE_FORMULARIO = "mx-auto max-w-[640px] p-6";

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
