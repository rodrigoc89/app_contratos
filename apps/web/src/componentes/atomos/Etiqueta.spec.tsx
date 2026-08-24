import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Etiqueta } from "./Etiqueta";

describe("Etiqueta", () => {
  it("associates its text with the given field via htmlFor", () => {
    render(<Etiqueta htmlFor="dni">DNI</Etiqueta>);

    expect(screen.getByText("DNI")).toHaveAttribute("for", "dni");
  });

  it("carries the shared label styling class (PR8 — inline-flex is now block)", () => {
    render(<Etiqueta htmlFor="dni">DNI</Etiqueta>);

    expect(screen.getByText("DNI")).toHaveClass("block");
  });
});

/**
 * The same defect `Boton` already carries a comment about: a fixed
 * `className` after `{...resto}` protects the base class and, in doing so,
 * makes the atom unable to accept a modifier at all. The prop was dropped in
 * silence — a caller styling an option row got nothing back, and no error.
 */
describe("Etiqueta — className", () => {
  it("keeps its base class when no modifier is asked for", () => {
    render(<Etiqueta htmlFor="x">Nombre</Etiqueta>);

    expect(screen.getByText("Nombre")).toHaveClass("block");
  });

  it("merges a caller's modifier instead of dropping it", () => {
    render(
      <Etiqueta htmlFor="x" className="etiqueta--opcion">
        Nombre
      </Etiqueta>,
    );

    const etiqueta = screen.getByText("Nombre");
    expect(etiqueta).toHaveClass("block");
    expect(etiqueta).toHaveClass("etiqueta--opcion");
  });
});
