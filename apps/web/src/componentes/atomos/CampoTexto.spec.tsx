import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampoTexto } from "./CampoTexto";

describe("CampoTexto", () => {
  it("reports the typed value through onCambiar", () => {
    const alCambiar = vi.fn();
    render(<CampoTexto aria-label="dni" value="" onCambiar={alCambiar} />);

    fireEvent.change(screen.getByLabelText("dni"), { target: { value: "20304050607" } });

    expect(alCambiar).toHaveBeenCalledWith("20304050607");
  });

  it("renders the given value back into the field", () => {
    render(<CampoTexto aria-label="nombre" value="Ana" onCambiar={() => {}} readOnly />);

    expect(screen.getByLabelText("nombre")).toHaveValue("Ana");
  });
});
