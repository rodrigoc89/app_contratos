import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { crearControladorDeActualizacion } from "../pwa/actualizacion";
import type { RegistrarSW } from "../pwa/registro";
import { usePwaUpdate } from "./usePwaUpdate";

/**
 * DESIGN.md D9 — the React-level proof that the whole chain composes: a
 * `registrar` port stands in for `virtual:pwa-register`'s real `registerSW`
 * (which cannot resolve under Vitest at all, see `pwa/registro.ts`'s own
 * docs), and a real `crearControladorDeActualizacion` is injected with a
 * controllable `hayTrabajoEnCurso`. This is the closest thing to an
 * end-to-end test this feature can have without a real browser and a real
 * service worker.
 */
describe("usePwaUpdate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function registrarFalso(): { registrar: RegistrarSW; dispararNecesitaActualizar: () => void; aplicarSimulado: ReturnType<typeof vi.fn> } {
    let onNeedRefresh: (() => void) | undefined;
    const aplicarSimulado = vi.fn().mockResolvedValue(undefined);
    const registrar: RegistrarSW = (opciones) => {
      onNeedRefresh = opciones.onNeedRefresh;
      return aplicarSimulado;
    };
    return {
      registrar,
      dispararNecesitaActualizar: () => onNeedRefresh?.(),
      aplicarSimulado,
    };
  }

  it("starts with no affordance visible", () => {
    const { registrar } = registrarFalso();
    const controlador = crearControladorDeActualizacion(() => false);

    const { result } = renderHook(() => usePwaUpdate(registrar, controlador));

    expect(result.current.disponible).toBe(false);
  });

  it("becomes visible once the service worker reports a new version and nothing is in progress", () => {
    const { registrar, dispararNecesitaActualizar } = registrarFalso();
    const controlador = crearControladorDeActualizacion(() => false);

    const { result } = renderHook(() => usePwaUpdate(registrar, controlador));
    act(() => dispararNecesitaActualizar());

    expect(result.current.disponible).toBe(true);
  });

  it("stays hidden while hayTrabajoEnCurso is true — the decisive mid-visit suppression", () => {
    const { registrar, dispararNecesitaActualizar } = registrarFalso();
    const controlador = crearControladorDeActualizacion(() => true);

    const { result } = renderHook(() => usePwaUpdate(registrar, controlador));
    act(() => dispararNecesitaActualizar());

    expect(result.current.disponible).toBe(false);
  });

  it("aplicar() calls the registrar's own apply function with reload=true", async () => {
    const { registrar, dispararNecesitaActualizar, aplicarSimulado } = registrarFalso();
    const controlador = crearControladorDeActualizacion(() => false);

    const { result } = renderHook(() => usePwaUpdate(registrar, controlador));
    act(() => dispararNecesitaActualizar());
    await act(async () => result.current.aplicar());

    expect(aplicarSimulado).toHaveBeenCalledWith(true);
  });

  it("re-evaluates on visibilitychange, surfacing the affordance mid-session once work finishes — no cold start needed", () => {
    let ocupado = true;
    const { registrar, dispararNecesitaActualizar } = registrarFalso();
    const controlador = crearControladorDeActualizacion(() => ocupado);

    const { result } = renderHook(() => usePwaUpdate(registrar, controlador));
    act(() => dispararNecesitaActualizar());
    expect(result.current.disponible).toBe(false);

    ocupado = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(result.current.disponible).toBe(true);
  });
});
