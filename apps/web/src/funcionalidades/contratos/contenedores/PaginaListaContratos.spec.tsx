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
    [{ path: "/panel", element: <PaginaListaContratos /> }],
    { initialEntries: ["/panel"] },
  );
  render(
    <QueryClientProvider client={cliente}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>,
  );
  return enrutador;
}

/**
 * R-3.3 (four distinct outcomes), R-3.4 as amended (the ROW is not a
 * click target; the name inside it is a link to the detail),
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

  it("does not navigate when the row itself is clicked — only its link navigates", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    const enrutador = renderizarConCliente(clientePrueba());
    await screen.findByRole("table");

    const filaDeContrato = screen.getAllByRole("row")[1] as HTMLElement;
    fireEvent.click(filaDeContrato);

    expect(enrutador.state.location.pathname).toBe("/panel");
    expect(buscarContratosSimulado).toHaveBeenCalledTimes(1);
  });

  it("keeps tab order to search box then estado chips then the table region then pagination, with no positive tabIndex", async () => {
    buscarContratosSimulado.mockResolvedValue({
      elementos: Array.from({ length: 25 }, (_, indice) => fila({ id: `c${indice}` })),
      total: 25,
      pagina: 1,
      tamanoPagina: 20,
    });

    // Goes through the shared helper like every other case here: rows now
    // carry a link to the contract detail, so this tree needs a router.
    renderizarConCliente(clientePrueba());
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

    for (const elemento of document.body.querySelectorAll("[tabindex]")) {
      const valor = Number(elemento.getAttribute("tabindex"));
      expect(valor).toBeLessThanOrEqual(0);
    }
  });

  /**
   * PR22 — the user's report: scrolling the list moved EVERYTHING, working
   * chrome included. The header already pins (guard 15's tree-wide scan);
   * this freezes the second tier: the search box + estado chips pin
   * directly under the header from `tableta:` up, offset by the SAME
   * `--altura-cabecera-panel` token the header sizes itself with. Below
   * `tableta:` the block measured 209px tall (chips stack at 360px) — plus
   * the 65px header and the ~73px sticky paginator that would pin over
   * half of a 640px viewport, so on handheld widths only the header pins.
   * jsdom performs no layout; the class list is the observable contract.
   */
  it("pins the search chrome under the header from tableta up, with its own opaque background", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    renderizarConCliente(clientePrueba());
    await screen.findByRole("table");

    const buscador = screen.getByRole("search");
    const envoltorio = buscador.parentElement as HTMLElement;
    const clases = envoltorio.className;

    expect(clases).toMatch(/\btableta:sticky\b/);
    // The offset is the header's height token — bracket var() spelling, the
    // form guard 15's tree-wide inset regex recognises.
    expect(clases).toMatch(/\btableta:top-\[var\(--altura-cabecera-panel\)\]/);
    expect(clases).toMatch(/\bbg-fondo\b/);
  });

  /**
   * The 24px gap below the search block used to be the form's own `mb-6` —
   * a transparent margin. A margin below a pinned block is a window: rows
   * scroll visibly through it. The gap must be the wrapper's own PADDING,
   * covered by its opaque background.
   */
  it("owns the gap below the pinned search block as opaque padding, never a transparent margin", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    renderizarConCliente(clientePrueba());
    await screen.findByRole("table");

    const buscador = screen.getByRole("search");
    const envoltorio = buscador.parentElement as HTMLElement;

    expect(envoltorio.className).toMatch(/\bpb-6\b/);
    expect(buscador.className).not.toMatch(/\bmb-6\b/);
  });

  /**
   * A page title may scroll away; the working controls may not. The h1
   * outside the sticky wrapper is what makes the pinned chrome cost 103px
   * instead of 160px of every scrolled viewport.
   */
  it("leaves the Contratos title outside the pinned block, free to scroll away", async () => {
    buscarContratosSimulado.mockResolvedValue(listaConUnContrato());

    renderizarConCliente(clientePrueba());
    await screen.findByRole("table");

    const envoltorio = screen.getByRole("search").parentElement as HTMLElement;
    const titulo = screen.getByRole("heading", { level: 1, name: "Contratos" });

    expect(envoltorio.contains(titulo)).toBe(false);
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
    expect(enrutador.state.location.pathname).toBe("/panel");

    vi.useRealTimers();
  });
});
