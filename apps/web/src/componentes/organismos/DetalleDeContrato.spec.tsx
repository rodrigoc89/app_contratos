import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DatosContratoDetalle } from "@contratos/esquemas";

import { DetalleDeContrato } from "./DetalleDeContrato";

function contrato(sobrescrituras: Partial<DatosContratoDetalle> = {}): DatosContratoDetalle {
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
      {
        documento: "condiciones_generales",
        sha256: "b".repeat(64),
        enlace: "/contratos/c1/documentos/condiciones_generales",
      },
    ],
    eventos: [],
    equiposPendientesDeRestitucion: false,
    ...sobrescrituras,
  } as DatosContratoDetalle;
}

describe("DetalleDeContrato", () => {
  it("heads the screen with the contract number and its estado badge", () => {
    render(<DetalleDeContrato contrato={contrato()} onDescargar={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Contrato N° 42");
    expect(screen.getByText("Vigente")).toHaveAttribute("data-estado", "vigente");
  });

  /** A draft has no numero, and "Contrato N° null" is the failure to avoid. */
  it("names an unnumbered draft honestly instead of printing a null", () => {
    render(
      <DetalleDeContrato
        contrato={contrato({ numero: null, estado: "borrador", documentos: [] })}
        onDescargar={vi.fn()}
      />,
    );

    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("Contrato sin número");
    expect(titulo.textContent).not.toContain("null");
  });

  it("shows the comodatario, the equipment and the plazo", () => {
    render(<DetalleDeContrato contrato={contrato()} onDescargar={vi.fn()} />);

    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText("30.123.456")).toBeInTheDocument();
    expect(screen.getByText("Belgrano 250, La Banda")).toBeInTheDocument();
    expect(screen.getByText("AA:BB:CC:DD:EE:FF")).toBeInTheDocument();
    expect(screen.getByText("12 meses")).toBeInTheDocument();
    expect(screen.getByText("2027-01-05")).toBeInTheDocument();
  });

  it("offers one download per sealed document, naming each in Spanish", () => {
    const onDescargar = vi.fn();
    render(<DetalleDeContrato contrato={contrato()} onDescargar={onDescargar} />);

    const documentos = screen.getByRole("list");
    expect(within(documentos).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Descargar Comodato" }));
    expect(onDescargar).toHaveBeenCalledWith(
      expect.objectContaining({ documento: "comodato" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Descargar Condiciones generales" }));
    expect(onDescargar).toHaveBeenCalledWith(
      expect.objectContaining({ documento: "condiciones_generales" }),
    );
  });

  /**
   * The domain forbids a draft from carrying sealed documents, so an empty
   * list is a real state rather than a loading artefact. Offering a download
   * here would answer 409 — saying so up front is the honest screen.
   */
  it("explains a draft has no documents instead of offering a download that would fail", () => {
    render(
      <DetalleDeContrato contrato={contrato({ estado: "borrador", documentos: [] })} onDescargar={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no hay documentos firmados/)).toBeInTheDocument();
  });

  it("disables the downloads while one is in flight, and says which", () => {
    render(
      <DetalleDeContrato contrato={contrato()} onDescargar={vi.fn()} descargando="comodato" />,
    );

    expect(screen.getByRole("button", { name: "Descargando Comodato…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descargar Condiciones generales" })).toBeDisabled();
  });

  /**
   * The one thing on this screen that asks a human to act: company hardware
   * still at the home of someone who is no longer a customer (DESIGN.md §3).
   * `role="alert"` rather than another data row, so a screen reader is told.
   */
  it("raises an alert when the equipment has not been returned", () => {
    render(
      <DetalleDeContrato
        contrato={contrato({ estado: "dado_de_baja", equiposPendientesDeRestitucion: true })}
        onDescargar={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("El equipo todavía no fue restituido.");
  });

  it("raises no alert when the equipment came back", () => {
    render(<DetalleDeContrato contrato={contrato()} onDescargar={vi.fn()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
