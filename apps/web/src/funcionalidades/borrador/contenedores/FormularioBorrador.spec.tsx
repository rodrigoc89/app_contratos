import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosSesion } from "@contratos/esquemas";

import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { FormularioBorrador } from "./FormularioBorrador";

/**
 * Spec `borrador-form` — "Create draft" and "Server-side rejection after
 * client acceptance". `EsquemaCrearContrato` requires both halves
 * (packages/esquemas/src/contrato.ts), so no `POST /contratos` can happen
 * before both steps validate — this is what makes the two-step flow, not an
 * arbitrary UX choice (DESIGN.md, "Non-obvious constraint").
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

function respuestaDeErrorApi(estado: number, codigo: string, mensaje: string): Response {
  return respuestaJson({ error: { mensaje, codigo } }, estado);
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

describe("FormularioBorrador", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
  });

  it("keeps the technician on the comodatario step and shows an error on an incomplete submit, without calling the network", () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre y apellido")).toBeInTheDocument();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("advances to the equipos step once the comodatario data is valid", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<FormularioBorrador />);

    completarComodatario();

    expect(screen.getByLabelText("Modelo de antena")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre y apellido")).not.toBeInTheDocument();
  });

  it("creates the draft once both steps are valid, sending the merged body to POST /contratos", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(await screen.findByText(/c1/)).toBeInTheDocument();
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos");
    const cuerpo = JSON.parse(init.body as string) as {
      comodatario: { nombreCompleto: string };
      equipos: { antenaMac: string };
    };
    expect(cuerpo.comodatario.nombreCompleto).toBe("Ana López");
    expect(cuerpo.equipos.antenaMac).toBe("AC:8B:A9:12:34:56");
  });

  it("surfaces a regla_de_negocio rejection verbatim, keeps the entered values, and does not retry automatically", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(
      respuestaDeErrorApi(400, "regla_de_negocio", "El domicilio no coincide con la zona de cobertura."),
    );
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(
      await screen.findByText("El domicilio no coincide con la zona de cobertura."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección MAC de la antena")).toHaveValue("AC:8B:A9:12:34:56");
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });
});
