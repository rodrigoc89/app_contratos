import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosActualizarContrato, DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../sesion/estadoSesion";
import { crearColaDeGuardado } from "./colaDeGuardado";

/**
 * Spec `borrador-form` — "Debounced, serialized, coalesced autosave"
 * (scenarios 5 and 6's `PATCH` half; DESIGN.md D3/D3a). The transparent
 * single retry on `conflicto_de_concurrencia` is already proven at the
 * primitive level in `reintentoDeConcurrencia.spec.ts`; this file proves the
 * queue itself never lets two `PATCH`es for one contract overlap, and that
 * any number of edits made while one is in flight collapse into exactly one
 * further request.
 */

function sesionFalsa(): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "tecnico1", nombreCompleto: "Técnico", rol: "tecnico", activo: true },
  };
}

const EQUIPOS: NonNullable<DatosActualizarContrato["equipos"]> = {
  antenaModelo: "Ubiquiti LiteBeam",
  antenaMac: "AC:8B:A9:12:34:56",
  poe: true,
  canoMetros: 7.5,
};

const COMODATARIO: NonNullable<DatosActualizarContrato["comodatario"]> = {
  nombreCompleto: "Ana López",
  dni: "30123456",
  domicilioCalle: "San Martín 123",
  ciudad: "Santiago del Estero",
  whatsapp: "385 4123456",
};

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ColaDeGuardado", () => {
  beforeEach(() => {
    establecerSesion(sesionFalsa());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("coalesces edits made before the debounce window elapses into one PATCH", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    const cola = crearColaDeGuardado("c1");

    cola.encolar({ equipos: EQUIPOS });
    cola.encolar({ comodatario: COMODATARIO });

    await vi.advanceTimersByTimeAsync(800);

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos/c1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ equipos: EQUIPOS, comodatario: COMODATARIO });
  });

  it("collapses 10 edits made while a PATCH is in flight into exactly one further PATCH (scenario 5)", async () => {
    let resolverPrimera: ((respuesta: Response) => void) | undefined;
    const primeraRespuesta = new Promise<Response>((resolver) => {
      resolverPrimera = resolver;
    });
    const fetchSimulado = vi
      .fn()
      .mockReturnValueOnce(primeraRespuesta)
      .mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    const cola = crearColaDeGuardado("c1");

    cola.encolar({ equipos: EQUIPOS });
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i += 1) {
      cola.encolar({ equipos: { ...EQUIPOS, canoMetros: 7.5 + i } });
    }
    // The debounce window elapsing mid-flight must not itself send a
    // request — only the eventual settle-and-recheck does.
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);

    resolverPrimera?.(respuestaJson({ id: "c1", estado: "borrador" }));
    await cola.vaciar();

    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    const [, initSegundo] = fetchSimulado.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(initSegundo.body as string)).toEqual({ equipos: { ...EQUIPOS, canoMetros: 16.5 } });
  });

  it("vaciar() flushes immediately, ignoring the debounce window, and settles once every chained flush is done", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    const cola = crearColaDeGuardado("c1");

    cola.encolar({ equipos: EQUIPOS });
    await cola.vaciar();

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(cola.hayPendiente).toBe(false);
  });

  it("propagates a PATCH failure from vaciar() and keeps the edit queued instead of auto-retrying", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(new Response("no", { status: 500 }));
    vi.stubGlobal("fetch", fetchSimulado);
    const cola = crearColaDeGuardado("c1");

    cola.encolar({ equipos: EQUIPOS });

    await expect(cola.vaciar()).rejects.toThrow();
    expect(cola.hayPendiente).toBe(true);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);

    fetchSimulado.mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    await cola.vaciar();

    expect(cola.hayPendiente).toBe(false);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });
});
