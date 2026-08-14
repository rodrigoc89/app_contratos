import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { buscarContratos } from "../datos/consultas/buscarContratos";
import { borrarTokenDeRefrescoGuardado, guardarTokenDeRefresco, obtenerTokenDeRefrescoGuardado } from "../datos/sesion/almacenSesion";
import { establecerSesion, limpiarSesion } from "../datos/sesion/estadoSesion";
import { rutas } from "./rutas";

vi.mock("../datos/consultas/buscarContratos", () => ({
  buscarContratos: vi.fn(),
}));

const buscarContratosSimulado = vi.mocked(buscarContratos);

/**
 * R-3.1 / DESIGN.md D9 (revision: role gating resolves a home, not a dead
 * end) — `tecnico` reaches `/`, `oficina`/`admin` reach `/panel`, and
 * any role none of the guards recognize lands on the role-agnostic
 * fallback. Previously every non-`tecnico` role was hard-redirected to
 * `/panel-no-disponible`, so a successful `oficina` login read as a broken
 * app — this file is what proves that is no longer true.
 */

function sesionFalsa(rol: string): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: {
      id: "usuario-1",
      nombreUsuario: "usuario1",
      nombreCompleto: "Usuario de Prueba",
      rol: rol as DatosSesion["usuario"]["rol"],
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
  const clienteDePrueba = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const enrutadorDePrueba = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <QueryClientProvider client={clienteDePrueba}>
      <RouterProvider router={enrutadorDePrueba} />
    </QueryClientProvider>,
  );
  return enrutadorDePrueba;
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

    expect(screen.getByRole("heading", { name: "Nuevo contrato" })).toBeInTheDocument();
  });

  it("sends an oficina session straight to the contract list, not the old fallback screen", async () => {
    buscarContratosSimulado.mockResolvedValue({ elementos: [], total: 0, pagina: 1, tamanoPagina: 20 });
    establecerSesion(sesionFalsa("oficina"));

    renderizarEn("/");

    expect(await screen.findByRole("heading", { name: "Contratos" })).toBeInTheDocument();
    expect(screen.queryByText(/no está disponible todavía/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("sends an admin session to the same contract list, not the técnico home", async () => {
    buscarContratosSimulado.mockResolvedValue({ elementos: [], total: 0, pagina: 1, tamanoPagina: 20 });
    establecerSesion(sesionFalsa("admin"));

    renderizarEn("/");

    expect(await screen.findByRole("heading", { name: "Contratos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nuevo contrato" })).not.toBeInTheDocument();
  });

  it("reaches /panel directly as oficina", async () => {
    buscarContratosSimulado.mockResolvedValue({ elementos: [], total: 0, pagina: 1, tamanoPagina: 20 });
    establecerSesion(sesionFalsa("oficina"));

    renderizarEn("/panel");

    expect(await screen.findByRole("heading", { name: "Contratos" })).toBeInTheDocument();
  });

  it("sends a técnico who tries /panel back home, not to an error", () => {
    establecerSesion(sesionFalsa("tecnico"));

    renderizarEn("/panel");

    expect(screen.getByRole("heading", { name: "Nuevo contrato" })).toBeInTheDocument();
  });

  it("still lands an unrecognized role on the role-agnostic fallback, never a dead end", () => {
    establecerSesion(sesionFalsa("rol-desconocido"));

    renderizarEn("/");

    expect(screen.getByText(/no hay un panel disponible para su rol/i)).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Nuevo contrato" })).toBeInTheDocument();

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
    expect(screen.queryByRole("heading", { name: "Nuevo contrato" })).not.toBeInTheDocument();

    await act(async () => {
      resolverRespuesta?.(respuestaSesion(sesionFalsa("tecnico")));
    });

    expect(await screen.findByRole("heading", { name: "Nuevo contrato" })).toBeInTheDocument();
  });

  it("restores the técnico session at boot from a stored refresh token, reaching the home without ever showing login", async () => {
    guardarTokenDeRefresco("token-valido");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaSesion(sesionFalsa("tecnico"))));

    renderizarEn("/");

    expect(await screen.findByRole("heading", { name: "Nuevo contrato" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Usuario")).not.toBeInTheDocument();
  });

  /**
   * Leaving from the header used to land on `/login` in silence.
   * `PanelNoDisponible` confirmed the same action from the start, and the
   * header is the control almost everyone actually taps — on a shared tablet
   * an unconfirmed logout reads as the app having dropped the session by
   * itself, which is precisely the doubt that makes someone hand the device
   * over without signing out.
   *
   * Asserted only once the whole logout has settled: `GuardiaDeSesion`
   * reacts to the cleared session first and its own redirect does carry a
   * reason, so a message caught mid-flight would prove nothing. The
   * navigation `usarCierreDeSesion` performs last is what the person reads.
   */
  it("confirms the logout on the login screen after leaving from the header", async () => {
    establecerSesion(sesionFalsa("tecnico"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    renderizarEn("/");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 0));
    });

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cerraste tu sesión correctamente.");
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

/**
 * The office panel's client routes must not collide with the API's.
 *
 * `/contratos` is an API path — nginx routes it to the server with
 * `location ^~ /contratos`, and the service worker's
 * `navigateFallbackDenylist` explicitly refuses to answer navigations there
 * with the app shell. Both are correct, and both were decided while
 * `/contratos` was API-only.
 *
 * When the panel took the same path for its client routes, a client-side
 * click still worked — React Router never asks the server — but a RELOAD, a
 * bookmark, a shared link or "open in new tab" sent a real navigation to
 * `/contratos`, which answered the API's 401 JSON and rendered it as the
 * page. Measured in a browser: no `#root` at all, just the error body.
 *
 * This test exists so the collision cannot come back silently.
 */
describe("client routes never collide with API paths", () => {
  const RUTAS_DE_LA_API = ["/auth", "/contratos", "/salud"];

  function rutasDeclaradas(rutas: readonly RouteObject[], prefijo = ""): string[] {
    return rutas.flatMap((ruta) => {
      const propia = ruta.path ?? "";
      const completa = propia.startsWith("/") ? propia : `${prefijo}${propia}`;
      return [
        ...(ruta.path === undefined ? [] : [completa]),
        ...rutasDeclaradas(ruta.children ?? [], completa),
      ];
    });
  }

  it.each(RUTAS_DE_LA_API)("declares no client route under %s", (rutaApi) => {
    const colisiones = rutasDeclaradas(rutas).filter(
      (ruta) => ruta === rutaApi || ruta.startsWith(`${rutaApi}/`),
    );

    expect(
      colisiones,
      `these client routes sit under the API path ${rutaApi}: a reload would be answered by the API, not the app`,
    ).toEqual([]);
  });
});
