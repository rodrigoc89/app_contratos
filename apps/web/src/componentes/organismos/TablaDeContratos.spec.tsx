import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DatosContratoResumen } from "@contratos/esquemas";

import { TablaDeContratos } from "./TablaDeContratos";

function contrato(sobrescrituras: Partial<DatosContratoResumen> = {}): DatosContratoResumen {
  return {
    id: "c1",
    numero: 42,
    estado: "vigente",
    comodatario: { nombreCompleto: "Ana López", dni: "30.123.456" },
    fechaFirma: "2026-01-05",
    ...sobrescrituras,
  };
}

/**
 * R-2.9 (the six-field row shape), R-3.4 (rows are read-only), R-3.6 (real
 * table semantics + `data-etiqueta`). DESIGN.md D12: explicit roles because
 * `display: block` (the narrow-viewport reflow) destroys the implicit table
 * semantics several screen readers rely on.
 */
describe("TablaDeContratos", () => {
  it("exposes real table semantics with one columnheader per displayed field", () => {
    render(<TablaDeContratos contratos={[contrato()]} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  });

  it("renders one row role per contract plus the header row", () => {
    render(<TablaDeContratos contratos={[contrato({ id: "c1" }), contrato({ id: "c2" })]} />);

    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("carries a data-etiqueta on every cell equal to its column header", () => {
    const { container } = render(<TablaDeContratos contratos={[contrato()]} />);

    const encabezados = screen.getAllByRole("columnheader").map((nodo) => nodo.textContent);
    const celdas = container.querySelectorAll('[role="cell"]');

    expect(celdas).toHaveLength(5);
    for (const celda of celdas) {
      expect(encabezados).toContain(celda.getAttribute("data-etiqueta"));
    }
  });

  it("shows every row field: numero, estado, name, DNI and fechaFirma", () => {
    render(<TablaDeContratos contratos={[contrato()]} />);

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(fila).getByText("42")).toBeInTheDocument();
    expect(within(fila).getByText("Vigente")).toBeInTheDocument();
    expect(within(fila).getByText("Ana López")).toBeInTheDocument();
    expect(within(fila).getByText("30.123.456")).toBeInTheDocument();
    expect(within(fila).getByText("2026-01-05")).toBeInTheDocument();
  });

  /**
   * The estado column is the one field the row does not render verbatim: it
   * goes through a label map. A missing entry does not crash and does not
   * blank the cell — it puts the storage enum on screen, so the office reads
   * "dado_de_baja" instead of "Dado de baja". Asserting the label alone would
   * not catch a map that happened to echo its key, so the raw enum is asserted
   * absent as well.
   */
  it.each([
    ["borrador", "Borrador"],
    ["vigente", "Vigente"],
    ["dado_de_baja", "Dado de baja"],
    ["anulado", "Anulado"],
  ] as const)("renders estado %s as its Spanish label, never the storage enum", (estado, etiqueta) => {
    render(<TablaDeContratos contratos={[contrato({ estado })]} />);

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(fila).getByText(etiqueta)).toBeInTheDocument();
    expect(within(fila).queryByText(estado)).not.toBeInTheDocument();
  });

  it("shows a draft's null numero and null fechaFirma as an honest placeholder, never a blank cell or a crash", () => {
    render(<TablaDeContratos contratos={[contrato({ estado: "borrador", numero: null, fechaFirma: null })]} />);

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(fila).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("exposes no link or button role inside any row — rows are read-only", () => {
    render(<TablaDeContratos contratos={[contrato()]} />);

    for (const fila of screen.getAllByRole("row")) {
      expect(within(fila).queryByRole("link")).not.toBeInTheDocument();
      expect(within(fila).queryByRole("button")).not.toBeInTheDocument();
    }
  });

  it("does nothing observable when a row is clicked", () => {
    render(<TablaDeContratos contratos={[contrato()]} />);
    const fila = screen.getAllByRole("row")[1] as HTMLElement;

    expect(() => fireEvent.click(fila)).not.toThrow();
  });

  it("wraps the table in a focusable, labeled scroll region (the mid-range safety net)", () => {
    render(<TablaDeContratos contratos={[contrato()]} />);

    const region = screen.getByRole("region");
    expect(region).toHaveAccessibleName();
    expect(region).toHaveAttribute("tabIndex", "0");
  });
});
