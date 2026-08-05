import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("exposes its loading state to assistive technology via the given label", () => {
    render(<Spinner etiqueta="Guardando cambios" />);

    expect(screen.getByRole("status", { name: "Guardando cambios" })).toBeInTheDocument();
  });
});
