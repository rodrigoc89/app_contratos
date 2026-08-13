import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "../../../datos/sesion/estadoSesion";
import { PaginaLogin } from "./PaginaLogin";
import { PanelNoDisponible } from "./PanelNoDisponible";

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
});
