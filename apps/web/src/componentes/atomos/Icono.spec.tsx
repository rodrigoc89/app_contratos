import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icono } from "./Icono";

describe("Icono", () => {
  it("exposes a descriptive label for assistive technology", () => {
    render(<Icono etiqueta="Cámara">📷</Icono>);

    expect(screen.getByRole("img", { name: "Cámara" })).toBeInTheDocument();
  });

  it("carries the shared icon styling class (PR24a — atoms are the styling seam)", () => {
    render(<Icono etiqueta="Cámara">📷</Icono>);

    expect(screen.getByRole("img", { name: "Cámara" })).toHaveClass("icono");
  });
});
