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
