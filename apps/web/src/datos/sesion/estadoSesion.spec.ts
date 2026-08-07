import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import {
  establecerSesion,
  limpiarSesion,
  obtenerMotivoUltimoCierre,
  obtenerSesionActual,
  suscribirseASesion,
} from "./estadoSesion";

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

/**
 * Task 21, spec `web-auth-session` — "Session expires mid-form". Without a
 * subscription, `refresco.ts` clearing the session from a non-React call
 * site never reaches `GuardiaDeSesion`, so a técnico whose session dies
 * mid-visit is stuck on a screen backed by a dead session.
 */
describe("estadoSesion — observable store", () => {
  afterEach(() => {
    limpiarSesion();
  });

  it("notifies a subscriber when a session is established", () => {
    const escucha = vi.fn();
    suscribirseASesion(escucha);

    establecerSesion(sesionFalsa("uno"));

    expect(escucha).toHaveBeenCalledTimes(1);
  });

  it("notifies a subscriber when the session is cleared", () => {
    establecerSesion(sesionFalsa("uno"));
    const escucha = vi.fn();
    suscribirseASesion(escucha);

    limpiarSesion();

    expect(escucha).toHaveBeenCalledTimes(1);
  });

  it("stops notifying once unsubscribed", () => {
    const escucha = vi.fn();
    const desuscribirse = suscribirseASesion(escucha);

    desuscribirse();
    establecerSesion(sesionFalsa("uno"));

    expect(escucha).not.toHaveBeenCalled();
  });

  it("notifies every subscriber, not only the first", () => {
    const primera = vi.fn();
    const segunda = vi.fn();
    suscribirseASesion(primera);
    suscribirseASesion(segunda);

    establecerSesion(sesionFalsa("uno"));

    expect(primera).toHaveBeenCalledTimes(1);
    expect(segunda).toHaveBeenCalledTimes(1);
  });

  it("records sesion_expirada as the default motivo when cleared with no argument", () => {
    establecerSesion(sesionFalsa("uno"));

    limpiarSesion();

    expect(obtenerMotivoUltimoCierre()).toBe("sesion_expirada");
  });

  it("records cierre_explicito when the caller passes it explicitly", () => {
    establecerSesion(sesionFalsa("uno"));

    limpiarSesion("cierre_explicito");

    expect(obtenerMotivoUltimoCierre()).toBe("cierre_explicito");
  });

  it("clears the recorded motivo once a new session is established", () => {
    establecerSesion(sesionFalsa("uno"));
    limpiarSesion("cierre_explicito");

    establecerSesion(sesionFalsa("dos"));

    expect(obtenerMotivoUltimoCierre()).toBeNull();
  });
});
