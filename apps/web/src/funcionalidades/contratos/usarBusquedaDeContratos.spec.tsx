import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosListaContratos } from "@contratos/esquemas";

import { buscarContratos } from "../../datos/consultas/buscarContratos";
import { opcionesDeBusquedaDeContratos, usarBusquedaDeContratos } from "./usarBusquedaDeContratos";

vi.mock("../../datos/consultas/buscarContratos", () => ({
  buscarContratos: vi.fn(),
}));

const buscarContratosSimulado = vi.mocked(buscarContratos);

function pagina(numero: number, elementos: DatosListaContratos["elementos"] = []): DatosListaContratos {
  return { elementos, total: 25, pagina: numero, tamanoPagina: 20 };
}

function envoltorio() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Envoltorio({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  };
}

describe("opcionesDeBusquedaDeContratos", () => {
  it("configures staleTime at 30s and a hierarchical key, with no rendering required", () => {
    const filtros = { termino: "perez", estados: [], pagina: 1, tamanoPagina: 20 };
    const opciones = opcionesDeBusquedaDeContratos(filtros);

    expect(opciones.staleTime).toBe(30_000);
    expect(opciones.queryKey).toEqual(["contratos", "lista", filtros]);
  });

  it("keeps the previous page visible via placeholderData", () => {
    const opciones = opcionesDeBusquedaDeContratos({ termino: "", estados: [], pagina: 2, tamanoPagina: 20 });
    const anterior = pagina(1);

    expect(opciones.placeholderData(anterior)).toBe(anterior);
  });
});

describe("usarBusquedaDeContratos", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resets to page 1 when the raw search term changes", async () => {
    buscarContratosSimulado.mockResolvedValue(pagina(1));
    const { result } = renderHook(() => usarBusquedaDeContratos(), { wrapper: envoltorio() });

    act(() => result.current.establecerPagina(3));
    expect(result.current.pagina).toBe(3);

    act(() => result.current.establecerTermino("perez"));

    expect(result.current.pagina).toBe(1);
  });

  it("resets to page 1 when the estados filter changes", async () => {
    buscarContratosSimulado.mockResolvedValue(pagina(1));
    const { result } = renderHook(() => usarBusquedaDeContratos(), { wrapper: envoltorio() });

    act(() => result.current.establecerPagina(3));
    expect(result.current.pagina).toBe(3);

    act(() => result.current.alternarEstado("vigente"));

    expect(result.current.pagina).toBe(1);
  });

  it("toggles an estado on and back off", () => {
    buscarContratosSimulado.mockResolvedValue(pagina(1));
    const { result } = renderHook(() => usarBusquedaDeContratos(), { wrapper: envoltorio() });

    act(() => result.current.alternarEstado("vigente"));
    expect(result.current.estados).toEqual(["vigente"]);

    act(() => result.current.alternarEstado("vigente"));
    expect(result.current.estados).toEqual([]);
  });

  it("keeps the previous page's rows on screen while the next page is in flight", async () => {
    const filaPagina1 = pagina(1, [
      { id: "c1", numero: 1, estado: "vigente", comodatario: { nombreCompleto: "Ana", dni: "30.123.456" }, fechaFirma: "2026-01-01" },
    ]);
    let liberarPagina2: ((valor: DatosListaContratos) => void) | undefined;
    const pagina2Diferida = new Promise<DatosListaContratos>((resolver) => {
      liberarPagina2 = resolver;
    });
    buscarContratosSimulado.mockResolvedValueOnce(filaPagina1).mockReturnValueOnce(pagina2Diferida);

    const { result } = renderHook(() => usarBusquedaDeContratos(), { wrapper: envoltorio() });

    await waitFor(() => expect(result.current.consulta.data).toEqual(filaPagina1));

    act(() => result.current.establecerPagina(2));

    // The next page is in flight, but the previous rows are still visible —
    // this is what placeholderData buys, and the whole point of R-4.3.
    expect(result.current.consulta.isFetching).toBe(true);
    expect(result.current.consulta.data).toEqual(filaPagina1);

    await act(async () => {
      liberarPagina2?.(pagina(2, []));
      await pagina2Diferida;
    });

    await waitFor(() => expect(result.current.consulta.data?.pagina).toBe(2));
  });
});
