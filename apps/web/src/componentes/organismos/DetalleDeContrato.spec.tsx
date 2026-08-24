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
  };
}

const HISTORIA_COMPLETA: DatosContratoDetalle["eventos"] = [
  { tipo: "creado", fecha: null, detalle: null, usuario: null },
  { tipo: "firmado", fecha: "2026-01-05", detalle: "N° 42", usuario: null },
  {
    tipo: "dado_de_baja",
    fecha: "2026-06-30",
    detalle: "El cliente se mudó",
    usuario: "Marcela Coronel",
  },
  {
    tipo: "equipos_restituidos",
    fecha: "2026-07-04",
    detalle: null,
    usuario: "Marcela Coronel",
  },
];

/**
 * The history is the only part of this screen that answers *what happened*
 * rather than *what is*. It is also the only part that names an employee, so
 * what it does with a missing name matters as much as what it does with one.
 */
describe("DetalleDeContrato — historial", () => {
  const historia = () => contrato({ eventos: HISTORIA_COMPLETA });

  function seccionDeHistorial(): HTMLElement {
    return screen.getByRole("region", { name: "Historial" });
  }

  it("lists every event in the order it happened, in words rather than codes", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    const filas = within(seccionDeHistorial()).getAllByRole("listitem");
    expect(filas.map((fila) => fila.textContent)).toEqual([
      expect.stringContaining("Creado"),
      expect.stringContaining("Firmado"),
      expect.stringContaining("Dado de baja"),
      expect.stringContaining("Equipos restituidos"),
    ]);
    // The wire's snake_case is an API detail, never something a person reads.
    expect(seccionDeHistorial().textContent).not.toContain("dado_de_baja");
    expect(seccionDeHistorial().textContent).not.toContain("equipos_restituidos");
  });

  it("names who performed each transition that had an author", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    const filas = within(seccionDeHistorial()).getAllByRole("listitem");
    expect(filas[2]?.textContent).toContain("Marcela Coronel");
    expect(filas[3]?.textContent).toContain("Marcela Coronel");
  });

  /**
   * `creado` and `firmado` have no author and never will. Printing "por —"
   * beside them would invent a missing value where there is nothing missing.
   */
  it("says nothing about an author where there was never one", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    const filas = within(seccionDeHistorial()).getAllByRole("listitem");
    expect(filas[0]?.textContent).not.toContain("por");
    expect(filas[1]?.textContent).not.toContain("por");
  });

  it("still shows the event when its date is unknown", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    const primera = within(seccionDeHistorial()).getAllByRole("listitem")[0];
    expect(primera?.textContent).toContain("Creado");
    expect(primera?.textContent).not.toContain("null");
  });

  it("shows the reason a transition was given, when there is one", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    expect(within(seccionDeHistorial()).getByText("El cliente se mudó")).toBeInTheDocument();
  });

  /**
   * A contract the API answered before this field existed, or one read from a
   * cache written then. The screen must render, not crash on `undefined`.
   */
  it("survives an event with no usuario field at all", () => {
    const viejo = contrato({
      eventos: [{ tipo: "anulado", fecha: "2026-02-01", detalle: "Error de carga" } as never],
    });

    render(<DetalleDeContrato contrato={viejo} onDescargar={vi.fn()} />);

    expect(within(seccionDeHistorial()).getByText(/Anulado/)).toBeInTheDocument();
  });

  /**
   * PR21 change 3 — measured at 1280x800 (puppeteer, dev server): the last
   * section's `mb-5` (20px) does not collapse through `main`'s bottom
   * padding (`p-4 escritorio:p-6`), so it pushed the article's 924.5px
   * bottom edge to a 968.5px main bottom — 20px of dead scroll past the
   * 24px of padding the container already provides. `last:mb-0` drops the
   * margin exactly on the section that is the article's last child.
   */
  it("drops the trailing margin on the last section, so the scroll ends at the container's own padding", () => {
    render(<DetalleDeContrato contrato={historia()} onDescargar={vi.fn()} />);

    expect(seccionDeHistorial().className).toMatch(/\blast:mb-0\b/);
  });

  /** A draft that has only just been created still has one event. */
  it("is absent entirely when there is nothing to tell", () => {
    render(<DetalleDeContrato contrato={contrato({ eventos: [] })} onDescargar={vi.fn()} />);

    expect(screen.queryByRole("region", { name: "Historial" })).not.toBeInTheDocument();
  });
});

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
   * PR21 — the contract actions sit in the same row as the downloads: one
   * `flex flex-wrap items-center` container, downloads first. The slot is a
   * ReactNode so this half stays ignorant of transitions
   * (container-presentational, `convencionDeCapas.spec.ts`).
   */
  it("seats the acciones slot in the same row as the download buttons, downloads first", () => {
    render(
      <DetalleDeContrato
        contrato={contrato()}
        onDescargar={vi.fn()}
        acciones={<button type="button">Dar de baja</button>}
      />,
    );

    const lista = screen.getByRole("button", { name: "Descargar Comodato" }).closest("ul");
    const accion = screen.getByRole("button", { name: "Dar de baja" });
    expect(lista).not.toBeNull();

    const fila = accion.parentElement;
    expect(lista?.parentElement).toBe(fila);
    expect(fila?.className).toMatch(/\bflex\b/);
    expect(fila?.className).toMatch(/\bflex-wrap\b/);
    expect(fila?.className).toMatch(/\bitems-center\b/);
    expect(fila?.firstElementChild).toBe(lista);
  });

  it("still renders the acciones slot when a draft has no documents to download", () => {
    render(
      <DetalleDeContrato
        contrato={contrato({ numero: null, estado: "borrador", documentos: [] })}
        onDescargar={vi.fn()}
        acciones={<p>Este contrato todavía no se firmó.</p>}
      />,
    );

    expect(screen.getByText(/Todavía no hay documentos firmados/)).toBeInTheDocument();
    expect(screen.getByText("Este contrato todavía no se firmó.")).toBeInTheDocument();
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
