import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DESIGN — the real `TonoDeConfirmacion` (WebAudio oscillator, no audio
 * file). `vi.resetModules()` + a dynamic import per test isolates the
 * module-level lazy `AudioContext` singleton, so one test's stubbed
 * constructor never leaks into the next.
 */

interface OsciladorFalso {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function crearContextoFalso(opciones: { state?: string; resume?: () => Promise<void> } = {}) {
  const oscilador: OsciladorFalso = {
    type: "",
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const ganancia = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const ctx = {
    state: opciones.state ?? "running",
    currentTime: 0,
    destination: {},
    resume: opciones.resume ?? vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => oscilador),
    createGain: vi.fn(() => ganancia),
  };
  return { ctx, oscilador };
}

describe("tonoWebAudio", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing and does not throw when the browser has no AudioContext at all", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { tonoWebAudio } = await import("./tonoWebAudio");

    expect(() => tonoWebAudio.reproducir()).not.toThrow();
  });

  it("plays the tone immediately on an already-running context", async () => {
    const { ctx, oscilador } = crearContextoFalso({ state: "running" });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => ctx),
    );
    const { tonoWebAudio } = await import("./tonoWebAudio");

    tonoWebAudio.reproducir();
    await vi.waitFor(() => expect(oscilador.start).toHaveBeenCalledTimes(1));
  });

  it("resumes a suspended context before playing the tone", async () => {
    const { ctx, oscilador } = crearContextoFalso({ state: "suspended" });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => ctx),
    );
    const { tonoWebAudio } = await import("./tonoWebAudio");

    tonoWebAudio.reproducir();
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(oscilador.start).toHaveBeenCalledTimes(1));
  });

  it("swallows a rejected resume (a blocked AudioContext) without throwing", async () => {
    const { ctx, oscilador } = crearContextoFalso({
      state: "suspended",
      resume: vi.fn().mockRejectedValue(new Error("bloqueado por el navegador")),
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => ctx),
    );
    const { tonoWebAudio } = await import("./tonoWebAudio");

    expect(() => tonoWebAudio.reproducir()).not.toThrow();
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalledTimes(1));
    expect(oscilador.start).not.toHaveBeenCalled();
  });

  it("swallows a synchronous AudioContext construction failure without throwing", async () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("no se pudo construir");
      }),
    );
    const { tonoWebAudio } = await import("./tonoWebAudio");

    expect(() => tonoWebAudio.reproducir()).not.toThrow();
  });

  it("creates one AudioContext and reuses it across repeated calls", async () => {
    const fabrica = vi.fn(() => crearContextoFalso({ state: "running" }).ctx);
    vi.stubGlobal("AudioContext", fabrica);
    const { tonoWebAudio } = await import("./tonoWebAudio");

    tonoWebAudio.reproducir();
    tonoWebAudio.reproducir();

    expect(fabrica).toHaveBeenCalledTimes(1);
  });
});
