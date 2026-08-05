import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosCrearContrato, DatosSesion } from "@contratos/esquemas";

import { guardarBorradorLocal, leerBorradorLocal } from "../../almacenamiento/borradorLocal";
import { borrarTokenDeRefrescoGuardado, obtenerTokenDeRefrescoGuardado } from "./almacenSesion";
import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./estadoSesion";
import { cerrarSesion, iniciarSesion } from "./sesion";

/**
 * `datos/sesion/sesion.ts` is the login/logout flow (DESIGN.md D4, D10).
 * `cerrarSesion` is scenario 9 (spec `web-auth-session`): logout must work
 * with a dead access token, must send no Bearer header, and must never
 * trigger the 401 refresh interceptor — achieved here by routing both
 * requests through `clienteHttp`'s `sinAutenticacion` option, the same
 * mechanism `/auth/login` and `/auth/refresh` already use.
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

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

describe("iniciarSesion", () => {
  afterEach(() => {
    limpiarSesion();
    borrarTokenDeRefrescoGuardado();
    vi.unstubAllGlobals();
  });

  it("stores the session in memory and its refresh token in localStorage", async () => {
    const sesionEmitida = sesionFalsa("nueva");
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(sesionEmitida));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await iniciarSesion({ nombreUsuario: "tecnico1", contrasena: "correcta" });

    expect(resultado.tokenDeAcceso).toBe("acceso-nueva");
    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-nueva");
    expect(obtenerTokenDeRefrescoGuardado()).toBe("refresco-nueva");
    expect(fetchSimulado).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    const [, opciones] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(opciones.headers).not.toHaveProperty("Authorization");
  });
});

describe("cerrarSesion (scenario 9)", () => {
  afterEach(() => {
    limpiarSesion();
    borrarTokenDeRefrescoGuardado();
    vi.unstubAllGlobals();
  });

  it("logs out with a dead access token — sends no Bearer header, triggers no refresh", async () => {
    establecerSesion(sesionFalsa("expirada"));
    const fetchSimulado = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSimulado);

    await cerrarSesion();

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [ruta, opciones] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/auth/logout");
    expect(opciones.headers).not.toHaveProperty("Authorization");
  });

  it("clears session state unconditionally, even when the request fails", async () => {
    establecerSesion(sesionFalsa("expirada"));
    const fetchSimulado = vi.fn().mockRejectedValue(new Error("red caída"));
    vi.stubGlobal("fetch", fetchSimulado);

    await cerrarSesion();

    expect(obtenerSesionActual()).toBeNull();
    expect(obtenerTokenDeRefrescoGuardado()).toBeNull();
  });

  it("does nothing over the network when there was never a session", async () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    await cerrarSesion();

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(obtenerSesionActual()).toBeNull();
  });

  it("also clears the local borrador draft — DESIGN.md D8, a customer's name/DNI/address must not outlive the session on a shared tablet", async () => {
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
    establecerSesion(sesionFalsa("expirada"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await cerrarSesion();

    expect(leerBorradorLocal()).toBeNull();
  });
});
