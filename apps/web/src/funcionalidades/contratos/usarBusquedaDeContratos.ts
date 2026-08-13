import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { DatosListaContratos, EstadoContrato } from "@contratos/esquemas";

import { buscarContratos } from "../../datos/consultas/buscarContratos";
import { clavesDeContratos, type FiltrosDeListaContratos } from "../../datos/consultas/clavesDeContratos";
import { usarValorDebounced } from "./usarValorDebounced";

/** The server's own default (`EsquemaConsultaDeContratos`) — kept explicit
 * rather than omitted so the query key never silently disagrees with it. */
export const TAMANO_PAGINA_LISTA_CONTRATOS = 20;

const RETRASO_DEBOUNCE_MS = 300;

/**
 * DESIGN.md D11's query configuration, isolated as a pure function so its
 * shape (key, `staleTime`, `placeholderData`) is assertable with no
 * rendering — the interactive parts (debounce, page reset) need a real hook
 * render and are tested there instead.
 */
export function opcionesDeBusquedaDeContratos(filtros: FiltrosDeListaContratos) {
  return {
    queryKey: clavesDeContratos.lista(filtros),
    queryFn: () => buscarContratos(filtros),
    // Library default collapses the table to zero rows on every keystroke
    // and page turn; without this, R-4.3 has nothing to hold onto.
    placeholderData: (anterior: DatosListaContratos | undefined) => anterior,
    // Staleness is a property of *this* data, not global — set per-hook
    // rather than on the shared `QueryClient` (DESIGN.md D11).
    staleTime: 30_000,
  };
}

export interface UsoBusquedaDeContratos {
  readonly termino: string;
  readonly establecerTermino: (valor: string) => void;
  /** Flushes the 300ms debounce immediately — the seam R-3.7's `Enter` handler calls. */
  readonly aplicarBusquedaInmediata: () => void;
  readonly estados: readonly EstadoContrato[];
  readonly alternarEstado: (estado: EstadoContrato) => void;
  readonly pagina: number;
  readonly establecerPagina: (pagina: number) => void;
  readonly tamanoPagina: number;
  readonly consulta: UseQueryResult<DatosListaContratos>;
}

/**
 * DESIGN.md D11 — the office list's one query hook. Owns the search term,
 * its debounce, the `estados` multi-select and the current page; the
 * container only renders what this returns.
 */
export function usarBusquedaDeContratos(): UsoBusquedaDeContratos {
  const [termino, establecerTermino] = useState("");
  const [terminoDebounced, aplicarBusquedaInmediata] = usarValorDebounced(termino, RETRASO_DEBOUNCE_MS);
  const [estados, establecerEstados] = useState<readonly EstadoContrato[]>([]);
  const [pagina, establecerPagina] = useState(1);

  /**
   * Resets on the RAW term/estados change, not the debounced value
   * (DESIGN.md D11). Resetting on the debounced value would fire
   * `{termino: nuevo, pagina: 5}` first — a wasted request and a flash of
   * "no results" — before `{termino: nuevo, pagina: 1}` lands.
   */
  useEffect(() => {
    establecerPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: only term/estados reset the page, not every render.
  }, [termino, estados]);

  function alternarEstado(estado: EstadoContrato): void {
    establecerEstados((actuales) =>
      actuales.includes(estado) ? actuales.filter((valor) => valor !== estado) : [...actuales, estado],
    );
  }

  const consulta = useQuery(
    opcionesDeBusquedaDeContratos({
      termino: terminoDebounced,
      estados,
      pagina,
      tamanoPagina: TAMANO_PAGINA_LISTA_CONTRATOS,
    }),
  );

  return {
    termino,
    establecerTermino,
    aplicarBusquedaInmediata,
    estados,
    alternarEstado,
    pagina,
    establecerPagina,
    tamanoPagina: TAMANO_PAGINA_LISTA_CONTRATOS,
    consulta,
  };
}
