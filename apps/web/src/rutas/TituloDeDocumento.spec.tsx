import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../datos/sesion/estadoSesion";
import { rutas } from "./rutas";

/**
 * DESIGN.md D3 / spec `product-identity`, "Per-route document title" —
 * deliberately a SEPARATE file from `rutas.spec.tsx`. That file is the
 * route-guard regression net (técnico cannot reach the office panel) and
 * must stay green WITHOUT being modified. This file mounts the exact same
 * `rutas` tree — the pathless title root included — to prove the per-route
 * `document.title` requirement without adding a single line to the guard
 * file's surface.
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

function renderizarEn(ruta: string) {
  const clienteDePrueba = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const enrutadorDePrueba = createMemoryRouter(rutas, { initialEntries: [ruta] });
  return render(
    <QueryClientProvider client={clienteDePrueba}>
      <RouterProvider router={enrutadorDePrueba} />
    </QueryClientProvider>,
  );
}

describe("document title per route", () => {
  afterEach(() => {
    limpiarSesion();
  });

  it("sets the login route's title to 'Ingresar · IES.NET Contratos'", async () => {
    renderizarEn("/login");

    await waitFor(() => expect(document.title).toBe("Ingresar · IES.NET Contratos"));
  });

  it("sets a distinct title for a distinct route", async () => {
    const primerRenderizado = renderizarEn("/login");
    await waitFor(() => expect(document.title).toBe("Ingresar · IES.NET Contratos"));
    const tituloDeLogin = document.title;
    primerRenderizado.unmount();

    establecerSesion(sesionFalsa("tecnico"));
    renderizarEn("/");
    await screen.findByRole("heading", { name: "Nuevo contrato" });

    expect(document.title.endsWith(" · IES.NET Contratos")).toBe(true);
    expect(document.title).not.toBe(tituloDeLogin);
  });
});
