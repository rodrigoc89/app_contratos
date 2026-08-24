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

  /**
   * PR24a's "atoms are the styling seam" claim survives the redesign; only
   * the literal marker changes. The BEM `.boton` class the migration
   * retires (design-system-migration PR7) is replaced by `varianteBoton`'s
   * `cva` base classes — `inline-flex` is the structural one every variant
   * shares, so it is what proves the seam is still one place.
   */
  it("carries the shared cva base class (PR24a — atoms are the styling seam)", () => {
    render(<Boton onClick={() => {}}>Guardar</Boton>);

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("inline-flex");
  });

  /**
   * design-system-migration PR1 (design-system-foundation: "conflicting
   * utilities resolve to one winner") — `Boton` merges an incoming
   * `className` through `cn()` (`clsx` + `tailwind-merge`), not string
   * concatenation, so a caller's `bg-*` utility deterministically wins over
   * the atom's own default `bg-*` class instead of both landing in the DOM.
   */
  it("resolves a conflicting bg-* utility to exactly the incoming one", () => {
    render(
      <Boton onClick={() => {}} className="bg-error">
        Guardar
      </Boton>,
    );

    const clasesBg = screen
      .getByRole("button", { name: "Guardar" })
      .className.split(/\s+/)
      .filter((clase) => clase.startsWith("bg-"));

    expect(clasesBg).toEqual(["bg-error"]);
  });

  it("keeps a non-conflicting incoming class alongside the default bg-primario", () => {
    render(
      <Boton onClick={() => {}} className="mt-4">
        Guardar
      </Boton>,
    );

    const boton = screen.getByRole("button", { name: "Guardar" });
    expect(boton).toHaveClass("bg-primario");
    expect(boton).toHaveClass("mt-4");
  });
});
