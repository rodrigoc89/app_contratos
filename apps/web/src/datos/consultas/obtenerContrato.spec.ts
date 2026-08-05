import { afterEach, describe, expect, it, vi } from "vitest";

import { EsquemaContratoDetalle, type DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../sesion/estadoSesion";
import { obtenerContrato } from "./obtenerContrato";

/**
 * `GET /contratos/:id` — the read `resultadoDeFirma.ts` uses to confirm
 * whether a `conflicto_de_estado` on `firmar` means the contract is already
 * sealed (DESIGN.md D3a). A read, so D3a's table applies as-is: never
 * wrapped in `conReintentoDeConcurrencia`.
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

function contratoVigenteValido() {
  return {
    id: "c1",
    estado: "vigente",
    numero: 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "San Martín 123",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      whatsapp: "385 4123456",
    },
    equipos: {
      antenaModelo: "Ubiquiti LiteBeam",
      antenaMac: "AC:8B:A9:12:34:56",
      poe: true,
      canoMetros: 7.5,
    },
    plazo: { meses: 12, fechaInicio: "2026-08-05", fechaVencimiento: "2027-08-05" },
    fechaFirma: "2026-08-05",
    plantillaVersionId: "v1",
    documentos: [
      { documento: "condiciones_generales", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/condiciones_generales" },
      { documento: "comodato", sha256: "b".repeat(64), enlace: "/contratos/c1/documentos/comodato" },
    ],
    eventos: [{ tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42" }],
    equiposPendientesDeRestitucion: false,
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

describe("obtenerContrato", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("GETs /contratos/:id and returns a payload the real schema accepts", async () => {
    establecerSesion(sesionFalsa());
    const cuerpo = contratoVigenteValido();
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(cuerpo));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await obtenerContrato("c1");

    expect(resultado).toEqual(cuerpo);
    expect(EsquemaContratoDetalle.safeParse(resultado).success).toBe(true);
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos/c1");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("propagates a no_encontrado rejection without retrying — reads are never wrapped in the concurrency retry", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi
      .fn()
      .mockResolvedValue(respuestaDeErrorApi(404, "no_encontrado", "Ese contrato no existe."));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(obtenerContrato("desconocido")).rejects.toMatchObject({
      codigo: "no_encontrado",
    });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });
});
