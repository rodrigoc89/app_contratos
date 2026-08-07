import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosCrearContrato, DatosSesion } from "@contratos/esquemas";

import { guardarBorradorLocal, leerBorradorLocal, limpiarBorradorLocal } from "../../../almacenamiento/borradorLocal";
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
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

const VALORES_COMPLETOS: DatosCrearContrato = {
  comodatario: {
    nombreCompleto: "Ana López",
    dni: "30123456",
    domicilioCalle: "San Martín 123",
    ciudad: "Santiago del Estero",
    whatsapp: "385 4123456",
  },
  equipos: {
    antenaModelo: "Ubiquiti LiteBeam",
    antenaMac: "AC:8B:A9:12:34:56",
    poe: true,
    canoMetros: 7.5,
  },
};

describe("FormularioBorrador", () => {
  afterEach(() => {
    limpiarSesion();
    limpiarBorradorLocal();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it("notifies onCreado once the draft is created — the seam the técnico route uses to move into the review step", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    const alCrear = vi.fn();
    render(<FormularioBorrador onCreado={alCrear} />);

    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    await waitFor(() => expect(alCrear).toHaveBeenCalledTimes(1));
    expect(alCrear).toHaveBeenCalledWith({ id: "c1", estado: "borrador" });
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

  /**
   * PR18 (task 18.2) — spec `borrador-form`, "Recovery scope after reload or
   * kill": `almacenamiento/borradorLocal.ts` (PR8) was written and cleared
   * correctly but never *read* on mount, so a recovered draft never actually
   * restored. Verified by breaking: temporarily ignoring the mounted-read
   * (falling back to the empty defaults unconditionally) made this
   * assertion fail — the equipos step never appeared and the field values
   * stayed empty — before the real read was wired back in.
   */
  it("restores comodatario and equipos values from a local draft on mount", () => {
    guardarBorradorLocal({ contratoId: null, paso: "equipos", valores: VALORES_COMPLETOS });

    render(<FormularioBorrador />);

    expect(screen.getByLabelText("Modelo de antena")).toHaveValue("Ubiquiti LiteBeam");
    expect(screen.getByLabelText("Dirección MAC de la antena")).toHaveValue("AC:8B:A9:12:34:56");
    expect(screen.getByLabelText("Metros de caño")).toHaveValue("7.5");
    expect(screen.getByLabelText("Sí")).toBeChecked();
  });

  it("does not restore anything when there is no saved draft — the comodatario step still starts empty", () => {
    render(<FormularioBorrador />);

    expect(screen.getByLabelText("Nombre y apellido")).toHaveValue("");
  });

  /**
   * The other half of "Recovery scope": firmas must never come back. This is
   * already proven directly against `borradorLocal.ts` itself
   * (`borradorLocal.spec.ts`, "strips any field not on EsquemaCrearContrato
   * from valores on read") — `DatosBorradorLocal.valores` structurally has
   * no `firmas` slot, and `leerBorradorLocal`'s `safeParse` strips one even
   * from a payload written directly to storage. This test proves the same
   * guarantee holds one layer up, through the component this PR wires the
   * read into: a tampered payload still restores the form fields, with no
   * trace of the injected `firmas` key anywhere in the rendered form.
   */
  it("restores fields from a tampered draft containing a firmas key, without ever exposing it", () => {
    const CLAVE_BORRADOR = "contratos.borrador.v1";
    localStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({
        version: 1,
        guardadoEn: Date.now(),
        contratoId: null,
        paso: "equipos",
        valores: {
          ...VALORES_COMPLETOS,
          firmas: [{ documento: "comodato", imagenPng: "data:image/png;base64,x", trazos: [] }],
        },
      }),
    );

    render(<FormularioBorrador />);

    expect(screen.getByLabelText("Modelo de antena")).toHaveValue("Ubiquiti LiteBeam");
    expect(document.body.innerHTML).not.toContain("firmas");
    expect(document.body.innerHTML).not.toContain("imagenPng");
  });

  /**
   * The write half of D8 ("Written when: debounced on form change"). Without
   * it, `leerBorradorLocal` above would always return `null` in production —
   * `guardarBorradorLocal` had no production caller anywhere in this app
   * before this task. Only writes once the merged `comodatario`+`equipos`
   * state actually parses against `EsquemaCrearContrato` (design decision,
   * see apply-progress: `EsquemaEquipos.poe` is a required boolean, so a
   * partially-filled equipos step cannot type-check as a `DatosCrearContrato`
   * yet — the draft becomes recoverable exactly when the technician could
   * otherwise tap "Crear borrador").
   */
  it("saves a debounced local draft once both steps are valid", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", vi.fn());
    render(<FormularioBorrador />);

    completarComodatario();
    completarEquipos();

    expect(leerBorradorLocal()).toBeNull();
    vi.advanceTimersByTime(2_000);

    const guardado = leerBorradorLocal();
    expect(guardado).not.toBeNull();
    expect(guardado?.valores.equipos.antenaMac).toBe("AC:8B:A9:12:34:56");
    expect(guardado?.valores.comodatario.nombreCompleto).toBe("Ana López");
  });

  /**
   * Task 18.3/19.1 (maintainer decision, see apply-progress) — the form
   * stays mounted and editable once the draft exists, and `InicioTecnico`
   * hands down the ONE `ColaDeGuardado` it creates for this contract
   * (DESIGN.md D3, task 19.2's shared-instance decision) once `onCreado`
   * fires. This proves the wiring at this component's own level: an edit
   * made with no `cola` yet (the render right after `onCreado` fires, before
   * the parent's own state update lands) must not throw or call anything;
   * an edit made once `cola` is available must reach `encolar` with the
   * WHOLE updated half (never a single field), for both steps — `Volver`
   * (task 19.1) is what makes the comodatario half reachable again at all.
   */
  it("reaches ColaDeGuardado.encolar with the whole updated half for post-creation edits, never before cola is available", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    const encolar = vi.fn();
    const colaFalsa: ColaDeGuardado = {
      encolar,
      vaciar: vi.fn().mockResolvedValue(undefined),
      get hayPendiente() {
        return false;
      },
    };

    const { rerender } = render(<FormularioBorrador />);
    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));
    await screen.findByText(/c1/);

    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "TP-Link CPE210" } });
    expect(encolar).not.toHaveBeenCalled();

    rerender(<FormularioBorrador cola={colaFalsa} />);
    fireEvent.change(screen.getByLabelText("Modelo de antena"), {
      target: { value: "Ubiquiti NanoStation" },
    });
    expect(encolar).toHaveBeenCalledWith({
      equipos: expect.objectContaining({ antenaModelo: "Ubiquiti NanoStation" }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Ana Gómez" } });
    expect(encolar).toHaveBeenCalledWith({
      comodatario: expect.objectContaining({ nombreCompleto: "Ana Gómez" }),
    });
  });

  it("clears the local draft once the contract is actually created — avoids restoring a stale draft into a duplicate submission", async () => {
    establecerSesion(sesionFalsa());
    guardarBorradorLocal({ contratoId: null, paso: "equipos", valores: VALORES_COMPLETOS });
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(await screen.findByText(/c1/)).toBeInTheDocument();
    expect(leerBorradorLocal()).toBeNull();
  });
});
