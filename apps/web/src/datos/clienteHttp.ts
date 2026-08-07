import type { CodigoDeError, CuerpoDeError } from "@contratos/esquemas";

import { limpiarSesion, obtenerSesionActual } from "./sesion/estadoSesion";
import { refrescarSesion } from "./sesion/refresco";

/**
 * The client's parsed error envelope (DESIGN.md D3a). Owned here — the only
 * place in the client that reads an error body — and exported for every
 * other module (`conReintentoDeConcurrencia`, `mensajeDeError`, and every
 * caller that needs to branch on `codigo`) to import from.
 */
export class ErrorDeApi extends Error {
  readonly estado: number;
  readonly codigo: CodigoDeError | string;
  readonly campos?: Record<string, string>;
  readonly referencia?: string;

  constructor(estado: number, cuerpo: CuerpoDeError) {
    super(cuerpo.error.mensaje);
    this.name = "ErrorDeApi";
    this.estado = estado;
    this.codigo = cuerpo.error.codigo;
    if (cuerpo.error.campos !== undefined) {
      this.campos = cuerpo.error.campos;
    }
    if (cuerpo.error.referencia !== undefined) {
      this.referencia = cuerpo.error.referencia;
    }
  }
}

export type MetodoHttp = "GET" | "POST" | "PATCH" | "DELETE";

export interface OpcionesPeticion {
  readonly metodo?: MetodoHttp;
  readonly cuerpo?: unknown;
  /**
   * Opts a request out of the Bearer header *and* the 401 → refresh
   * interceptor below. Reserved for `POST /auth/login`, `POST /auth/refresh`
   * and `POST /auth/logout` — the three endpoints the server marks
   * `@Publico()` for exactly this reason (DESIGN.md D4). Burning a refresh
   * token in order to log out, or trying to refresh a session while
   * *obtaining* one, would be absurd.
   */
  readonly sinAutenticacion?: boolean;
  /**
   * Extra headers merged in on top of `Content-Type`/`Authorization`. Used by
   * `clienteHttpBlob` (PR15, DESIGN.md D11) to ask for `Accept: application/pdf`
   * — the sealed-document download is the first caller that needs one.
   */
  readonly encabezados?: Record<string, string>;
}

/**
 * Codes that mean "the access token is no good" and are worth one
 * refresh-then-retry. `credenciales_invalidas` is deliberately excluded: it
 * only ever comes back from `POST /auth/login`, which already carries
 * `sinAutenticacion: true` and never reaches this branch — but the check
 * stays explicit rather than relying on that alone, so a future caller that
 * forgets the flag still cannot trigger a pointless refresh on a wrong
 * password.
 */
const CODIGOS_QUE_DISPARAN_REFRESCO: ReadonlySet<CodigoDeError> = new Set([
  "no_autenticado",
  "sesion_invalida",
]);

/**
 * The single seam every HTTP call in this app goes through. Two invariants
 * live here, both load-bearing (DESIGN.md D4):
 *
 * 1. `sinAutenticacion` requests never attach a Bearer header and never
 *    trigger a refresh, no matter what status comes back.
 * 2. A 401 whose `codigo` names a dead access token triggers exactly one
 *    `refrescarSesion()` — itself a mutex — and one retry of the *original*
 *    request with the fresh token. If the refresh itself fails, the
 *    original 401 is what the caller sees, so `mensajeDeError` and the
 *    route guards only ever have to handle one shape of "your session is
 *    over".
 */
export async function clienteHttp<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  return await ejecutar<T>(ruta, opciones, opciones.sinAutenticacion !== true, analizarCuerpo);
}

/**
 * Same seam as `clienteHttp` — Bearer header, `encabezados`, and the 401 →
 * refresh → retry interceptor all apply unchanged — but the body is a `Blob`
 * and is never JSON-parsed (DESIGN.md D11: the sealed PDF response). The only
 * difference from `clienteHttp` is which function reads `Response` on success.
 */
export async function clienteHttpBlob(ruta: string, opciones: OpcionesPeticion = {}): Promise<Blob> {
  return await ejecutar<Blob>(ruta, opciones, opciones.sinAutenticacion !== true, analizarBlob);
}

async function ejecutar<T>(
  ruta: string,
  opciones: OpcionesPeticion,
  permitirRefresco: boolean,
  analizar: (respuesta: Response) => Promise<T>,
): Promise<T> {
  const respuesta = await enviar(ruta, opciones);

  if (respuesta.ok) {
    return await analizar(respuesta);
  }

  const error = await errorDesdeRespuesta(respuesta);

  if (
    permitirRefresco &&
    respuesta.status === 401 &&
    CODIGOS_QUE_DISPARAN_REFRESCO.has(error.codigo as CodigoDeError)
  ) {
    try {
      await refrescarSesion();
    } catch {
      // The refresh itself failed — the session is over either way. Surface
      // the *original* error so every caller sees the same shape of "your
      // session expired", regardless of which of the two requests failed.
      throw error;
    }
    return await ejecutar<T>(ruta, opciones, false, analizar);
  }

  throw error;
}

async function enviar(ruta: string, opciones: OpcionesPeticion): Promise<Response> {
  const encabezados: Record<string, string> = {};

  if (opciones.cuerpo !== undefined) {
    encabezados["Content-Type"] = "application/json";
  }

  if (opciones.sinAutenticacion !== true) {
    const sesion = obtenerSesionActual();
    if (sesion !== null) {
      encabezados["Authorization"] = `Bearer ${sesion.tokenDeAcceso}`;
    }
  }

  if (opciones.encabezados !== undefined) {
    Object.assign(encabezados, opciones.encabezados);
  }

  return await fetch(ruta, {
    method: opciones.metodo ?? "GET",
    headers: encabezados,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : null,
  });
}

async function analizarCuerpo<T>(respuesta: Response): Promise<T> {
  const texto = await respuesta.text();
  return (texto.length === 0 ? undefined : JSON.parse(texto)) as T;
}

async function analizarBlob(respuesta: Response): Promise<Blob> {
  return await respuesta.blob();
}

async function errorDesdeRespuesta(respuesta: Response): Promise<ErrorDeApi> {
  const cuerpo = await cuerpoDeErrorDesdeRespuesta(respuesta);
  return new ErrorDeApi(respuesta.status, cuerpo);
}

async function cuerpoDeErrorDesdeRespuesta(respuesta: Response): Promise<CuerpoDeError> {
  try {
    const datos: unknown = await respuesta.json();
    if (esCuerpoDeError(datos)) {
      return datos;
    }
  } catch {
    // The body was not JSON at all (a proxy error page, an empty body) —
    // fall through to the generic envelope below.
  }

  return {
    error: {
      mensaje: respuesta.statusText.length > 0 ? respuesta.statusText : "Error de red.",
      codigo: "http",
    },
  };
}

function esCuerpoDeError(valor: unknown): valor is CuerpoDeError {
  if (typeof valor !== "object" || valor === null || !("error" in valor)) {
    return false;
  }

  const error = (valor as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    "mensaje" in error &&
    "codigo" in error
  );
}
