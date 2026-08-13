import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { DatosContratoResumen } from "@contratos/esquemas";

import { TablaDeContratos } from "./TablaDeContratos";

/** Rows link to `/contratos/:id`, so every render needs a router around it. */
function enRuta({ children }: { readonly children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

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
    render(<TablaDeContratos contratos={[contrato()]} />, { wrapper: enRuta });

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  });

  it("renders one row role per contract plus the header row", () => {
    render(<TablaDeContratos contratos={[contrato({ id: "c1" }), contrato({ id: "c2" })]} />, { wrapper: enRuta });

    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("carries a data-etiqueta on every cell equal to its column header", () => {
    const { container } = render(<TablaDeContratos contratos={[contrato()]} />, { wrapper: enRuta });

    const encabezados = screen.getAllByRole("columnheader").map((nodo) => nodo.textContent);
    const celdas = container.querySelectorAll('[role="cell"]');

    expect(celdas).toHaveLength(5);
    for (const celda of celdas) {
      expect(encabezados).toContain(celda.getAttribute("data-etiqueta"));
    }
  });

  it("shows every row field: numero, estado, name, DNI and fechaFirma", () => {
    render(<TablaDeContratos contratos={[contrato()]} />, { wrapper: enRuta });

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
    render(<TablaDeContratos contratos={[contrato({ estado })]} />, { wrapper: enRuta });

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(fila).getByText(etiqueta)).toBeInTheDocument();
    expect(within(fila).queryByText(estado)).not.toBeInTheDocument();
  });

  /**
   * The estado is what this screen exists to answer, so it is the one field
   * that carries a visual encoding as well as its label. The encoding hangs
   * off `data-estado`, which is markup and therefore assertable here, rather
   * than off a colour jsdom cannot see.
   *
   * The label is asserted to survive on purpose: colour must never be the
   * only carrier of the meaning — for a colour-blind reader, and for anyone
   * reading a printed or greyscale screenshot, the Spanish word is what
   * remains.
   */
  it.each([
    ["borrador", "Borrador"],
    ["vigente", "Vigente"],
    ["dado_de_baja", "Dado de baja"],
    ["anulado", "Anulado"],
  ] as const)("marks estado %s with a data-estado hook while keeping its label as text", (estado, etiqueta) => {
    render(<TablaDeContratos contratos={[contrato({ estado })]} />, { wrapper: enRuta });

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    const insignia = within(fila).getByText(etiqueta);

    expect(insignia).toHaveAttribute("data-estado", estado);
    expect(insignia.textContent).toBe(etiqueta);
  });

  it("shows a draft's null numero and null fechaFirma as an honest placeholder, never a blank cell or a crash", () => {
    render(<TablaDeContratos contratos={[contrato({ estado: "borrador", numero: null, fechaFirma: null })]} />, { wrapper: enRuta });

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(fila).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  /**
   * R-3.4, amended once the office detail screen existed.
   *
   * The original requirement was "rows expose no interactive element", and
   * its reason was written down: no detail screen existed to land on, so a
   * row that looked clickable would have promised something that never
   * happened. That reason expired — `/contratos/:id` is now a real screen,
   * and reaching a contract's PDFs from the list is the office's actual job.
   *
   * What survives is the part that was never about navigation: **the row
   * itself is not a click target.** A whole-row handler is invisible to the
   * keyboard, announces nothing, and swallows text selection. Instead each
   * row exposes exactly ONE link — the customer's name, which is what the
   * office is scanning for and is present even on a draft with no numero.
   * One link per row also keeps the tab order to one stop per row (R-3.7).
   */
  it("exposes exactly one link per row — the name — and no buttons", () => {
    render(
      <TablaDeContratos contratos={[contrato({ id: "c1" }), contrato({ id: "c2" })]} />,
      { wrapper: enRuta },
    );

    const filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);

    for (const fila of filas) {
      expect(within(fila).getAllByRole("link")).toHaveLength(1);
      expect(within(fila).queryByRole("button")).not.toBeInTheDocument();
    }
  });

  it("points each row's link at that contract's detail", () => {
    render(<TablaDeContratos contratos={[contrato({ id: "abc-123" })]} />, { wrapper: enRuta });

    const fila = screen.getAllByRole("row")[1] as HTMLElement;
    const enlace = within(fila).getByRole("link", { name: "Ana López" });

    expect(enlace).toHaveAttribute("href", "/panel/contratos/abc-123");
  });

  it("still exposes no click handler on the row itself", () => {
    render(<TablaDeContratos contratos={[contrato()]} />, { wrapper: enRuta });
    const fila = screen.getAllByRole("row")[1] as HTMLElement;

    expect(() => fireEvent.click(fila)).not.toThrow();
    expect(fila).not.toHaveAttribute("onclick");
  });

  it("wraps the table in a focusable, labeled scroll region (the mid-range safety net)", () => {
    render(<TablaDeContratos contratos={[contrato()]} />, { wrapper: enRuta });

    const region = screen.getByRole("region");
    expect(region).toHaveAccessibleName();
    expect(region).toHaveAttribute("tabIndex", "0");
  });
});
