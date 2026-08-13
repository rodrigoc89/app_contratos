import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../sesion/estadoSesion";
import { buscarContratos } from "./buscarContratos";

/**
 * `GET /contratos` — mirrors `obtenerContrato.spec.ts`'s shape: stub
 * `fetch`, drive the real fetcher, assert the request it actually issued.
 *
 * The CSV-vs-repeated-param distinction is load-bearing (DESIGN.md D6): the
 * endpoint accepts one comma-separated `estados` parameter and rejects any
 * other shape with 400 (`EsquemaConsultaDeContratos` is `z.strictObject`).
 */

function sesionFalsa(): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
  };
}

function listaVacia() {
  return { elementos: [], total: 0, pagina: 1, tamanoPagina: 20 };
}

function respuestaJson(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buscarContratos", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("GETs /contratos with pagina and tamanoPagina always present", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(listaVacia()));
    vi.stubGlobal("fetch", fetchSimulado);

    await buscarContratos({ termino: "", estados: [], pagina: 1, tamanoPagina: 20 });

    const [ruta] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const url = new URL(ruta, "http://localhost");
    expect(url.pathname).toBe("/contratos");
    expect(url.searchParams.get("pagina")).toBe("1");
    expect(url.searchParams.get("tamanoPagina")).toBe("20");
  });

  it("omits termino and estados entirely when they carry no filter", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(listaVacia()));
    vi.stubGlobal("fetch", fetchSimulado);

    await buscarContratos({ termino: "", estados: [], pagina: 1, tamanoPagina: 20 });

    const [ruta] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const url = new URL(ruta, "http://localhost");
    expect(url.searchParams.has("termino")).toBe(false);
    expect(url.searchParams.has("estados")).toBe(false);
  });

  it("sends termino verbatim when present", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(listaVacia()));
    vi.stubGlobal("fetch", fetchSimulado);

    await buscarContratos({ termino: "perez", estados: [], pagina: 1, tamanoPagina: 20 });

    const [ruta] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const url = new URL(ruta, "http://localhost");
    expect(url.searchParams.get("termino")).toBe("perez");
  });

  it("sends estados as ONE comma-separated parameter, never repeated", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(listaVacia()));
    vi.stubGlobal("fetch", fetchSimulado);

    await buscarContratos({ termino: "", estados: ["vigente", "anulado"], pagina: 1, tamanoPagina: 20 });

    const [ruta] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const url = new URL(ruta, "http://localhost");
    expect(url.searchParams.getAll("estados")).toEqual(["vigente,anulado"]);
  });

  it("returns the parsed payload the real schema accepts", async () => {
    establecerSesion(sesionFalsa());
    const cuerpo = listaVacia();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaJson(cuerpo)));

    const resultado = await buscarContratos({ termino: "", estados: [], pagina: 1, tamanoPagina: 20 });

    expect(resultado).toEqual(cuerpo);
  });
});
