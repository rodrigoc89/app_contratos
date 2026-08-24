/**
 * design-system-migration PR18 (tasks 18.1-18.4) — the loading-row shape
 * shared by every screen's `role="status"` spinner row, ported once from the
 * retired `.progreso` rule (organismos.css). espacio-3 maps onto Tailwind's
 * 4px step as 3 (D3).
 *
 * `data-progreso` replaces the retired class as the harness hook
 * (`scripts/geometriaHandheld.ts`'s loading-cleared wait): the unlayered
 * `.progreso` rule would otherwise still win at equal specificity over the
 * `@layer`-wrapped Tailwind utilities, so the class itself is never kept as
 * an inert selector.
 */
export const CLASE_PROGRESO = "flex items-center gap-3";
