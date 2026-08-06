import { describe, expect, it, vi } from "vitest";

import type { RegistrarSW } from "./registro";
import { registrarServiceWorker } from "./registro";

/**
 * `registrarServiceWorker` is the only place `virtual:pwa-register`'s real
 * `registerSW` would be called in production — and that Vite virtual module
 * cannot resolve at all outside a real Vite/browser build, so it is never
 * statically imported here. `registrar` is a port (same shape as
 * `AbrirCamara`/`SuperficieDeFirma`/`ObservadorDeDocumento` elsewhere in
 * this app): production wires the real `registerSW` in from `main.tsx`,
 * the one file with the same untested status this module deliberately
 * avoids needing.
 */
describe("registrarServiceWorker", () => {
  it("registers immediately and forwards onNeedRefresh to the caller's callback", () => {
    const alNecesitarActualizar = vi.fn();
    const registrar: RegistrarSW = vi.fn().mockReturnValue(vi.fn());

    registrarServiceWorker(registrar, alNecesitarActualizar);

    expect(registrar).toHaveBeenCalledTimes(1);
    const llamada = (registrar as ReturnType<typeof vi.fn>).mock.calls[0];
    if (llamada === undefined) {
      throw new Error("registrar was not called");
    }
    const opciones = llamada[0] as {
      immediate?: boolean;
      onNeedRefresh?: () => void;
    };
    expect(opciones.immediate).toBe(true);

    opciones.onNeedRefresh?.();
    expect(alNecesitarActualizar).toHaveBeenCalledTimes(1);
  });

  it("returns exactly the apply function the registrar gave back — no wrapping, no swallowed argument", async () => {
    const aplicarSimulado = vi.fn().mockResolvedValue(undefined);
    const registrar: RegistrarSW = vi.fn().mockReturnValue(aplicarSimulado);

    const aplicar = registrarServiceWorker(registrar, () => {});
    await aplicar(true);

    expect(aplicarSimulado).toHaveBeenCalledWith(true);
  });
});
