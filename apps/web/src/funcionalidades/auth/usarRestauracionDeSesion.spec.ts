import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { borrarTokenDeRefrescoGuardado, guardarTokenDeRefresco } from "../../datos/sesion/almacenSesion";
import { establecerSesion, limpiarSesion, obtenerSesionActual } from "../../datos/sesion/estadoSesion";
import { usarRestauracionDeSesion } from "./usarRestauracionDeSesion";

/**
 * Task 22, part (b), spec `web-auth-session` / DESIGN.md D4 — the
 * cold-start restore. `obtenerTokenDeRefrescoGuardado()` had zero
 * production callers before this task (Engram observation #53): the
 * refresh token was written and deleted, never read back, so D4's "an
 * OS-level kill does not force re-login" promise was undelivered. This
 * hook is the one production caller that closes that gap, funnelling
 * through `refrescarSesion()`'s existing single-flight mutex rather than
 * opening a second refresh path.
 */

function sesionFalsa(sufijo: string): DatosSesion {
  return {
    tokenDeAcceso: `acceso-${sufijo}`,
    expiraEnSegundos: 900,
    tokenDeRefresco: `refresco-${sufijo}`,
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: {
      id: `usuario-${sufijo}`,
      nombreUsuario: "tecnico1",
      nombreCompleto: "Técnico de Prueba",
      rol: "tecnico",
      activo: true,
    },
  };
}

function respuestaSesion(sesion: DatosSesion): Response {
  return new Response(JSON.stringify(sesion), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("usarRestauracionDeSesion", () => {
  afterEach(() => {
    limpiarSesion();
    borrarTokenDeRefrescoGuardado();
    vi.unstubAllGlobals();
  });

  it("does not restore when there is no stored refresh token and no in-memory session", () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    const { result } = renderHook(() => usarRestauracionDeSesion());

    expect(result.current).toBe(false);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("does not attempt to restore when an in-memory session already exists", () => {
    establecerSesion(sesionFalsa("existente"));
    guardarTokenDeRefresco("token-distinto");
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    const { result } = renderHook(() => usarRestauracionDeSesion());

    expect(result.current).toBe(false);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("starts restoring, then settles with the session restored, from a stored refresh token (cold start)", async () => {
    guardarTokenDeRefresco("token-valido");
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaSesion(sesionFalsa("restaurada")));
    vi.stubGlobal("fetch", fetchSimulado);

    const { result } = renderHook(() => usarRestauracionDeSesion());

    expect(result.current).toBe(true);

    await waitFor(() => expect(result.current).toBe(false));

    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-restaurada");
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it("settles and clears the dead stored token when the boot refresh is refused", async () => {
    guardarTokenDeRefresco("token-muerto");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));

    const { result } = renderHook(() => usarRestauracionDeSesion());
    expect(result.current).toBe(true);

    await waitFor(() => expect(result.current).toBe(false));

    expect(obtenerSesionActual()).toBeNull();
  });

  it("only ever triggers one refresh even if re-rendered while restoring is in flight", async () => {
    guardarTokenDeRefresco("token-valido");
    let resolverRespuesta: ((respuesta: Response) => void) | undefined;
    const respuestaDiferida = new Promise<Response>((resolver) => {
      resolverRespuesta = resolver;
    });
    const fetchSimulado = vi.fn().mockReturnValue(respuestaDiferida);
    vi.stubGlobal("fetch", fetchSimulado);

    const { result, rerender } = renderHook(() => usarRestauracionDeSesion());
    rerender();
    rerender();

    expect(fetchSimulado).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolverRespuesta?.(respuestaSesion(sesionFalsa("restaurada")));
    });

    expect(result.current).toBe(false);
  });
});
