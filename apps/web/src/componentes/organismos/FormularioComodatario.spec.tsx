import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormularioComodatario, type ValoresComodatario } from "./FormularioComodatario";

/**
 * Spec `borrador-form` — step 1 of "Create draft": a presentational form for
 * `EsquemaComodatario`'s five fields. Purely controlled — the container owns
 * validation and step transitions (DESIGN.md D10 container/presentational
 * split).
 */

const VALORES_VACIOS: ValoresComodatario = {
  nombreCompleto: "",
  dni: "",
  domicilioCalle: "",
  ciudad: "",
  whatsapp: "",
};

describe("FormularioComodatario", () => {
  it("reports every field change through onCambiar with the field name and the new value", () => {
    const onCambiar = vi.fn();
    render(
      <FormularioComodatario
        valores={VALORES_VACIOS}
        onCambiar={onCambiar}
        onContinuar={vi.fn()}
        error={null}
        deshabilitado={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Ana López" } });
    fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30123456" } });

    expect(onCambiar).toHaveBeenCalledWith("nombreCompleto", "Ana López");
    expect(onCambiar).toHaveBeenCalledWith("dni", "30123456");
  });

  it("calls onContinuar when the form is submitted", () => {
    const onContinuar = vi.fn();
    render(
      <FormularioComodatario
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onContinuar={onContinuar}
        error={null}
        deshabilitado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onContinuar).toHaveBeenCalledTimes(1);
  });

  it("shows the given error message and disables the fields while submitting", () => {
    render(
      <FormularioComodatario
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onContinuar={vi.fn()}
        error="Complete el nombre y apellido."
        deshabilitado={true}
      />,
    );

    expect(screen.getByText("Complete el nombre y apellido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre y apellido")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("renders no error alert when error is null", () => {
    render(
      <FormularioComodatario
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onContinuar={vi.fn()}
        error={null}
        deshabilitado={false}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
