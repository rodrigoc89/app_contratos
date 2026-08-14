import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "../../../datos/sesion/estadoSesion";
import { PaginaLogin } from "./PaginaLogin";
import { PanelNoDisponible } from "./PanelNoDisponible";

/**
 * A `localStorage` that refuses to forget. This is not a hypothetical: a
 * browser with site data blocked (Safari's "Prevent cross-site tracking" on
 * an installed PWA, Firefox in strict mode, an enterprise-managed tablet)
 * raises `SecurityError` from the storage accessors themselves.
 *
 * `removeItem` is the one that matters here — `cerrarSesion` reaches it
 * through `borrarTokenDeRefrescoGuardado`, and that call sits OUTSIDE the
 * `try`/`catch` guarding the `POST /auth/logout` request. The network is
 * therefore not what makes `cerrarSesion` reject; the local cleanup is.
 */
function almacenamientoQueRechazaBorrar(): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => {
      throw new DOMException("El almacenamiento está bloqueado", "SecurityError");
    },
  };
}

describe("PanelNoDisponible", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  /**
   * R-3.2 — this screen stopped being oficina/admin's destination (they now
   * reach `/contratos`), so its copy must stop naming the office. Kept as
   * `rutaInicialPara`'s unknown-role fallback only.
   */
  it("shows role-agnostic copy, no longer promising an office panel", () => {
    render(
      <MemoryRouter initialEntries={["/panel-no-disponible"]}>
        <PanelNoDisponible />
      </MemoryRouter>,
    );

    expect(screen.getByText("Todavía no hay un panel disponible para su rol.")).toBeInTheDocument();
    expect(screen.queryByText(/panel de oficina/i)).not.toBeInTheDocument();
  });

  it("logs out and clears the session when the technician taps 'Cerrar sesión'", async () => {
    establecerSesion({
      tokenDeAcceso: "acceso",
      expiraEnSegundos: 900,
      tokenDeRefresco: "refresco",
      refrescoExpiraEnSegundos: 2_592_000,
      usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    render(
      <MemoryRouter initialEntries={["/panel-no-disponible"]}>
        <PanelNoDisponible />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => {
      expect(obtenerSesionActual()).toBeNull();
    });
  });

  /**
   * Task 21, spec `web-auth-session`: the login screen must distinguish an
   * explicit logout from a mid-visit expiry. This is the app's one existing
   * production caller of `cerrarSesion` — closes the loop end-to-end rather
   * than relying only on `PaginaLogin`'s own isolated coverage.
   */
  it("shows the explicit-logout reason, not the expiry one, after tapping 'Cerrar sesión'", async () => {
    establecerSesion({
      tokenDeAcceso: "acceso",
      expiraEnSegundos: 900,
      tokenDeRefresco: "refresco",
      refrescoExpiraEnSegundos: 2_592_000,
      usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    render(
      <MemoryRouter initialEntries={["/panel-no-disponible"]}>
        <Routes>
          <Route path="/panel-no-disponible" element={<PanelNoDisponible />} />
          <Route path="/login" element={<PaginaLogin />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/cerraste tu sesión/i);
  });

  /**
   * The same defect PR #61 fixed in `CabeceraDeSesion`, still standing here
   * because the "log out, then navigate" pattern was copied without its fix.
   *
   * `cerrarSesion` clears the in-memory session BEFORE anything that can
   * throw, precisely so nobody is trapped in a session they asked to leave.
   * Leaving this screen anyway is therefore the only sensible outcome — yet
   * an un-caught rejection strands the person on the very screen they tapped
   * to get out of, now backed by a session that no longer exists.
   *
   * Two assertions, because leaving is only half the contract. The click
   * handler discards the promise with `void`, and `void` does not catch: it
   * evaluates its operand and throws the value away, rejection handler still
   * unattached. So the rejection escapes the component — an
   * `unhandledrejection` in the browser, and here an error the test process
   * exits non-zero on while every assertion stays green. Node reports it on
   * the tick after the microtask queue drains, so the listener stays attached
   * one macrotask past the navigation.
   */
  it("still reaches the login screen when the local cleanup throws", async () => {
    establecerSesion({
      tokenDeAcceso: "acceso",
      expiraEnSegundos: 900,
      tokenDeRefresco: "refresco",
      refrescoExpiraEnSegundos: 2_592_000,
      usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    vi.stubGlobal("localStorage", almacenamientoQueRechazaBorrar());

    render(
      <MemoryRouter initialEntries={["/panel-no-disponible"]}>
        <Routes>
          <Route path="/panel-no-disponible" element={<PanelNoDisponible />} />
          <Route path="/login" element={<PaginaLogin />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/cerraste tu sesión/i);
  });

  /**
   * Leaving anyway is only half the contract, and this is the half PR #61
   * had to discover the hard way: a passing suite coexisted with a non-zero
   * process exit.
   *
   * The click handler discards the promise with `void`, and `void` does not
   * catch — it evaluates its operand and throws the value away, rejection
   * handler still unattached. So a `try`/`finally` with no `catch` lets the
   * `SecurityError` escape the component: in the browser that is an
   * `unhandledrejection` on every logout with storage blocked.
   *
   * Node reports an escaped rejection on the tick after the microtask queue
   * drains, so the listener stays attached one macrotask past the click.
   * Asserted without gating on the navigation first, so this test fails on
   * the escape itself rather than inheriting the previous test's failure.
   */
  it("keeps the failed cleanup from escaping as an unhandled rejection", async () => {
    establecerSesion({
      tokenDeAcceso: "acceso",
      expiraEnSegundos: 900,
      tokenDeRefresco: "refresco",
      refrescoExpiraEnSegundos: 2_592_000,
      usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    vi.stubGlobal("localStorage", almacenamientoQueRechazaBorrar());

    const escapadas: unknown[] = [];
    const anotarEscapada = (razon: unknown): void => {
      escapadas.push(razon);
    };
    process.on("unhandledRejection", anotarEscapada);

    try {
      render(
        <MemoryRouter initialEntries={["/panel-no-disponible"]}>
          <PanelNoDisponible />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(escapadas).toEqual([]);
    } finally {
      process.off("unhandledRejection", anotarEscapada);
    }
  });
});
