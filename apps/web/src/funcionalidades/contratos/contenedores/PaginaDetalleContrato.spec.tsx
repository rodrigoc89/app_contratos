import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { DatosContratoDetalle } from "@contratos/esquemas";

import { ErrorDeApi } from "../../../datos/clienteHttp";
import { obtenerContrato } from "../../../datos/consultas/obtenerContrato";
import { descargarDocumento } from "../../../datos/descargaDeArchivo";
import { PaginaDetalleContrato } from "./PaginaDetalleContrato";

vi.mock("../../../datos/consultas/obtenerContrato", () => ({ obtenerContrato: vi.fn() }));
vi.mock("../../../datos/descargaDeArchivo", () => ({ descargarDocumento: vi.fn() }));

const obtener = vi.mocked(obtenerContrato);
const descargar = vi.mocked(descargarDocumento);

function contrato(): DatosContratoDetalle {
  return {
    id: "c1",
    estado: "vigente",
    numero: 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "Belgrano 250",
      ciudad: "La Banda",
      provincia: "Santiago del Estero",
      whatsapp: "+5493854000111",
    },
    equipos: { antenaModelo: "LiteBeam 5AC", antenaMac: "AA:BB:CC:DD:EE:FF", poe: true, canoMetros: 12 },
    plazo: { meses: 12, fechaInicio: "2026-01-05", fechaVencimiento: "2027-01-05" },
    fechaFirma: "2026-01-05",
    plantillaVersionId: "v1",
    documentos: [
      { documento: "comodato", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/comodato" },
    ],
    eventos: [],
    equiposPendientesDeRestitucion: false,
  } as DatosContratoDetalle;
}

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const enrutador = createMemoryRouter(
    [{ path: "/panel/contratos/:id", element: <PaginaDetalleContrato /> }],
    { initialEntries: ["/panel/contratos/c1"] },
  );
  render(
    <QueryClientProvider client={cliente}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>,
  );
}

describe("PaginaDetalleContrato", () => {
  it("reads the id from the route and asks for that contract", async () => {
    obtener.mockResolvedValue(contrato());
    renderizar();

    await waitFor(() => expect(obtener).toHaveBeenCalledWith("c1"));
  });

  it("announces the load, then shows the contract", async () => {
    obtener.mockResolvedValue(contrato());
    renderizar();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el contrato…");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Contrato N° 42");
  });

  it("offers a retry when the contract cannot be loaded", async () => {
    obtener.mockRejectedValue(new Error("red caída"));
    renderizar();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("downloads through the authenticated seam, never a bare link", async () => {
    obtener.mockResolvedValue(contrato());
    descargar.mockResolvedValue(undefined);
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Descargar Comodato" }));

    await waitFor(() =>
      expect(descargar).toHaveBeenCalledWith(
        expect.objectContaining({ enlace: "/contratos/c1/documentos/comodato" }),
      ),
    );
  });

  /**
   * The contract is already sealed and legally complete before this screen
   * ever renders. A failed download must therefore never read as "the
   * contract might not be signed" — it says only that the file could not be
   * fetched, and the action stays available.
   */
  it("reports a failed download without implying the contract is unsigned", async () => {
    obtener.mockResolvedValue(contrato());
    descargar.mockRejectedValue(
      new ErrorDeApi(500, { error: { codigo: "interno", mensaje: "No se pudo leer el archivo." } }),
    );
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Descargar Comodato" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent ?? "").not.toMatch(/firm/i);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Descargar Comodato" })).toBeEnabled(),
    );
  });

  it("offers a way back to the list", async () => {
    obtener.mockResolvedValue(contrato());
    renderizar();

    expect(screen.getByRole("link", { name: /Volver al listado/ })).toHaveAttribute(
      "href",
      "/panel",
    );
  });
});
