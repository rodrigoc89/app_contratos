import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Etiqueta } from "./Etiqueta";

describe("Etiqueta", () => {
  it("associates its text with the given field via htmlFor", () => {
    render(<Etiqueta htmlFor="dni">DNI</Etiqueta>);

    expect(screen.getByText("DNI")).toHaveAttribute("for", "dni");
  });
});
