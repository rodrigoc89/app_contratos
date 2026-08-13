import type { EstadoContrato } from "@contratos/esquemas";

/**
 * DESIGN.md D11 — the first TanStack Query key factory in this app, and the
 * pattern every later feature copies. Hierarchical on purpose:
 * `clavesDeContratos.todo` invalidates everything contract-related,
 * `clavesDeContratos.lista(filtros)` invalidates one list page. No call site
 * writes a key string literal (R-4.2).
 */
export interface FiltrosDeListaContratos {
  readonly termino: string;
  readonly estados: readonly EstadoContrato[];
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export const clavesDeContratos = {
  todo: ["contratos"] as const,
  lista: (filtros: FiltrosDeListaContratos) => ["contratos", "lista", filtros] as const,
};
