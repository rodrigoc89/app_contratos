import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BarraDeBusqueda } from "./BarraDeBusqueda";

/**
 * R-3.7 (keyboard operability, Enter flush, Escape clear) and R-3.5/D14
 * (the `estados` filter as toggle buttons, not checkboxes — sidesteps the
 * global 48px checkbox rule instead of fighting it).
 */
describe("BarraDeBusqueda", () => {
  it("renders a role=search form with the search box and estado filter group", () => {
    render(
      <BarraDeBusqueda
        termino=""
        onCambiarTermino={vi.fn()}
        onBuscarInmediato={vi.fn()}
        estados={[]}
        onAlternarEstado={vi.fn()}
      />,
    );

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /filtrar por estado/i })).toBeInTheDocument();
  });

  it("reflects every keystroke immediately through the controlled value", () => {
    const onCambiarTermino = vi.fn();
    render(
      <BarraDeBusqueda
        termino=""
        onCambiarTermino={onCambiarTermino}
        onBuscarInmediato={vi.fn()}
        estados={[]}
        onAlternarEstado={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "p" } });

    expect(onCambiarTermino).toHaveBeenCalledWith("p");
  });

  it("flushes the search on submit (Enter) and never reloads the page", () => {
    const onBuscarInmediato = vi.fn();
    render(
      <BarraDeBusqueda
        termino="perez"
        onCambiarTermino={vi.fn()}
        onBuscarInmediato={onBuscarInmediato}
        estados={[]}
        onAlternarEstado={vi.fn()}
      />,
    );

    fireEvent.submit(screen.getByRole("search"));

    expect(onBuscarInmediato).toHaveBeenCalledTimes(1);
  });

  it("clears the term on Escape", () => {
    const onCambiarTermino = vi.fn();
    render(
      <BarraDeBusqueda
        termino="perez"
        onCambiarTermino={onCambiarTermino}
        onBuscarInmediato={vi.fn()}
        estados={[]}
        onAlternarEstado={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });

    expect(onCambiarTermino).toHaveBeenCalledWith("");
  });

  it("exposes each estado as a toggle button with aria-pressed", () => {
    render(
      <BarraDeBusqueda
        termino=""
        onCambiarTermino={vi.fn()}
        onBuscarInmediato={vi.fn()}
        estados={["vigente"]}
        onAlternarEstado={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Vigente", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrador", pressed: false })).toBeInTheDocument();
  });

  it("calls onAlternarEstado with the clicked estado", () => {
    const onAlternarEstado = vi.fn();
    render(
      <BarraDeBusqueda
        termino=""
        onCambiarTermino={vi.fn()}
        onBuscarInmediato={vi.fn()}
        estados={[]}
        onAlternarEstado={onAlternarEstado}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Anulado" }));

    expect(onAlternarEstado).toHaveBeenCalledWith("anulado");
  });
});
