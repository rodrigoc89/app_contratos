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
        onCrear={vi.fn()}
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
        onCrear={vi.fn()}
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

  it("calls onCrear when the form is submitted", async () => {
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
    await esperarComprobacionDeCamara();

    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(onCrear).toHaveBeenCalledTimes(1);
  });

  it("shows the given error message and disables the fields while submitting", async () => {
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
    await esperarComprobacionDeCamara();

    expect(screen.getByText("La dirección MAC no es válida.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear borrador" })).toBeDisabled();
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
        onCrear={vi.fn()}
        error={null}
        deshabilitado={false}
      />,
    );
    await esperarComprobacionDeCamara();

    expect(container.querySelectorAll('[id="antenaMac"]')).toHaveLength(1);
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });
});
