import { afterEach, describe, expect, it, vi } from "vitest";

import { EsquemaPrevisualizacion, type DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../sesion/estadoSesion";
import { obtenerPrevisualizacion } from "./obtenerPrevisualizacion";

/**
 * Spec `document-review` — step 3 of DESIGN.md §6 begins with `GET
 * /:id/previsualizacion`. This is a read, so DESIGN.md D3a's table applies:
 * reads are never wrapped in `conReintentoDeConcurrencia` — there is nothing
 * to conflict with.
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

function previsualizacionValida() {
  return {
    contratoId: "c1",
    plantillaVersion: "v1",
    plazoMeses: 12,
    fechaPrevistaDeFirma: "2026-08-05",
    fechaPrevistaDeVencimiento: "2027-08-05",
    documentos: [
      { documento: "condiciones_generales", html: "<p>condiciones</p>" },
      { documento: "comodato", html: "<p>comodato</p>" },
    ],
  };
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

function respuestaDeErrorApi(estado: number, codigo: string, mensaje = "mensaje de error"): Response {
  return respuestaJson({ error: { mensaje, codigo } }, estado);
}

describe("obtenerPrevisualizacion", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("GETs /contratos/:id/previsualizacion and returns a payload the real schema accepts", async () => {
    establecerSesion(sesionFalsa());
    const cuerpo = previsualizacionValida();
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(cuerpo));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await obtenerPrevisualizacion("c1");

    expect(resultado).toEqual(cuerpo);
    expect(EsquemaPrevisualizacion.safeParse(resultado).success).toBe(true);
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos/c1/previsualizacion");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("propagates a no_encontrado rejection without retrying — reads are never wrapped in the concurrency retry", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi
      .fn()
      .mockResolvedValue(respuestaDeErrorApi(404, "no_encontrado", "Ese contrato no existe."));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(obtenerPrevisualizacion("desconocido")).rejects.toMatchObject({
      codigo: "no_encontrado",
    });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });
});
