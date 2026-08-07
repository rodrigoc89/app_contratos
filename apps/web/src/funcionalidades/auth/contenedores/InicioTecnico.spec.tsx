import type { DatosSesion } from "@contratos/esquemas";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { InicioTecnico } from "./InicioTecnico";

/**
 * Task 7.3 — the transition the técnico route actually uses: `FormularioBorrador`
 * (PR6/PR7) creates the draft, then `InicioTecnico` moves into `PasoFirmaDual`
 * (PR13), which itself blocks that move behind `ColaDeGuardado.vaciar()`
 * (DESIGN.md D3, proven directly in `PasoFirmaDual.spec.tsx`). This is the
 * first PR to wire that real, end-to-end navigation.
 */

function sesionFalsa(): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "tecnico1", nombreCompleto: "Técnico", rol: "tecnico", activo: true },
  };
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

function previsualizacionValida() {
  return {
    contratoId: "c1",
    plantillaVersion: "v1",
    plazoMeses: 12,
    fechaPrevistaDeFirma: "2026-08-05",
    fechaPrevistaDeVencimiento: "2027-08-05",
    documentos: [
      { documento: "condiciones_generales", html: "<p>condiciones</p>" },
      { documento: "comodato", html: "<p>comodato</p>" },
    ],
  };
}

function completarComodatario() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Ana López" } });
  fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30123456" } });
  fireEvent.change(screen.getByLabelText("Domicilio"), { target: { value: "San Martín 123" } });
  fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Santiago del Estero" } });
  fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "385 4123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function completarEquipos() {
  fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "Ubiquiti LiteBeam" } });
  fireEvent.change(screen.getByLabelText("Dirección MAC de la antena"), {
    target: { value: "AC:8B:A9:12:34:56" },
  });
  fireEvent.click(screen.getByLabelText("Sí"));
  fireEvent.change(screen.getByLabelText("Metros de caño"), { target: { value: "7,5" } });
}

describe("InicioTecnico", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("moves from the borrador form into the dual-signature review step once the draft is created (task 7.3)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockImplementation((ruta: unknown, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      if (ruta === "/contratos" && metodo === "POST") {
        return Promise.resolve(respuestaJson({ id: "c1", estado: "borrador" }));
      }
      if (ruta === "/contratos/c1/previsualizacion") {
        return Promise.resolve(respuestaJson(previsualizacionValida()));
      }
      throw new Error(`fetch inesperado: ${metodo} ${String(ruta)}`);
    });
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);

    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());
    expect(screen.getByTitle("Contrato de Comodato")).toBeInTheDocument();
    // The form is gone, not merely hidden behind the review step.
    expect(screen.queryByLabelText("Modelo de antena")).not.toBeInTheDocument();
  });
});
