import {
  EsquemaSesion,
  type DatosLogin,
  type DatosSesion,
  type DatosTokenDeRefresco,
} from "@contratos/esquemas";

import { limpiarBorradorLocal } from "../../almacenamiento/borradorLocal";
import { clienteHttp } from "../clienteHttp";
import { borrarTokenDeRefrescoGuardado, guardarTokenDeRefresco } from "./almacenSesion";
import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./estadoSesion";

/**
 * The login/logout flow (DESIGN.md D4, D10). Both requests carry
 * `sinAutenticacion: true` — the same option `refresco.ts` documents for
 * `/auth/refresh` — so neither one attaches a Bearer header nor triggers
 * the 401 → refresh interceptor. That single mechanism is what makes
 * scenario 9 true by construction rather than by a caller remembering to
 * skip it.
 */
export async function iniciarSesion(datos: DatosLogin): Promise<DatosSesion> {
  const respuesta = await clienteHttp<unknown>("/auth/login", {
    metodo: "POST",
    cuerpo: datos,
    sinAutenticacion: true,
  });
  const sesion = EsquemaSesion.parse(respuesta);
  establecerSesion(sesion);
  guardarTokenDeRefresco(sesion.tokenDeRefresco);
  return sesion;
}

/**
 * Scenario 9: logout works with a dead access token, and that is the
 * point. Local state is cleared **before** the request is awaited — a
 * network failure must never trap a technician in a session they asked to
 * leave (DESIGN.md D4) — and nothing is sent at all if there was never a
 * session or saved refresh token to revoke.
 *
 * Also clears the local `borrador` draft (DESIGN.md D8). A tablet is
 * shared across technicians and visits; a customer's name, DNI and address
 * must not keep sitting in this tablet's storage past the session that
 * captured them.
 */
export async function cerrarSesion(): Promise<void> {
  const tokenDeRefresco = obtenerSesionActual()?.tokenDeRefresco;

  limpiarSesion();
  borrarTokenDeRefrescoGuardado();
  limpiarBorradorLocal();

  if (tokenDeRefresco === undefined) {
    return;
  }

  try {
    const cuerpo: DatosTokenDeRefresco = { tokenDeRefresco };
    await clienteHttp<void>("/auth/logout", {
      metodo: "POST",
      cuerpo,
      sinAutenticacion: true,
    });
  } catch {
    // Local state is already cleared above; a failed logout request must
    // never trap the technician in the app.
  }
}
