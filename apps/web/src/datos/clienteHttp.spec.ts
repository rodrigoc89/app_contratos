import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./sesion/estadoSesion";
import { clienteHttp, clienteHttpBlob, ErrorDeApi } from "./clienteHttp";

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

function respuestaDeErrorApi(estado: number, codigo: string, mensaje = "mensaje de error"): Response {
  return respuestaJson({ error: { mensaje, codigo } }, estado);
}

describe("ErrorDeApi", () => {
  it("carries the status, code, message, and optional fields from the envelope", () => {
    const error = new ErrorDeApi(400, {
      error: {
        mensaje: "El DNI no es válido.",
        codigo: "validacion",
        campos: { dni: "Formato inválido" },
        referencia: "abc-123",
      },
    });

    expect(error.estado).toBe(400);
    expect(error.codigo).toBe("validacion");
    expect(error.message).toBe("El DNI no es válido.");
    expect(error.campos).toEqual({ dni: "Formato inválido" });
    expect(error.referencia).toBe("abc-123");
  });

  it("omits optional fields entirely when the envelope does not carry them", () => {
    const error = new ErrorDeApi(404, {
      error: { mensaje: "No existe.", codigo: "no_encontrado" },
    });

    expect(error.campos).toBeUndefined();
    expect(error.referencia).toBeUndefined();
  });
});

describe("clienteHttp", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON body on success", async () => {
    establecerSesion(sesionFalsa("actual"));
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1" }));
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await clienteHttp<{ id: string }>("/contratos/c1");

    expect(resultado).toEqual({ id: "c1" });
  });

  it("attaches the Bearer header from the current session", async () => {
    establecerSesion(sesionFalsa("actual"));
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({}));
    vi.stubGlobal("fetch", fetchSimulado);

    await clienteHttp("/contratos/c1");

    const [, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const encabezados = new Headers(init.headers);
    expect(encabezados.get("Authorization")).toBe("Bearer acceso-actual");
  });

  it("sends the body as JSON with a matching Content-Type on POST/PATCH", async () => {
    establecerSesion(sesionFalsa("actual"));
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1" }));
    vi.stubGlobal("fetch", fetchSimulado);

    await clienteHttp("/contratos", { metodo: "POST", cuerpo: { nombreCompleto: "Ana" } });

    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const encabezados = new Headers(init.headers);
    expect(ruta).toBe("/contratos");
    expect(init.method).toBe("POST");
    expect(encabezados.get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ nombreCompleto: "Ana" }));
  });

  it("throws ErrorDeApi built from the envelope on a non-401 failure, without retrying", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaDeErrorApi(404, "no_encontrado", "Ese contrato no existe."));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(clienteHttp("/contratos/no-existe")).rejects.toMatchObject({
      estado: 404,
      codigo: "no_encontrado",
      message: "Ese contrato no existe.",
    });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a refresh for credenciales_invalidas, even though it is a 401", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(
      respuestaDeErrorApi(401, "credenciales_invalidas", "Usuario o contraseña incorrectos."),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(clienteHttp("/contratos")).rejects.toMatchObject({ codigo: "credenciales_invalidas" });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it("skips the Bearer header and the 401-refresh interceptor when sinAutenticacion is set", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaDeErrorApi(401, "no_autenticado"));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(
      clienteHttp("/auth/login", { metodo: "POST", cuerpo: {}, sinAutenticacion: true }),
    ).rejects.toMatchObject({ codigo: "no_autenticado" });

    // No refresh attempt: exactly the one call for the login request itself.
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const encabezados = new Headers(init.headers);
    expect(encabezados.has("Authorization")).toBe(false);
  });

  it("refreshes once and transparently retries on no_autenticado, returning the retried result", async () => {
    establecerSesion(sesionFalsa("vieja"));

    let intentos = 0;
    const fetchSimulado = vi.fn(async (entrada: string, _init?: RequestInit) => {
      if (entrada === "/auth/refresh") {
        return respuestaJson(sesionFalsa("nueva"));
      }
      intentos += 1;
      if (intentos === 1) {
        return respuestaDeErrorApi(401, "no_autenticado", "Su sesión expiró.");
      }
      return respuestaJson({ id: "c1" });
    });
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await clienteHttp<{ id: string }>("/contratos/c1");

    expect(resultado).toEqual({ id: "c1" });
    expect(intentos).toBe(2);
    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-nueva");

    // The retried request must carry the *new* access token.
    const llamadaFinal = fetchSimulado.mock.calls.at(-1) as [string, RequestInit];
    const encabezados = new Headers(llamadaFinal[1].headers);
    expect(encabezados.get("Authorization")).toBe("Bearer acceso-nueva");
  });

  it(
    "serializes concurrent 401s from several independent callers into exactly one refresh, " +
      "then retries every original request",
    async () => {
      establecerSesion(sesionFalsa("vieja"));

      let refrescosRecibidos = 0;
      let resolverRefresco: ((respuesta: Response) => void) | undefined;
      const refrescoDiferido = new Promise<Response>((resolver) => {
        resolverRefresco = resolver;
      });

      const intentosPorRuta = new Map<string, number>();

      const fetchSimulado = vi.fn(async (entrada: string) => {
        if (entrada === "/auth/refresh") {
          refrescosRecibidos += 1;
          return refrescoDiferido;
        }

        const previos = intentosPorRuta.get(entrada) ?? 0;
        intentosPorRuta.set(entrada, previos + 1);

        if (previos === 0) {
          return respuestaDeErrorApi(401, "no_autenticado", "Su sesión expiró.");
        }
        return respuestaJson({ ruta: entrada });
      });
      vi.stubGlobal("fetch", fetchSimulado);

      const peticiones = [
        clienteHttp("/contratos/uno"),
        clienteHttp("/contratos/dos"),
        clienteHttp("/contratos/tres"),
      ];

      // Let the three initial 401 responses and their refresh calls settle.
      // A single macrotask tick is enough regardless of how many microtask
      // hops `Response.json()` needs internally: the event loop drains the
      // entire microtask queue before running a timer callback.
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(refrescosRecibidos).toBe(1);

      resolverRefresco?.(respuestaJson(sesionFalsa("nueva")));

      const resultados = await Promise.all(peticiones);

      expect(refrescosRecibidos).toBe(1);
      expect(resultados).toEqual([
        { ruta: "/contratos/uno" },
        { ruta: "/contratos/dos" },
        { ruta: "/contratos/tres" },
      ]);
    },
  );
});

