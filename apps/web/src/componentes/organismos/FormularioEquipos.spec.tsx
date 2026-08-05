import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormularioEquipos, type ValoresEquipos } from "./FormularioEquipos";

/**
 * Spec `borrador-form` — step 2: `EsquemaEquipos`'s four fields, with the
 * manual `antenaMac` entry required by this slice (camera scanning is slice
 * 12, DESIGN.md D6). `poe` has no default (DESIGN.md §Structure,
 * `packages/esquemas/src/contrato.ts`): it renders as two radios, not a
 * checkbox, so an untouched field stays `undefined` rather than silently
 * becoming `false`.
 */

const VALORES_VACIOS: ValoresEquipos = {
  antenaModelo: "",
  antenaMac: "",
  poe: undefined,
  canoMetros: "",
};

describe("FormularioEquipos", () => {
  it("reports text field changes through onCambiar with the field name and the new value", () => {
    const onCambiar = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={onCambiar}
        onCambiarPoe={vi.fn()}
        onCrear={vi.fn()}
        error={null}
        deshabilitado={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "Ubiquiti LiteBeam" } });
    fireEvent.change(screen.getByLabelText("Dirección MAC de la antena"), {
      target: { value: "AC:8B:A9:12:34:56" },
    });

    expect(onCambiar).toHaveBeenCalledWith("antenaModelo", "Ubiquiti LiteBeam");
    expect(onCambiar).toHaveBeenCalledWith("antenaMac", "AC:8B:A9:12:34:56");
  });

  it("reports the poe choice through onCambiarPoe, distinguishing Sí from No", () => {
    const onCambiarPoe = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={onCambiarPoe}
        onCrear={vi.fn()}
        error={null}
        deshabilitado={false}
      />,
    );

    fireEvent.click(screen.getByLabelText("Sí"));
    expect(onCambiarPoe).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText("No"));
    expect(onCambiarPoe).toHaveBeenCalledWith(false);
  });

  it("calls onCrear when the form is submitted", () => {
    const onCrear = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onCrear={onCrear}
        error={null}
        deshabilitado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(onCrear).toHaveBeenCalledTimes(1);
  });

  it("shows the given error message and disables the fields while submitting", () => {
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onCrear={vi.fn()}
        error="La dirección MAC no es válida."
        deshabilitado={true}
      />,
    );

    expect(screen.getByText("La dirección MAC no es válida.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear borrador" })).toBeDisabled();
  });
});
