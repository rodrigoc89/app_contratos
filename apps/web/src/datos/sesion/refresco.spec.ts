import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosCrearContrato, DatosSesion } from "@contratos/esquemas";

import { guardarBorradorLocal, leerBorradorLocal, limpiarBorradorLocal } from "../../almacenamiento/borradorLocal";
import {
  borrarTokenDeRefrescoGuardado,
  guardarTokenDeRefresco,
  obtenerTokenDeRefrescoGuardado,
} from "./almacenSesion";
import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./estadoSesion";
import { refrescarSesion } from "./refresco";

/**
 * Scenario 8 (spec `web-auth-session`, DESIGN.md D4): refresh tokens in this
 * API are single-use and rotate. A second concurrent refresh burns the
 * token the first refresh already consumed and revokes the whole family —
 * see `RefrescarSesion.rechazarTokenMuerto` in `apps/api`. The module-level
 * mutex exists so that never happens on the client, no matter how many
 * callers hit a 401 in the same tick.
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

describe("refrescarSesion", () => {
  beforeEach(() => {
    establecerSesion(sesionFalsa("vieja"));
  });

  afterEach(() => {
    limpiarSesion();
    limpiarBorradorLocal();
    borrarTokenDeRefrescoGuardado();
    vi.unstubAllGlobals();
  });

  it("serializes 5 concurrent calls into exactly one POST /auth/refresh", async () => {
    let resolverRespuesta: ((respuesta: Response) => void) | undefined;
    const respuestaDiferida = new Promise<Response>((resolver) => {
      resolverRespuesta = resolver;
    });
    const fetchSimulado = vi.fn().mockReturnValue(respuestaDiferida);
    vi.stubGlobal("fetch", fetchSimulado);

    const llamadas = [
      refrescarSesion(),
      refrescarSesion(),
      refrescarSesion(),
      refrescarSesion(),
      refrescarSesion(),
    ];

    // The mutex assignment is synchronous, so all 5 calls must already share
    // one in-flight promise before the fetch resolves.
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(fetchSimulado).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );

    resolverRespuesta?.(respuestaSesion(sesionFalsa("nueva")));

    const resultados = await Promise.all(llamadas);

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    for (const resultado of resultados) {
      expect(resultado.tokenDeAcceso).toBe("acceso-nueva");
    }
    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-nueva");
  });

  it("allows a fresh refresh after the in-flight one settles", async () => {
    const fetchSimulado = vi
      .fn()
      .mockResolvedValueOnce(respuestaSesion(sesionFalsa("primera")))
      .mockResolvedValueOnce(respuestaSesion(sesionFalsa("segunda")));
    vi.stubGlobal("fetch", fetchSimulado);

    const primera = await refrescarSesion();
    const segunda = await refrescarSesion();

    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    expect(primera.tokenDeAcceso).toBe("acceso-primera");
    expect(segunda.tokenDeAcceso).toBe("acceso-segunda");
  });

  it("clears the session and rejects when the server refuses the refresh", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(
      new Response("no", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(refrescarSesion()).rejects.toThrow();

    expect(obtenerSesionActual()).toBeNull();
  });

  /**
   * Task 20.3 — spec `web-auth-session`, "Session expires mid-form": a
   * refresh failure mid-visit MUST NOT clear the técnico's `borrador`, only
   * `cerrarSesion` (a deliberate logout, scenario 9) does that. The two
   * paths are already structurally separate — this function calls
   * `limpiarSesion()` directly and never `cerrarSesion()` — so this test
   * locks that separation in, rather than fixing a bug. See apply-progress
   * for the full "why" investigation (what actually happens on a mid-visit
   * expiry versus a deliberate logout).
   */
  it("keeps the local borrador draft — and its contratoId — when the refresh fails, unlike a deliberate logout (task 20.3)", async () => {
    const valoresDePrueba: DatosCrearContrato = {
      comodatario: {
        nombreCompleto: "Ana López",
        dni: "30123456",
        domicilioCalle: "San Martín 123",
        ciudad: "Santiago del Estero",
        whatsapp: "385 4123456",
      },
      equipos: {
        antenaModelo: "Ubiquiti LiteBeam",
        antenaMac: "AC:8B:A9:12:34:56",
        poe: true,
        canoMetros: 7.5,
      },
    };
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: valoresDePrueba });
    const fetchSimulado = vi.fn().mockResolvedValue(new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(refrescarSesion()).rejects.toThrow();

    expect(obtenerSesionActual()).toBeNull();
    const draftRestante = leerBorradorLocal();
    expect(draftRestante).not.toBeNull();
    expect(draftRestante?.contratoId).toBe("c1");
  });

  /**
   * Task 22, part (a) — spec `web-auth-session` / DESIGN.md D4. Refresh
   * tokens rotate and are single-use: the copy `iniciarSesion` wrote at
   * login is burned the first time any refresh happens in that session. If
   * the rotated token is never persisted, the next cold start presents the
   * server with an already-consumed token, which
   * `RefrescarSesion.rechazarTokenMuerto` reads as theft and revokes the
   * whole family. Persisting the rotation on every success is what makes a
   * cold-start restore (part b) safe to wire at all.
   */
  it("persists the rotated refresh token after a successful refresh (task 22)", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaSesion(sesionFalsa("nueva")));
    vi.stubGlobal("fetch", fetchSimulado);

    await refrescarSesion();

    expect(obtenerTokenDeRefrescoGuardado()).toBe("refresco-nueva");
  });

  /**
   * Task 22, part (a). A refused refresh means the stored token is already
   * dead — leaving it in place would present it again on the next boot and
   * re-trigger the same reuse-detection/theft path. Clearing it here is
   * what keeps a refused refresh from becoming a poisoned next boot.
   */
  it("clears the stored refresh token when the server refuses the refresh (task 22)", async () => {
    guardarTokenDeRefresco("token-por-morir");
    const fetchSimulado = vi.fn().mockResolvedValue(new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(refrescarSesion()).rejects.toThrow();

    expect(obtenerTokenDeRefrescoGuardado()).toBeNull();
  });

  /**
   * Task 22, part (b). A cold start has no in-memory session by
   * definition — `estadoSesion.ts`'s module state resets on every reload —
   * so `ejecutarRefresco` must be able to source the refresh token from
   * `almacenSesion.ts` as well, not only from `obtenerSesionActual()`. This
   * is what lets `refrescarSesion()` (and its single-flight mutex) serve
   * boot and mid-visit alike through the one code path.
   */
  it("falls back to the stored refresh token when there is no in-memory session (cold start, task 22)", async () => {
    limpiarSesion();
    guardarTokenDeRefresco("token-guardado");
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaSesion(sesionFalsa("restaurada")));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await refrescarSesion();

    expect(fetchSimulado).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tokenDeRefresco: "token-guardado" }),
      }),
    );
    expect(resultado.tokenDeAcceso).toBe("acceso-restaurada");
    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-restaurada");
  });

  it("throws without any network call when there is no in-memory session and no stored token (task 22)", async () => {
    limpiarSesion();
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(refrescarSesion()).rejects.toThrow("No hay sesión activa para refrescar.");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
