import {
  EsquemaFirmarContrato,
  MINIMO_PUNTOS_FIRMA,
  type DatosFirmaCapturada,
  type DatosSesion,
  type TipoDocumentoFirmado,
} from "@contratos/esquemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { firmarContrato } from "./resultadoDeFirma";

/**
 * Spec `contract-signing`, DESIGN.md D3a — the whole reason this slice
 * exists. Two 409s can come back from `POST :id/firmar` and they demand
 * OPPOSITE responses:
 *
 * - `conflicto_de_concurrencia` (two writers collided): retried exactly
 *   once, transparently (scenario 6, the `firmar` half — the `PATCH` half is
 *   already proven at the primitive level in `reintentoDeConcurrencia.spec.ts`,
 *   and `conReintentoDeConcurrencia` itself is generic and untouched by this
 *   PR — what this file proves is that `firmar`'s call site is actually
 *   wrapped in it).
 * - `conflicto_de_estado` (the aggregate cannot take this write): never
 *   retried — but on `firmar` specifically it usually means a PREVIOUS
 *   attempt already sealed the contract and its response was lost on a
 *   field connection (`ContratosController.firmar`'s own doc comment: a
 *   retried signing request answers 409 without double-signing). Refetching
 *   and finding `estado === "vigente"` is SUCCESS, not an error
 *   (scenario 7 — the decisive test in this file).
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

const PNG_DE_PRUEBA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function firmaValida(documento: TipoDocumentoFirmado): DatosFirmaCapturada {
  return {
    documento,
    imagenPng: PNG_DE_PRUEBA,
    trazos: [
      Array.from({ length: MINIMO_PUNTOS_FIRMA }, (_, i) => ({ x: 10 + i, y: 20 + i, t: i })),
    ],
  };
}

function firmasValidas(): readonly DatosFirmaCapturada[] {
  return [firmaValida("condiciones_generales"), firmaValida("comodato")];
}

function contratoDetalle(estado: "borrador" | "vigente", overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    estado,
    numero: estado === "vigente" ? 42 : null,
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
    plazo: estado === "vigente" ? { meses: 12, fechaInicio: "2026-08-05", fechaVencimiento: "2027-08-05" } : null,
    fechaFirma: estado === "vigente" ? "2026-08-05" : null,
    plantillaVersionId: estado === "vigente" ? "v1" : null,
    documentos:
      estado === "vigente"
        ? [
            { documento: "condiciones_generales", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/condiciones_generales" },
            { documento: "comodato", sha256: "b".repeat(64), enlace: "/contratos/c1/documentos/comodato" },
          ]
        : [],
    eventos: estado === "vigente" ? [{ tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42" }] : [],
    equiposPendientesDeRestitucion: false,
    ...overrides,
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

describe("firmarContrato", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("submits one POST with both signatures and a schema-valid body, returning the sealed contract on the first try", async () => {
    establecerSesion(sesionFalsa());
    const sellado = contratoDetalle("vigente");
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(sellado));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await firmarContrato("c1", firmasValidas());

    expect(resultado).toEqual(sellado);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos/c1/firmar");
    expect(init.method).toBe("POST");
    const cuerpo: unknown = JSON.parse(init.body as string);
    expect(EsquemaFirmarContrato.safeParse(cuerpo).success).toBe(true);
  });

  it("includes a non-empty dispositivoId in the request body — forensic evidence the client legitimately supplies", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(contratoDetalle("vigente")));
    vi.stubGlobal("fetch", fetchSimulado);

    await firmarContrato("c1", firmasValidas());

    const [, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(init.body as string) as { dispositivoId: unknown };
    expect(typeof cuerpo.dispositivoId).toBe("string");
    expect((cuerpo.dispositivoId as string).length).toBeGreaterThan(0);
  });

  it("retries exactly once on conflicto_de_concurrencia and returns the retry's result (scenario 6, firmar half)", async () => {
    establecerSesion(sesionFalsa());
    const sellado = contratoDetalle("vigente");
    const fetchSimulado = vi
      .fn()
      .mockResolvedValueOnce(respuestaDeErrorApi(409, "conflicto_de_concurrencia"))
      .mockResolvedValueOnce(respuestaJson(sellado));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await firmarContrato("c1", firmasValidas());

    expect(resultado).toEqual(sellado);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it("propagates conflicto_de_concurrencia if the single retry also fails — never a third attempt", async () => {
    establecerSesion(sesionFalsa());
    // A fresh Response per call: Response bodies are one-time-readable
    // streams, so a shared mockResolvedValue instance would make the
    // second .json() read fail and mask this as a generic "http" error.
    const fetchSimulado = vi
      .fn()
      .mockImplementation(() => Promise.resolve(respuestaDeErrorApi(409, "conflicto_de_concurrencia")));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(firmarContrato("c1", firmasValidas())).rejects.toMatchObject({
      codigo: "conflicto_de_concurrencia",
    });
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it("treats conflicto_de_estado as SUCCESS when a refetch shows the contract vigente — the response was lost, not the signing (scenario 7)", async () => {
    establecerSesion(sesionFalsa());
    const sellado = contratoDetalle("vigente");
    const fetchSimulado = vi.fn().mockImplementation((ruta: unknown, init?: RequestInit) => {
      if (ruta === "/contratos/c1/firmar" && (init?.method ?? "GET") === "POST") {
        return Promise.resolve(respuestaDeErrorApi(409, "conflicto_de_estado"));
      }
      if (ruta === "/contratos/c1") {
        return Promise.resolve(respuestaJson(sellado));
      }
      throw new Error(`fetch inesperado: ${String(ruta)}`);
    });
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await firmarContrato("c1", firmasValidas());

    expect(resultado).toEqual(sellado);
    expect(resultado.estado).toBe("vigente");
    // Exactly the firmar attempt plus the one confirming refetch — never a
    // retry of the write itself (conflicto_de_estado must never be retried).
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    const rutasLlamadas = fetchSimulado.mock.calls.map(([ruta]: [unknown]) => ruta);
    expect(rutasLlamadas).toEqual(["/contratos/c1/firmar", "/contratos/c1"]);
  });

  it("surfaces conflicto_de_estado as a real error when the refetch shows the contract is NOT vigente", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockImplementation((ruta: unknown, init?: RequestInit) => {
      if (ruta === "/contratos/c1/firmar" && (init?.method ?? "GET") === "POST") {
        return Promise.resolve(respuestaDeErrorApi(409, "conflicto_de_estado"));
      }
      if (ruta === "/contratos/c1") {
        return Promise.resolve(respuestaJson(contratoDetalle("borrador")));
      }
      throw new Error(`fetch inesperado: ${String(ruta)}`);
    });
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(firmarContrato("c1", firmasValidas())).rejects.toMatchObject({
      codigo: "conflicto_de_estado",
    });
  });
});
