import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../../datos/sesion/estadoSesion";
import { usarSesionActual } from "./usarSesionActual";

/**
 * Task 21, spec `web-auth-session` — "Session expires mid-form". The
 * `useSyncExternalStore` binding over `estadoSesion.ts`'s store: this is
 * what lets `GuardiaDeSesion` (task 21.3) re-render the instant a
 * non-React call site (`refresco.ts`) clears the session, instead of only
 * on the component's own next render pass.
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

describe("usarSesionActual", () => {
  afterEach(() => {
    limpiarSesion();
  });

  it("returns the current session on mount", () => {
    establecerSesion(sesionFalsa("uno"));

    const { result } = renderHook(() => usarSesionActual());

    expect(result.current?.tokenDeAcceso).toBe("acceso-uno");
  });

  it("returns null when there is no session", () => {
    const { result } = renderHook(() => usarSesionActual());

    expect(result.current).toBeNull();
  });

  it("re-renders with the new value when the session is established after mount", () => {
    const { result } = renderHook(() => usarSesionActual());
    expect(result.current).toBeNull();

    act(() => {
      establecerSesion(sesionFalsa("dos"));
    });

    expect(result.current?.tokenDeAcceso).toBe("acceso-dos");
  });

  it("re-renders with null the instant the session is cleared out of band", () => {
    establecerSesion(sesionFalsa("tres"));
    const { result } = renderHook(() => usarSesionActual());
    expect(result.current?.tokenDeAcceso).toBe("acceso-tres");

    act(() => {
      limpiarSesion();
    });

    expect(result.current).toBeNull();
  });
});
