import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LayoutTecnico } from "./LayoutTecnico";

describe("LayoutTecnico", () => {
  it("renders its children inside the técnico shell", () => {
    render(
      <LayoutTecnico>
        <p>Contenido de la visita</p>
      </LayoutTecnico>,
    );

    expect(screen.getByText("Contenido de la visita")).toBeInTheDocument();
  });
});