/**
 * PR15 — DESIGN.md D11 says the sealed PDF is fetched "through `clienteHttp`",
 * meaning it shares the same Bearer-header and refresh-then-retry seam as
 * every other request; it must simply never JSON-parse the body. This is a
 * thin second entry point over the same `ejecutar`, not a parallel client.
 */
describe("clienteHttpBlob", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("returns the response body as a Blob, never JSON-parsed", async () => {
    // A string body, not a Blob one — passing a jsdom `Blob` into Node's
    // `Response` constructor is a known cross-realm mismatch (undici does
    // not recognise it and stringifies it as "[object Blob]" instead of
    // reading its bytes). A string body exercises the exact same
    // `analizarBlob` code path without that environment quirk.
    const contenidoDelPdf = "%PDF-1.4 contenido de prueba";
    establecerSesion(sesionFalsa("actual"));
    const fetchSimulado = vi.fn().mockResolvedValue(
      new Response(contenidoDelPdf, { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await clienteHttpBlob("/contratos/c1/documentos/comodato");

    expect(resultado).toBeInstanceOf(Blob);
    expect(resultado.type).toBe("application/pdf");
    expect(await resultado.text()).toBe(contenidoDelPdf);
  });

  it("attaches the Bearer header and any extra headers passed in opciones", async () => {
    establecerSesion(sesionFalsa("actual"));
    const fetchSimulado = vi.fn().mockResolvedValue(
      new Response(new Blob(["x"]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    await clienteHttpBlob("/contratos/c1/documentos/comodato", {
      encabezados: { Accept: "application/pdf" },
    });

    const [, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    const encabezados = new Headers(init.headers);
    expect(encabezados.get("Authorization")).toBe("Bearer acceso-actual");
    expect(encabezados.get("Accept")).toBe("application/pdf");
  });

  it("throws ErrorDeApi built from the JSON envelope on failure, same as clienteHttp", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaDeErrorApi(404, "no_encontrado", "Ese contrato no existe."));
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(clienteHttpBlob("/contratos/no-existe/documentos/comodato")).rejects.toMatchObject({
      estado: 404,
      codigo: "no_encontrado",
    });
  });

  it("refreshes once and retries transparently on no_autenticado, same as clienteHttp", async () => {
    establecerSesion(sesionFalsa("vieja"));
    const bytesDelPdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });

    let intentos = 0;
    const fetchSimulado = vi.fn(async (entrada: string) => {
      if (entrada === "/auth/refresh") {
        return respuestaJson(sesionFalsa("nueva"));
      }
      intentos += 1;
      if (intentos === 1) {
        return respuestaDeErrorApi(401, "no_autenticado", "Su sesión expiró.");
      }
      return new Response(bytesDelPdf, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSimulado);

    const resultado = await clienteHttpBlob("/contratos/c1/documentos/comodato");

    expect(resultado).toBeInstanceOf(Blob);
    expect(intentos).toBe(2);
  });
});
