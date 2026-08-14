import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AbrirCamara, ControladorDeCamara } from "../../funcionalidades/borrador/logica/escanerDeMac";
import { EscanerDeMac } from "./EscanerDeMac";

/**
 * Spec `mac-scanning`, DESIGN.md D6. Two decisive properties, named
 * explicitly by the harness:
 *
 * 1. A successful decode fills the field and nothing else — it never
 *    submits, never advances a step (this component exposes no such
 *    callback at all: `onCambiar` is the only one), and a second scan
 *    replaces rather than appends (spec scenario 13).
 * 2. `BarcodeDetector` present but zero `videoinput` devices renders no scan
 *    button at all (spec scenario 14) — the manual field is then the whole
 *    UI, and stays reachable in every other state too (open, failing,
 *    denied).
 */

type Manejadores = Parameters<AbrirCamara>[1];

function controladorFalso(): { abrirCamara: AbrirCamara; controlador: ControladorDeCamara; decodificar: (crudo: string) => void; fallar: (mensaje: string) => void } {
  const controlador: ControladorDeCamara = { cerrar: vi.fn() };
  let manejadoresActuales: Manejadores | null = null;
  const abrirCamara: AbrirCamara = (_video, manejadores) => {
    manejadoresActuales = manejadores;
    return Promise.resolve(controlador);
  };
  return {
    abrirCamara,
    controlador,
    decodificar: (crudo: string) => manejadoresActuales?.onDecodificado(crudo),
    fallar: (mensaje: string) => manejadoresActuales?.onError(mensaje),
  };
}

const DISPONIBLE = () => Promise.resolve(true);
const NO_DISPONIBLE = () => Promise.resolve(false);

async function abrirEscaner(): Promise<void> {
  const usuario = userEvent.setup();
  await usuario.click(await screen.findByRole("button", { name: "Escanear código de la antena" }));
}

describe("EscanerDeMac", () => {
  it("always renders the manual MAC field while availability is still being checked", () => {
    render(<EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={NO_DISPONIBLE} />);

    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });

  it("scenario 14 — renders no scan button when BarcodeDetector exists but there is zero videoinput device", async () => {
    render(<EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={NO_DISPONIBLE} />);

    await waitFor(() => expect(screen.queryByText(/comprobando/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /escanear/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });

  it("renders the scan button once availability resolves true", async () => {
    render(<EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} />);

    expect(await screen.findByRole("button", { name: "Escanear código de la antena" })).toBeInTheDocument();
  });

  it("scenario 13 — a decode fills the field via onCambiar and never fires any other callback", async () => {
    const { abrirCamara, decodificar } = controladorFalso();
    const onCambiar = vi.fn();
    render(
      <EscanerDeMac valor="" onCambiar={onCambiar} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    act(() => decodificar("ac:8b:a9:12:34:56"));

    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar).toHaveBeenCalledWith("AC:8B:A9:12:34:56");
  });

  it("scenario 13 — a second scan replaces the field's value, never appends to it", async () => {
    const { abrirCamara, decodificar } = controladorFalso();
    const onCambiar = vi.fn();
    render(
      <EscanerDeMac
        valor="AC:8B:A9:12:34:56"
        onCambiar={onCambiar}
        comprobarDisponibilidad={DISPONIBLE}
        abrirCamara={abrirCamara}
      />,
    );

    await abrirEscaner();
    act(() => decodificar("00:11:22:33:44:55"));

    expect(onCambiar).toHaveBeenLastCalledWith("00:11:22:33:44:55");
    expect(onCambiar).not.toHaveBeenCalledWith(expect.stringContaining("AC:8B:A9:12:34:56 "));
  });

  it("closes the camera on a successful decode — the field is filled, scanning stops", async () => {
    const { abrirCamara, controlador, decodificar } = controladorFalso();
    render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    act(() => decodificar("AC8BA9123456"));

    expect(controlador.cerrar).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Escanear código de la antena" })).toBeInTheDocument();
  });

  it("tells the technician when the decoded code carries no MAC, instead of closing the camera in silence", async () => {
    const { abrirCamara, controlador, decodificar } = controladorFalso();
    const onCambiar = vi.fn();
    render(
      <EscanerDeMac valor="" onCambiar={onCambiar} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    act(() => decodificar("https://ui.com/soporte/garantia"));

    // The field is still not written to — silence was the bug, not the guard.
    expect(onCambiar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no contiene una MAC/i);
    // Same exits as every other error state: manual entry, and a re-scan.
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escanear código de la antena" })).toBeInTheDocument();
    expect(controlador.cerrar).toHaveBeenCalledTimes(1);
  });

  it("clears the no-MAC warning when the technician scans again", async () => {
    const { abrirCamara, decodificar } = controladorFalso();
    const onCambiar = vi.fn();
    render(
      <EscanerDeMac valor="" onCambiar={onCambiar} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    act(() => decodificar("sin datos utiles"));
    await screen.findByRole("alert");
    await abrirEscaner();
    act(() => decodificar("AC8BA9123456"));

    expect(onCambiar).toHaveBeenCalledWith("AC:8B:A9:12:34:56");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the manual field reachable while the scanner is open and scanning", async () => {
    const { abrirCamara } = controladorFalso();
    render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();

    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });

  it("keeps the manual field reachable, and stops the camera, when the technician cancels the scan", async () => {
    const { abrirCamara, controlador } = controladorFalso();
    render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(controlador.cerrar).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });

  it("keeps the manual field reachable, without a dead end, when the camera permission was denied", async () => {
    const abrirCamara: AbrirCamara = (_video, { onError }) => {
      onError("No se pudo acceder a la cámara: revise los permisos del navegador.");
      return Promise.resolve({ cerrar: vi.fn() });
    };
    render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();

    expect(await screen.findByRole("alert")).toHaveTextContent(/permiso/i);
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escanear código de la antena" })).toBeInTheDocument();
  });

  it("keeps the manual field reachable when scanning itself fails after opening", async () => {
    const { abrirCamara, fallar } = controladorFalso();
    render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    await screen.findByRole("button", { name: "Cancelar" });
    act(() => fallar("No se pudo leer el código. Puede ingresar la MAC manualmente."));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo leer/i);
    expect(screen.getByLabelText("Dirección MAC de la antena")).toBeInTheDocument();
  });

  it("stops the camera when the component unmounts mid-scan — no track left running after the visit", async () => {
    const { abrirCamara, controlador } = controladorFalso();
    const { unmount } = render(
      <EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={DISPONIBLE} abrirCamara={abrirCamara} />,
    );

    await abrirEscaner();
    await screen.findByRole("button", { name: "Cancelar" });
    unmount();

    expect(controlador.cerrar).toHaveBeenCalledTimes(1);
  });

  it("reports manual edits through onCambiar exactly like a plain field", () => {
    const onCambiar = vi.fn();
    render(<EscanerDeMac valor="" onCambiar={onCambiar} comprobarDisponibilidad={NO_DISPONIBLE} />);

    fireEvent.change(screen.getByLabelText("Dirección MAC de la antena"), {
      target: { value: "AC:8B:A9:12:34:56" },
    });

    expect(onCambiar).toHaveBeenCalledWith("AC:8B:A9:12:34:56");
  });

  it("carries the camera-preview class on the video element (PR24b) — styling never touches the [hidden] protection", () => {
    render(<EscanerDeMac valor="" onCambiar={vi.fn()} comprobarDisponibilidad={NO_DISPONIBLE} />);

    expect(screen.getByLabelText("Vista de la cámara")).toHaveClass("escaner-de-mac__video");
  });
});
