import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosContratoResumen, DatosListaContratos } from "@contratos/esquemas";

import { buscarContratos } from "../../../datos/consultas/buscarContratos";
import { queryClient } from "../../../app/providers";
import { PaginaListaContratos } from "./PaginaListaContratos";

vi.mock("../../../datos/consultas/buscarContratos", () => ({
  buscarContratos: vi.fn(),
}));

const buscarContratosSimulado = vi.mocked(buscarContratos);

function fila(sobrescrituras: Partial<DatosContratoResumen> = {}): DatosContratoResumen {
  return {
    id: "c1",
    numero: 42,
    estado: "vigente",
    comodatario: { nombreCompleto: "Ana López", dni: "30.123.456" },
    fechaFirma: "2026-01-05",
    ...sobrescrituras,
  };
}

function listaVacia(): DatosListaContratos {
  return { elementos: [], total: 0, pagina: 1, tamanoPagina: 20 };
}

function listaConUnContrato(): DatosListaContratos {
  return { elementos: [fila()], total: 1, pagina: 1, tamanoPagina: 20 };
}

function renderizarConCliente(cliente: QueryClient) {
  const enrutador = createMemoryRouter(
    [{ path: "/contratos", element: <PaginaListaContratos /> }],
    { initialEntries: ["/contratos"] },
  );
  render(
    <QueryClientProvider client={cliente}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>,
  );
  return enrutador;
}

/**
 * R-3.3 (four distinct outcomes), R-3.4 (rows read-only, no navigation),
 * R-3.7/tab order (DOM order only, no positive tabIndex), and the D15 live
 * region.
 */
describe("PaginaListaContratos", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function clientePrueba(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  it("shows the Spinner while the first request is in flight", () => {
    buscarContratosSimulado.mockReturnValue(new Promise(() => {}));

    renderizarConCliente(clientePrueba());

    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
  });

  it("shows 'nothing exists yet' when nothing is loaded and no filter is active", async () => {
    buscarContratosSimulado.mockResolvedValue(listaVacia());

    renderizarConCliente(clientePrueba());

    expect(await screen.findByText("Todavía no hay contratos cargados.")).toBeInTheDocument();
  });

  it("shows 'this filter matched nothing' when a filter is active and total is 0", async () => {
    buscarContratosSimulado.mockResolvedValue(listaVacia());

    renderizarConCliente(clientePrueba());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inexistente" } });

    await waitFor(() =>
      expect(screen.getByText("No hay contratos que coincidan con la búsqueda.")).toBeInTheDocument(),
    );
  });

  it("renders the count as the live region and the table once data arrives", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    renderizarConCliente(clientePrueba());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 contrato"));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows a Spanish error message with a retry control when the request fails", async () => {
    buscarContratosSimulado.mockRejectedValue(new Error("network down"));

    renderizarConCliente(clientePrueba());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("retries a failing request at most once, using the real production queryClient", async () => {
    buscarContratosSimulado.mockRejectedValue(new Error("network down"));

    renderizarConCliente(queryClient);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeInTheDocument(), { timeout: 3000 });

    expect(buscarContratosSimulado).toHaveBeenCalledTimes(2);
  });

  it("renders no link or button role inside any row, and a click does not navigate", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    const enrutador = renderizarConCliente(clientePrueba());
    await screen.findByRole("table");

    const filaDeContrato = screen.getAllByRole("row")[1] as HTMLElement;
    fireEvent.click(filaDeContrato);

    expect(enrutador.state.location.pathname).toBe("/contratos");
    expect(buscarContratosSimulado).toHaveBeenCalledTimes(1);
  });

  it("keeps tab order to search box then estado chips then the table region then pagination, with no positive tabIndex", async () => {
    buscarContratosSimulado.mockResolvedValue({
      elementos: Array.from({ length: 25 }, (_, indice) => fila({ id: `c${indice}` })),
      total: 25,
      pagina: 1,
      tamanoPagina: 20,
    });

    const { container } = render(
      <QueryClientProvider client={clientePrueba()}>
        <PaginaListaContratos />
      </QueryClientProvider>,
    );
    await screen.findByRole("table");

    const buscar = screen.getByRole("searchbox");
    const grupoEstados = screen.getByRole("group", { name: /filtrar por estado/i });
    const region = screen.getByRole("region");
    const anterior = screen.getByRole("button", { name: "Página anterior" });

    // Reading order: search box comes before the estado group, which comes
    // before the scroll region, which comes before pagination.
    expect(buscar.compareDocumentPosition(grupoEstados) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grupoEstados.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(anterior) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const elemento of container.querySelectorAll("[tabindex]")) {
      const valor = Number(elemento.getAttribute("tabindex"));
      expect(valor).toBeLessThanOrEqual(0);
    }
  });

  it("Enter in the search box flushes the debounce immediately and never navigates", async () => {
    buscarContratosSimulado.mockResolvedValue(listaVacia());
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const enrutador = renderizarConCliente(clientePrueba());
    await act(async () => {
      await Promise.resolve();
    });
    buscarContratosSimulado.mockClear();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "perez" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.submit(screen.getByRole("search"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(buscarContratosSimulado).toHaveBeenCalledWith(expect.objectContaining({ termino: "perez" }));
    expect(enrutador.state.location.pathname).toBe("/contratos");

    vi.useRealTimers();
  });
});
