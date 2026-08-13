import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndicadorDePaso } from "./IndicadorDePaso";

const PASOS = ["Datos del cliente", "Equipos entregados"] as const;

describe("IndicadorDePaso", () => {
  it("names every step, in order", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={1} />);

    const elementos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(elementos.map((e) => e.textContent)).toEqual([
      expect.stringContaining("Datos del cliente"),
      expect.stringContaining("Equipos entregados"),
    ]);
  });

  /**
   * The point of the whole component: a técnico filling this in with a
   * customer watching should be able to tell how much is left without
   * counting screens.
   */
  it("says where the técnico is, in words a person reads", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={1} />);

    expect(screen.getByText("Paso 1 de 2")).toBeInTheDocument();
  });

  /**
   * `aria-current="step"` is the only machine-readable statement of which one
   * is live. Colour alone would say nothing to a screen reader, and colour
   * alone is also what fails first in direct sunlight.
   */
  it("marks the current step for assistive technology, not only visually", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={2} />);

    const elementos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(elementos[0]).not.toHaveAttribute("aria-current");
    expect(elementos[1]).toHaveAttribute("aria-current", "step");
  });

  /** Each step carries its own number, so the list is readable out of order. */
  it("numbers each step", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={1} />);

    const elementos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(elementos[0]?.textContent).toContain("1");
    expect(elementos[1]?.textContent).toContain("2");
  });

  /**
   * A step already left is not the same as one not yet reached, and the
   * difference is what tells the técnico the earlier data is safe.
   */
  it("distinguishes a completed step from one still ahead", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={2} />);

    const elementos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(elementos[0]?.className).toContain("indicador-de-paso__paso--cumplido");
    expect(elementos[1]?.className).not.toContain("indicador-de-paso__paso--cumplido");
  });

  /**
   * The navigation landmark is named, because a técnico using a screen reader
   * on a tablet gets a list of landmarks and "navigation" alone names nothing.
   */
  it("is a named navigation landmark", () => {
    render(<IndicadorDePaso pasos={PASOS} actual={1} />);

    expect(screen.getByRole("navigation", { name: "Progreso del contrato" })).toBeInTheDocument();
  });
});
