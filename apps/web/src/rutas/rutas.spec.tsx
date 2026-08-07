import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { borrarTokenDeRefrescoGuardado, guardarTokenDeRefresco, obtenerTokenDeRefrescoGuardado } from "../datos/sesion/almacenSesion";
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

function respuestaSesion(sesion: DatosSesion): Response {
  return new Response(JSON.stringify(sesion), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderizarEn(ruta: string) {
  const enrutadorDePrueba = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutadorDePrueba} />);
}

describe("route guards", () => {
  afterEach(() => {
    limpiarSesion();
    borrarTokenDeRefrescoGuardado();
    vi.unstubAllGlobals();
  });

  it("redirects an unauthenticated visit to the root route to the login screen", () => {
    renderizarEn("/");

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
  });

  it("shows the borrador form to a técnico session", () => {
    establecerSesion(sesionFalsa("tecnico"));

    renderizarEn("/");

    expect(screen.getByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "Datos del cliente" })).not.toBeInTheDocument();
  });

  /**
   * Task 21, spec `web-auth-session` — "Session expires mid-form". Before
   * this task, `GuardiaDeSesion` only read the session at render time:
   * `refresco.ts` clearing it out of band (a non-React call site, mid-visit)
   * never triggered a re-render, so the técnico stayed stuck on the form.
   */
  it("navigates to login the instant the session is cleared out of band, with no reload", async () => {
    establecerSesion(sesionFalsa("tecnico"));
    renderizarEn("/");
    expect(screen.getByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();

    act(() => {
      limpiarSesion();
    });

    expect(await screen.findByLabelText("Usuario")).toBeInTheDocument();
  });

  /**
   * Task 22, part (b) — the cold-start restore. Before this task
   * `GuardiaDeSesion` only had two states (session/no session), so a reload
   * with a live stored refresh token still landed on `/login` first —
   * `obtenerTokenDeRefrescoGuardado()` had zero production readers (Engram
   * observation #53). This proves the third "restoring" boot state never
   * renders the login screen — the flash the brief calls out — nor the
   * técnico home before the boot refresh actually settles.
   */
  it("does not flash the login screen while a boot refresh is pending", async () => {
    guardarTokenDeRefresco("token-valido");
    let resolverRespuesta: ((respuesta: Response) => void) | undefined;
    const respuestaDiferida = new Promise<Response>((resolver) => {
      resolverRespuesta = resolver;
    });
    const fetchSimulado = vi.fn().mockReturnValue(respuestaDiferida);
    vi.stubGlobal("fetch", fetchSimulado);

    renderizarEn("/");

    expect(screen.queryByLabelText("Usuario")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Datos del cliente" })).not.toBeInTheDocument();

    await act(async () => {
      resolverRespuesta?.(respuestaSesion(sesionFalsa("tecnico")));
    });

    expect(await screen.findByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();
  });

  it("restores the técnico session at boot from a stored refresh token, reaching the home without ever showing login", async () => {
    guardarTokenDeRefresco("token-valido");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaSesion(sesionFalsa("tecnico"))));

    renderizarEn("/");

    expect(await screen.findByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Usuario")).not.toBeInTheDocument();
  });

  it("lands on login with a técnico-facing reason and clears the dead stored token when the boot refresh is refused", async () => {
    guardarTokenDeRefresco("token-muerto");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));

    renderizarEn("/");

    expect(await screen.findByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/expiró/i);
    expect(obtenerTokenDeRefrescoGuardado()).toBeNull();
  });
});
