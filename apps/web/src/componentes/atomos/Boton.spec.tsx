import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Boton } from "./Boton";

describe("Boton", () => {
  it("renders its label and calls onClick when tapped", async () => {
    const alHacerClic = vi.fn();
    render(<Boton onClick={alHacerClic}>Guardar</Boton>);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(alHacerClic).toHaveBeenCalledTimes(1);
  });

  it("stays disabled and blocks the click handler when disabled is set", async () => {
    const alHacerClic = vi.fn();
    render(
      <Boton onClick={alHacerClic} disabled>
        Guardar
      </Boton>,
    );

    const boton = screen.getByRole("button", { name: "Guardar" });
    expect(boton).toBeDisabled();

    await userEvent.click(boton);

    expect(alHacerClic).not.toHaveBeenCalled();
  });

  it("carries the shared button styling class (PR24a — atoms are the styling seam)", () => {
    render(<Boton onClick={() => {}}>Guardar</Boton>);

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("boton");
  });
});
