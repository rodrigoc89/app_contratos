import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CLASE_ACCIONES_FORMULARIO } from "../../estilos/formulario";
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

/**
 * The técnico's screens had no `h1` anywhere — not here, not on the equipos
 * step, not on the login before it. Every one of them opened with an `h2`
 * under nothing, which is both an accessibility defect and the reason the
 * screen felt anchorless: there was no title to land on.
 */
describe("FormularioComodatario — encabezado y progreso", () => {
  const propiedades = {
    valores: {
      nombreCompleto: "",
      dni: "",
      domicilioCalle: "",
      ciudad: "",
      whatsapp: "",
    },
    onCambiar: vi.fn(),
    onContinuar: vi.fn(),
    error: null,
    deshabilitado: false,
  };

  it("titles the screen with an h1, not an orphaned h2", () => {
    render(<FormularioComodatario {...propiedades} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nuevo contrato");
    // El nombre del paso lo dice el indicador, una sola vez.
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Datos del cliente");
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("says which step this is, so the customer's question has an answer", () => {
    render(<FormularioComodatario {...propiedades} />);

    expect(screen.getByText("Paso 1 de 2")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Progreso del contrato" }),
    ).toBeInTheDocument();
  });

  /**
   * Measured at 390x844 (puppeteer, dev server) before this change: the last
   * field wrapper's `mb-4` ended at 770.5px and the submit began at 810.5px
   * — a 40px gap, not the 24px this step's own source comment claimed. The
   * submit sat bare in the form, and `Boton` renders `inline-flex`: an
   * atomic inline-level box does not margin-collapse with the block sibling
   * before it, so the field's 16px and the button's 24px both applied in
   * full. Step 2 measured exactly 24px there, because its submit already
   * lived in the shared actions row, whose block-level box does collapse.
   *
   * Seating this submit in the same shared row is what makes the two steps
   * agree, and it removes 16px from a document that was 62px taller than the
   * viewport.
   */
  it("seats the submit in the shared actions row, so the last field's margin collapses into it", () => {
    render(<FormularioComodatario {...propiedades} />);

    const submit = screen.getByRole("button", { name: "Continuar" });

    expect(submit.parentElement?.className).toBe(CLASE_ACCIONES_FORMULARIO);
    expect(submit.className).not.toMatch(/(?:^|\s)mt-6(?:\s|$)/);
  });
});
