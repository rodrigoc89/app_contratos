import { afterEach, describe, expect, it } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "./estadoSesion";

/**
 * In-memory session holder. Not persisted — `datos/sesion/almacenSesion.ts`
 * (a later slice) is where the refresh token gets a `localStorage` backing,
 * per DESIGN.md D4 ("access token in memory only; refresh token in
 * localStorage") and D8's storage allowlist. This module exists so
 * `clienteHttp.ts` and `refresco.ts` have somewhere to read/write the
 * current session without depending on a UI-facing login flow that does not
 * exist yet.
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

describe("estadoSesion", () => {
  afterEach(() => {
    limpiarSesion();
  });

  it("starts with no session", () => {
    expect(obtenerSesionActual()).toBeNull();
  });

  it("returns exactly the session that was set", () => {
    establecerSesion(sesionFalsa("uno"));

    const actual = obtenerSesionActual();

    expect(actual?.tokenDeAcceso).toBe("acceso-uno");
    expect(actual?.tokenDeRefresco).toBe("refresco-uno");
  });

  it("replaces the previous session rather than merging with it", () => {
    establecerSesion(sesionFalsa("uno"));
    establecerSesion(sesionFalsa("dos"));

    expect(obtenerSesionActual()?.tokenDeAcceso).toBe("acceso-dos");
  });

  it("clears back to null", () => {
    establecerSesion(sesionFalsa("uno"));

    limpiarSesion();

    expect(obtenerSesionActual()).toBeNull();
  });
});
