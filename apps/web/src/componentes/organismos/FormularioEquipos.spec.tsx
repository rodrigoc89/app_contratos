import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormularioEquipos, type ValoresEquipos } from "./FormularioEquipos";

/**
 * `EscanerDeMac` (PR16) offers the camera-based scan beside the manual
 * field. Its own default `comprobarDisponibilidad` runs the real browser
 * check (`verificarDisponibilidadDeEscaneo`), which resolves asynchronously
 * even in jsdom (no `BarcodeDetector` here, so it settles to
 * "no_disponible") — `esperarComprobacionDeCamara` flushes that microtask
 * so no test leaks an unawaited state update (the PR13/PR17 lesson: an
 * unflushed post-render promise is exactly what produced flaky suites
 * before).
 */
async function esperarComprobacionDeCamara(): Promise<void> {
  await act(async () => {});
}

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
  it("reports text field changes through onCambiar with the field name and the new value", async () => {
    const onCambiar = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={onCambiar}
        onCambiarPoe={vi.fn()}
        onVolver={vi.fn()}
        onEnviar={vi.fn()}
        etiquetaEnvio="Crear borrador"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "Ubiquiti LiteBeam" } });
    fireEvent.change(screen.getByLabelText("Dirección MAC de la antena"), {
      target: { value: "AC:8B:A9:12:34:56" },
    });

    expect(onCambiar).toHaveBeenCalledWith("antenaModelo", "Ubiquiti LiteBeam");
    expect(onCambiar).toHaveBeenCalledWith("antenaMac", "AC:8B:A9:12:34:56");
  });

  it("reports the poe choice through onCambiarPoe, distinguishing Sí from No", async () => {
    const onCambiarPoe = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={onCambiarPoe}
        onVolver={vi.fn()}
        onEnviar={vi.fn()}
        etiquetaEnvio="Crear borrador"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    fireEvent.click(screen.getByLabelText("Sí"));
    expect(onCambiarPoe).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText("No"));
    expect(onCambiarPoe).toHaveBeenCalledWith(false);
  });

  it("calls onEnviar with the given etiquetaEnvio label when the form is submitted", async () => {
    const onEnviar = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onVolver={vi.fn()}
        onEnviar={onEnviar}
        etiquetaEnvio="Crear borrador"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  /**
   * Task 19.1 (maintainer decision — overrules task 7.3's single-click
   * auto-transition): once the draft exists, this same step's submit action
   * moves into signing instead of creating a second draft. The button's
   * label is a prop precisely so the container decides which action is live
   * — never a hidden mode this organism infers on its own.
   */
  it("renders the given etiquetaEnvio as the submit button's own label, not a fixed one", async () => {
    const onEnviar = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onVolver={vi.fn()}
        onEnviar={onEnviar}
        etiquetaEnvio="Continuar"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    expect(screen.queryByRole("button", { name: "Crear borrador" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  /**
   * Task 19.1 — editing `comodatario` post-creation requires a way back to
   * that step; `FormularioEquipos` is the only step with no way back before
   * this. `Volver` is a plain `type="button"`, never the form's submit, so
   * tapping it can never accidentally fire `onEnviar`.
   */
  it("calls onVolver, and only onVolver, when Volver is tapped", async () => {
    const onVolver = vi.fn();
    const onEnviar = vi.fn();
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onVolver={onVolver}
        onEnviar={onEnviar}
        etiquetaEnvio="Crear borrador"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onVolver).toHaveBeenCalledTimes(1);
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("shows the given error message and disables the fields while submitting", async () => {
    render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onVolver={vi.fn()}
        onEnviar={vi.fn()}
        etiquetaEnvio="Crear borrador"
        error="La dirección MAC no es válida."
        deshabilitado={true}
      />,
    );
    await esperarComprobacionDeCamara();

    expect(screen.getByText("La dirección MAC no es válida.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear borrador" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver" })).toBeDisabled();
  });

  /**
   * PR18 (task 18.1) — `antenaMac` is now offered through `EscanerDeMac`
   * (PR16), which renders the exact same label and id itself as a drop-in
   * replacement for the old plain block. If the old block is ever left in
   * place alongside it, the document ends up with two elements sharing the
   * `antenaMac` id, and the technician would see the field twice.
   *
   * `getByLabelText`/`getAllByLabelText` cannot catch this on their own: a
   * duplicate `id` means both `<label for="antenaMac">`s resolve — via the
   * same `getElementById`-style lookup the DOM itself uses — to the first
   * matching input only, so Testing Library silently de-duplicates down to
   * one control either way. Querying the DOM directly by id, the way a
   * browser genuinely sees it, is the assertion that actually fails when
   * the old block is left in place (verified by breaking: temporarily
   * re-adding it made this assertion see 2 elements, not 1, before the old
   * block was removed for good).
   */
  it("wires antenaMac through EscanerDeMac with no duplicate manual field left behind", async () => {
    const { container } = render(
      <FormularioEquipos
        valores={VALORES_VACIOS}
        onCambiar={vi.fn()}
        onCambiarPoe={vi.fn()}
        onVolver={vi.fn()}
        onEnviar={vi.fn()}
        etiquetaEnvio="Crear borrador"
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    expect(container.querySelectorAll('[id="antenaMac"]')).toHaveLength(1);
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });
});

/**
 * Three defects measured on a 1280×800 tablet before this suite existed:
 * no `h1` on the screen at all, "Volver" and the submit rendered pixel for
 * pixel identical, and each radio's own text sitting 17px below the centre of
 * its 48px control.
 */
describe("FormularioEquipos — encabezado, jerarquía y radios", () => {
  const propiedades = {
    valores: { antenaModelo: "", antenaMac: "", poe: undefined, canoMetros: "" },
    onCambiar: vi.fn(),
    onCambiarPoe: vi.fn(),
    onVolver: vi.fn(),
    onEnviar: vi.fn(),
    etiquetaEnvio: "Crear borrador",
    error: null,
    deshabilitado: false,
  };

  it("titles the screen with an h1, not an orphaned h2", () => {
    render(<FormularioEquipos {...propiedades} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nuevo contrato");
    // El nombre del paso lo dice el indicador, una sola vez.
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Equipos entregados");
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("says which step this is", () => {
    render(<FormularioEquipos {...propiedades} />);

    expect(screen.getByText("Paso 2 de 2")).toBeInTheDocument();
  });

  /**
   * One of these goes back a screen; the other creates a draft with legal
   * weight. They were the same solid green, so the difference lived nowhere
   * but the word on the button. The secondary action is the one that loses
   * the fill — deliberately the way round the PR #53 note argues, since a
   * filled button has more presence in direct sun than an outlined one.
   */
  it("does not dress going back the same as committing", () => {
    render(<FormularioEquipos {...propiedades} />);

    const volver = screen.getByRole("button", { name: "Volver" });
    const enviar = screen.getByRole("button", { name: "Crear borrador" });

    // design-system-migration PR17 — `boton--secundario` retired; `bg-fondo`
    // is the resolved marker of the `secundario` variant (the fill it loses).
    expect(volver.className).toContain("bg-fondo");
    expect(enviar.className).not.toContain("bg-fondo");
  });

  /**
   * jsdom performs no layout, so this cannot measure the 17px offset that
   * started it. What it CAN hold is the structural precondition the fix
   * rests on: the label is the flex row that centres the control against its
   * own text. Take that class away and the browser regression returns.
   */
  it("lays each radio out as a row that can centre its own text", () => {
    render(<FormularioEquipos {...propiedades} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      const etiqueta = radio.closest("label");
      // design-system-migration PR17 — `etiqueta--opcion` retired;
      // `flex`/`items-center` are the structural precondition the fix rests
      // on (`CLASE_ETIQUETA_OPCION`, `estilos/formulario.ts`).
      expect(etiqueta?.className).toContain("flex");
      expect(etiqueta?.className).toContain("items-center");
    }
  });
});
