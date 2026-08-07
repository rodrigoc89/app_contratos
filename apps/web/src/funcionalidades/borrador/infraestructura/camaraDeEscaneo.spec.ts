import { afterEach, describe, expect, it, vi } from "vitest";

import { abrirCamaraReal, verificarDisponibilidadDeEscaneo } from "./camaraDeEscaneo";

/**
 * DESIGN.md D6 — the real, browser-touching half of MAC scanning.
 *
 * The decisive proof in this file is teardown: `getUserMedia` opens a real
 * camera stream, and leaving a track running after the scanner closes is
 * exactly the class of bug PR15's `createObjectURL`/`revokeObjectURL`
 * pairing test exists to prevent in its own domain. Every path that can end
 * the scan — a successful decode, a `cerrar()` call, or an error — must stop
 * every track it opened.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function pistaFalsa() {
  return { stop: vi.fn(), kind: "video" as const };
}

describe("verificarDisponibilidadDeEscaneo", () => {
  it("is false when the window has no BarcodeDetector at all", async () => {
    vi.stubGlobal("window", { ...window, BarcodeDetector: undefined });

    await expect(verificarDisponibilidadDeEscaneo()).resolves.toBe(false);
  });

  it("is false when BarcodeDetector is present but there is zero videoinput device — scenario 14", async () => {
    vi.stubGlobal("window", {
      ...window,
      BarcodeDetector: { getSupportedFormats: () => Promise.resolve(["qr_code"]) },
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { enumerateDevices: () => Promise.resolve([{ kind: "audioinput" }]) },
    });

    await expect(verificarDisponibilidadDeEscaneo()).resolves.toBe(false);
  });

  it("is true when BarcodeDetector, a supported format and a videoinput device all line up", async () => {
    vi.stubGlobal("window", {
      ...window,
      BarcodeDetector: { getSupportedFormats: () => Promise.resolve(["qr_code"]) },
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { enumerateDevices: () => Promise.resolve([{ kind: "videoinput" }]) },
    });

    await expect(verificarDisponibilidadDeEscaneo()).resolves.toBe(true);
  });

  it("is false, not a thrown rejection, when the browser calls fail", async () => {
    vi.stubGlobal("window", {
      ...window,
      BarcodeDetector: { getSupportedFormats: () => Promise.reject(new Error("boom")) },
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { enumerateDevices: () => Promise.resolve([]) },
    });

    await expect(verificarDisponibilidadDeEscaneo()).resolves.toBe(false);
  });
});

describe("abrirCamaraReal", () => {
  it("stops every media track once cerrar() is called — the decisive teardown proof", async () => {
    const pista1 = pistaFalsa();
    const pista2 = pistaFalsa();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [pista1, pista2] }),
      },
    });
    vi.stubGlobal("window", {
      ...window,
      BarcodeDetector: class {
        async detect() {
          return [];
        }
      },
    });
    const video = document.createElement("video");

    const controlador = await abrirCamaraReal(video, { onDecodificado: vi.fn(), onError: vi.fn() });
    controlador.cerrar();

    expect(pista1.stop).toHaveBeenCalledTimes(1);
    expect(pista2.stop).toHaveBeenCalledTimes(1);
  });

  it("calls onDecodificado with the raw decoded value and stops the stream", async () => {
    const pista = pistaFalsa();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [pista] }),
      },
    });
    vi.stubGlobal("window", {
      ...window,
      BarcodeDetector: class {
        async detect() {
          return [{ rawValue: "AC8BA9123456" }];
        }
      },
    });
    const video = document.createElement("video");
    const onDecodificado = vi.fn();

    await abrirCamaraReal(video, { onDecodificado, onError: vi.fn() });
    await vi.waitFor(() => expect(onDecodificado).toHaveBeenCalledWith("AC8BA9123456"));
  });

  it("maps a getUserMedia rejection to a Spanish message via onError, without leaving anything running", async () => {
    const negado = new Error("denied");
    negado.name = "NotAllowedError";
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(negado) },
    });
    const video = document.createElement("video");
    const onError = vi.fn();

    const controlador = await abrirCamaraReal(video, { onDecodificado: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/permiso/i));
    expect(() => controlador.cerrar()).not.toThrow();
  });
});
