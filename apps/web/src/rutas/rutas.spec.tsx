import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../datos/sesion/estadoSesion";
import { rutas } from "./rutas";

/**
 * Scenario 15 (spec `web-app-shell` — Roles; DESIGN.md D10): an `oficina`
 * or `admin` user who authenticates successfully is not bounced to login
 * and not shown a permission error — they land on a plain "not available
 * yet" screen. Anything else reads as a broken login to the person it
 * happens to.
 */

function sesionFalsa(rol: DatosSesion["usuario"]["rol"]): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: {
      id: "usuario-1",
      nombreUsuario: "usuario1",
      nombreCompleto: "Usuario de Prueba",
      rol,
      activo: true,
    },
  };
}

function renderizarEn(ruta: string) {
  const enrutadorDePrueba = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutadorDePrueba} />);
}

describe("route guards", () => {
  afterEach(() => {
    limpiarSesion();
  });

  it("redirects an unauthenticated visit to the root route to the login screen", () => {
    renderizarEn("/");

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
  });

  it("shows the técnico home to a técnico session", () => {
    establecerSesion(sesionFalsa("tecnico"));

    renderizarEn("/");

    expect(screen.getByText("Visita en curso")).toBeInTheDocument();
  });

  it("shows 'no disponible todavía' instead of an error for an oficina session", () => {
    establecerSesion(sesionFalsa("oficina"));

    renderizarEn("/");

    expect(screen.getByText(/no está disponible todavía/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("shows the same screen to an admin session, not the técnico home", () => {
    establecerSesion(sesionFalsa("admin"));

    renderizarEn("/");

    expect(screen.getByText(/no está disponible todavía/i)).toBeInTheDocument();
    expect(screen.queryByText("Visita en curso")).not.toBeInTheDocument();
  });
});
