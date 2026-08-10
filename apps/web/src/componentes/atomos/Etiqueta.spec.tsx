import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Etiqueta } from "./Etiqueta";

describe("Etiqueta", () => {
  it("associates its text with the given field via htmlFor", () => {
    render(<Etiqueta htmlFor="dni">DNI</Etiqueta>);

    expect(screen.getByText("DNI")).toHaveAttribute("for", "dni");
  });

  it("carries the shared label styling class (PR24a — atoms are the styling seam)", () => {
    render(<Etiqueta htmlFor="dni">DNI</Etiqueta>);

    expect(screen.getByText("DNI")).toHaveClass("etiqueta");
  });
});
