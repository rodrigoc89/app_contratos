import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosCrearContrato, DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../sesion/estadoSesion";
import { crearBorrador } from "./crearBorrador";

/**
 * Spec `borrador-form` — "Create draft". DESIGN.md D3a's table marks
 * `POST /contratos` as wrapped in `conReintentoDeConcurrencia`: cheap and
 * harmless, since a fresh draft has no conflicting writer, but every write
 * goes through the same retry primitive on principle.
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

const DATOS: DatosCrearContrato = {
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

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

function respuestaDeErrorApi(estado: number, codigo: string, mensaje = "mensaje de error"): Response {
  return respuestaJson({ error: { mensaje, codigo } }, estado);
}

describe("crearBorrador", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("POSTs the full contract draft to /contratos and returns the created id and state", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await crearBorrador(DATOS);

    expect(resultado).toEqual({ id: "c1", estado: "borrador" });
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(DATOS));
  });

  it("retries exactly once, transparently, on conflicto_de_concurrencia", async () => {
    establecerSesion(sesionFalsa());
    let intentos = 0;
    const fetchSimulado = vi.fn().mockImplementation(() => {
      intentos += 1;
      return intentos === 1
        ? Promise.resolve(respuestaDeErrorApi(409, "conflicto_de_concurrencia"))
        : Promise.resolve(respuestaJson({ id: "c1", estado: "borrador" }));
    });
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await crearBorrador(DATOS);

    expect(resultado).toEqual({ id: "c1", estado: "borrador" });
    expect(intentos).toBe(2);
  });

  it("propagates a regla_de_negocio rejection without retrying", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(
      respuestaDeErrorApi(400, "regla_de_negocio", "El domicilio no coincide con la zona de cobertura."),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(crearBorrador(DATOS)).rejects.toMatchObject({
      codigo: "regla_de_negocio",
      message: "El domicilio no coincide con la zona de cobertura.",
    });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });
});
