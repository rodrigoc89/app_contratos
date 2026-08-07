import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion, obtenerSesionActual } from "../../../datos/sesion/estadoSesion";
import { PanelNoDisponible } from "./PanelNoDisponible";

describe("PanelNoDisponible", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
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
});
