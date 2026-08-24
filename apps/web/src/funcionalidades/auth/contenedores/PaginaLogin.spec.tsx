import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
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

function renderizar(motivo?: "sesion_expirada" | "cierre_explicito") {
  const entrada =
    motivo === undefined ? "/login" : { pathname: "/login", state: { motivo } };
  render(
    <MemoryRouter initialEntries={[entrada]}>
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

  /**
   * web-auth-session (revision: role gating resolves a home, R-3.1) —
   * `oficina`/`admin` no longer land on `/panel-no-disponible`: they reach
   * `/contratos` directly, the same way `PaginaLogin` already routes
   * `tecnico` straight to its own home instead of relying only on the next
   * render's route guard to catch it.
   */
  it("routes oficina straight to /panel on valid login, not the fallback screen", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(sesionFalsa("oficina")));
    vi.stubGlobal("fetch", fetchSimulado);

    const enrutador = createMemoryRouter(
      [
        { path: "/login", element: <PaginaLogin /> },
        { path: "/panel", element: <p>Listado</p> },
        { path: "/panel-no-disponible", element: <p>No disponible</p> },
      ],
      { initialEntries: ["/login"] },
    );
    render(<RouterProvider router={enrutador} />);

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "oficina1" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "correcta" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(enrutador.state.location.pathname).toBe("/panel"));
  });

  it("routes admin straight to /panel on valid login too", async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(sesionFalsa("admin")));
    vi.stubGlobal("fetch", fetchSimulado);

    const enrutador = createMemoryRouter(
      [
        { path: "/login", element: <PaginaLogin /> },
        { path: "/panel", element: <p>Listado</p> },
        { path: "/panel-no-disponible", element: <p>No disponible</p> },
      ],
      { initialEntries: ["/login"] },
    );
    render(<RouterProvider router={enrutador} />);

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin1" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "correcta" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(enrutador.state.location.pathname).toBe("/panel"));
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

  /**
   * Task 21, spec `web-auth-session` — "Session expires mid-form": the app
   * must "show a clear reason" on arrival, distinguishing a mid-visit
   * expiry from an explicit logout. `GuardiaDeSesion` carries the reason as
   * router `state`, not through storage (Ley 25.326 — nothing new belongs
   * in `localStorage` here).
   */
  it("shows no reason banner on a plain, reason-less visit to login", () => {
    renderizar();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains a mid-visit session expiry when arriving with that reason", () => {
    renderizar("sesion_expirada");

    expect(screen.getByRole("status")).toHaveTextContent(/tu sesión expiró/i);
  });

  it("confirms an explicit logout, distinctly from an expiry", () => {
    renderizar("cierre_explicito");

    expect(screen.getByRole("status")).toHaveTextContent(/cerraste tu sesión/i);
  });
});

/**
 * The password is long and awkward to type blind on a tablet held in someone
 * else's house, so the técnico can reveal it while typing. There is no icon
 * set in this app (no library, no `.svg`, no `<svg>` anywhere in `src`), so
 * the control is a plain text button beside the field — the same shape
 * `EscanerDeMac` and `BarraDeBusqueda` already use.
 */
describe("PaginaLogin — mostrar u ocultar la contraseña", () => {
  it("hides the password until it is asked for", () => {
    renderizar();

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeInTheDocument();
  });

  it("reveals the typed password, and hides it again", () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "unaLarguísima" } });

    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("unaLarguísima");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
  });

  /**
   * A `<button>` inside a `<form>` submits it by default, and this one sits
   * inside the login form. Revealing the password must never be a login
   * attempt — least of all a half-typed one against a rate-limited endpoint.
   */
  it("does not submit the form", () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);

    renderizar();
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "tecnico1" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "correcta" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the password visible after a rejected login — that is when the typo has to be readable", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await screen.findByText("Usuario o contraseña incorrectos.");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
  });
});

/**
 * The first screen a técnico sees had no heading at all — the form opened on
 * a bare "Usuario" label. Same defect as both draft steps, same fix.
 */
describe("PaginaLogin — encabezado", () => {
  it("titles the screen", () => {
    render(
      <MemoryRouter>
        <PaginaLogin />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  /**
   * D2, spec `brand-presentation` — "wordmark precedes the heading". Document
   * order, not just presence: the mark has to be a real predecessor of the
   * `<h1>`, checked with `compareDocumentPosition` rather than assuming
   * insertion order from the JSX alone.
   *
   * Also re-confirms D2's constraint 1 from the component's own side of the
   * wiring: exactly one `heading` still resolves once `MarcaProducto` is
   * rendered above it — a second heading would make `getByRole` throw.
   */
  it("shows the product wordmark above the Ingresar heading", () => {
    const { container } = render(
      <MemoryRouter>
        <PaginaLogin />
      </MemoryRouter>,
    );

    // `[data-marca-producto]` replaces `.marca-producto` (PR8 — the BEM
    // class is retired along with the rest of this atom's CSS styling).
    const marca = container.querySelector("[data-marca-producto]");
    const encabezado = screen.getByRole("heading", { level: 1 });

    expect(marca?.textContent).toBe("IES.NET Contratos");
    expect(encabezado).toHaveTextContent("Ingresar");
    expect(
      (marca?.compareDocumentPosition(encabezado) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
