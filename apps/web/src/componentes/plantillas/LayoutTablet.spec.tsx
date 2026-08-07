import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LayoutTablet } from "./LayoutTablet";

describe("LayoutTablet", () => {
  it("renders its children inside the tablet shell", () => {
    render(
      <LayoutTablet>
        <p>Contenido de la visita</p>
      </LayoutTablet>,
    );

    expect(screen.getByText("Contenido de la visita")).toBeInTheDocument();
  });
});
