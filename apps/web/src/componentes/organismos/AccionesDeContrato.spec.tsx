import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DatosContratoDetalle, EstadoContrato } from "@contratos/esquemas";

import { AccionesDeContrato } from "./AccionesDeContrato";

function contrato(
  estado: EstadoContrato,
  equiposPendientesDeRestitucion = false,
): DatosContratoDetalle {
  return {
    id: "c1",
    estado,
    numero: estado === "borrador" ? null : 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "Belgrano 250",
      ciudad: "La Banda",
      provincia: "Santiago del Estero",
      whatsapp: "+5493854000111",
    },
    equipos: { antenaModelo: "LiteBeam", antenaMac: "AA:BB:CC:DD:EE:FF", poe: true, canoMetros: 12 },
    plazo: null,
    fechaFirma: estado === "borrador" ? null : "2026-01-05",
    plantillaVersionId: "v1",
    documentos: [],
    eventos: [],
    equiposPendientesDeRestitucion,
  };
}

function props(sobrescrituras: Partial<Parameters<typeof AccionesDeContrato>[0]> = {}) {
  return {
    contrato: contrato("vigente"),
    onDarDeBaja: vi.fn(),
    onAnular: vi.fn(),
    onRegistrarRestitucion: vi.fn(),
    ...sobrescrituras,
  };
}

/**
 * The screen mirrors the aggregate's rules so it never offers an action that
 * would answer 409. The server stays the authority — these assertions are
 * about not asking, not about deciding.
 */
describe("AccionesDeContrato", () => {
  it("offers termination and annulment while the contract is in force", () => {
    render(<AccionesDeContrato {...props()} />);

    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restitución/i })).not.toBeInTheDocument();
  });

  it("offers only the restitution once the contract has been terminated", () => {
    render(<AccionesDeContrato {...props({ contrato: contrato("dado_de_baja", true) })} />);

    expect(screen.getByRole("button", { name: "Registrar restitución" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar de baja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it.each([
    ["borrador", "todavía no se firmó"],
    ["anulado", "ya está cerrado"],
  ] as const)("explains why %s offers nothing, instead of rendering an empty section", (estado, texto) => {
    render(<AccionesDeContrato {...props({ contrato: contrato(estado) })} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(new RegExp(texto))).toBeInTheDocument();
  });

  it("offers nothing on a terminated contract whose equipment already came back", () => {
    render(<AccionesDeContrato {...props({ contrato: contrato("dado_de_baja", false) })} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  /**
   * Neither ending is a bare button. PR25 established the rule for the
   * signature pad's Borrar/Firmar pair; the same care applies to an action
   * that ends someone's agreement.
   */
  it("asks for a reason and a date before terminating, never on one click", () => {
    const onDarDeBaja = vi.fn();
    render(<AccionesDeContrato {...props({ onDarDeBaja })} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(onDarDeBaja).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Deuda" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2027-03-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onDarDeBaja).toHaveBeenCalledWith({ motivo: "Deuda", fecha: "2027-03-10" });
  });

  it("marks the annulment destructive by name, never by position", () => {
    render(<AccionesDeContrato {...props()} />);

    expect(screen.getByRole("button", { name: "Anular" })).toHaveClass("bg-error");
    expect(screen.getByRole("button", { name: "Dar de baja" })).not.toHaveClass("bg-error");
  });

  it("warns what annulment means before confirming it", () => {
    render(<AccionesDeContrato {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Anular" }));

    expect(screen.getByText(/datos equivocados/)).toBeInTheDocument();
    expect(screen.getByText(/firmar uno nuevo/)).toBeInTheDocument();
  });

  /** Equipment coming back is a fact, not a decision — it carries no reason. */
  it("asks only for a date when registering the restitution", () => {
    const onRegistrarRestitucion = vi.fn();
    render(
      <AccionesDeContrato
        {...props({ contrato: contrato("dado_de_baja", true), onRegistrarRestitucion })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Registrar restitución" }));
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2027-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onRegistrarRestitucion).toHaveBeenCalledWith({ fecha: "2027-04-01" });
  });

  /**
   * PR21 — the component no longer brings its own section: the triggers are
   * a cluster made to live inside DetalleDeContrato's documents row, so a
   * heading of its own would be a second frame around the same row.
   */
  it("renders no Acciones heading of its own — the triggers live in the documents row now", () => {
    render(<AccionesDeContrato {...props()} />);

    expect(screen.queryByRole("heading", { name: "Acciones" })).not.toBeInTheDocument();
  });

  /**
   * The honest no-actions copy survives, but as a full-width paragraph:
   * inside the shared `flex flex-wrap` documents row, `w-full` is what
   * makes it wrap onto its own line under the download buttons instead of
   * sitting between them as one more flex item.
   */
  it("lets the no-actions message take its own line under the shared row", () => {
    render(<AccionesDeContrato {...props({ contrato: contrato("anulado") })} />);

    const mensaje = screen.getByText(/ya está cerrado/);
    expect(mensaje.className).toMatch(/\bw-full\b/);
    expect(screen.queryByRole("heading", { name: "Acciones" })).not.toBeInTheDocument();
  });

  /**
   * PR21 — the confirmation moved from an inline form into a modal
   * (`Dialogo`, native `<dialog>`): the actions are joining the documents
   * row, where an inline form has no room to unfold. Visibility is asserted
   * through the dialog role and its `open` state — the installed jsdom has
   * no `showModal()`, so the guarded `open`-attribute fallback is what runs.
   */
  it("opens the confirmation as a modal dialog titled by the action, with the triggers still behind it", () => {
    render(<AccionesDeContrato {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));

    const dialogo = screen.getByRole("dialog", { name: "Dar de baja el contrato" });
    expect(dialogo).toHaveAttribute("open");
    expect(dialogo).toContainElement(screen.getByLabelText("Motivo"));
    // The row is behind the backdrop, not replaced: the modal never
    // rewrites the page under itself.
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  /**
   * Executing the destructive action is what the variant marks — the same
   * colour-not-position rule guard 4 enforces for the trigger pair.
   */
  it("marks the anulación modal's Confirmar destructive, and the baja modal's not", () => {
    const { unmount } = render(<AccionesDeContrato {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveClass("bg-error");
    unmount();

    render(<AccionesDeContrato {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toHaveClass("bg-error");
  });

  it("resets the fields when Esc closes the modal, exactly like Cancelar", () => {
    const { container } = render(<AccionesDeContrato {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Deuda" } });

    const dialogo = container.querySelector("dialog");
    expect(dialogo).not.toBeNull();
    if (dialogo === null) return;
    // jsdom never synthesises Esc's default action; the native `cancel`
    // event is what a real Esc dispatches, so it is dispatched directly.
    fireEvent(dialogo, new Event("cancel"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
  });

  it("lets the office back out without changing anything", () => {
    const onDarDeBaja = vi.fn();
    render(<AccionesDeContrato {...props({ onDarDeBaja })} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onDarDeBaja).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
  });

  it("blocks a second confirmation while one is already in flight", () => {
    render(<AccionesDeContrato {...props({ enCurso: true })} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  });
});
