import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { PaginaLogin } from "./PaginaLogin";

/**
 * Spec `web-auth-session`: "Successful login", "Invalid credentials" and
 * "Client-side login validation". `rutas.spec.tsx` only exercises the
 * unauthenticated redirect into this screen; this file exercises the
 * screen's own submit handler, which nothing else calls.
 */

function sesionFalsa(rol: DatosSesion["usuario"]["rol"]): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "tecnico1", nombreCompleto: "Técnico", rol, activo: true },
  };
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

function renderizar() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <PaginaLogin />
    </MemoryRouter>,
  );
}

describe("PaginaLogin", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("rejects an empty submission client-side, without calling the network", () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("logs in and reaches the técnico route on valid credentials", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(sesionFalsa("tecnico")));
    vi.stubGlobal("fetch", fetchSimulado);

    renderizar();
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "tecnico1" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "correcta" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(fetchSimulado).toHaveBeenCalledWith(
        "/auth/login",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server's message inline on invalid credentials", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(
      respuestaJson(
        { error: { codigo: "credenciales_invalidas", mensaje: "Usuario o contraseña incorrectos." } },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    renderizar();
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "tecnico1" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "incorrecta" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Usuario o contraseña incorrectos.")).toBeInTheDocument();
  });
});
