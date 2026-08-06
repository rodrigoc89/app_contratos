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

/**
 * Task 20.2/20.3 — a minimal, schema-valid `GET /contratos/:id` payload, the
 * read this task adds to verify a resumed `contratoId` before ever showing
 * it as editable again (non-negotiable: never resurrect a contract that has
 * already left `borrador`).
 */
function contratoDetalleValido(estado: "borrador" | "vigente" = "borrador") {
  return {
    id: "c1",
    estado,
    numero: estado === "borrador" ? null : 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "San Martín 123",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      whatsapp: "385 4123456",
    },
    equipos: VALORES_COMPLETOS.equipos,
    plazo: null,
    fechaFirma: null,
    plantillaVersionId: null,
    documentos: [],
    eventos: [],
    equiposPendientesDeRestitucion: false,
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

  /**
   * Task 20.1 (maintainer decision, overrules PR19/task 19.1's own choice to
   * clear the draft on creation — see apply-progress for the full "why").
   * PR19 cleared the draft the instant `POST /contratos` succeeded because,
   * at the time, nothing downstream could ever read a `contratoId` back out
   * of it — resuming was not built yet. This task builds that resume path
   * (20.2 below), which makes the old behaviour actively harmful: clearing
   * the ONE slot a reload could resume from is exactly what open item 4
   * (`tasks`) named as the gap. The draft now survives creation and carries
   * the real `contratoId` instead of the old hardcoded `null`.
   */
  it("keeps the local draft after creation, now carrying the real contratoId — the resume mechanism this task adds (task 20.1)", async () => {
    establecerSesion(sesionFalsa());
    guardarBorradorLocal({ contratoId: null, paso: "equipos", valores: VALORES_COMPLETOS });
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(await screen.findByText(/c1/)).toBeInTheDocument();
    const guardado = leerBorradorLocal();
    expect(guardado).not.toBeNull();
    expect(guardado?.contratoId).toBe("c1");
    expect(guardado?.valores.equipos.antenaMac).toBe("AC:8B:A9:12:34:56");
  });

  /**
   * Task 20.1, write cadence — a resumed/created draft keeps reflecting
   * post-creation edits, not just the moment of creation. Verified by
   * breaking: reverting this to the old `if (creado !== null) return;` gate
   * (PR19's behaviour) makes this assertion fail — `leerBorradorLocal()`
   * would still show the pre-creation "Ubiquiti LiteBeam" instead of the
   * post-creation edit.
   */
  it("keeps writing the local draft — now with the contratoId — through post-creation edits (task 20.1)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson({ id: "c1", estado: "borrador" }));
    vi.stubGlobal("fetch", fetchSimulado);
    render(<FormularioBorrador />);

    completarComodatario();
    completarEquipos();
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));
    await screen.findByText(/c1/);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "TP-Link CPE210" } });
    vi.advanceTimersByTime(2_000);
    vi.useRealTimers();

    const guardado = leerBorradorLocal();
    expect(guardado).not.toBeNull();
    expect(guardado?.contratoId).toBe("c1");
    expect(guardado?.valores.equipos.antenaModelo).toBe("TP-Link CPE210");
  });

  /**
   * Task 20.2 — the reason 20.1 persists the real `contratoId`: a reload
   * mid-visit must resume the SAME contract, never create a second one.
   * `obtenerContrato` (`GET /contratos/:id`) is the verification this task
   * adds before trusting a stored `contratoId` at all (non-negotiable: never
   * resurrect a contract that already left `borrador` for editing).
   * Verified by breaking: writing `contratoId: null` in the seeded draft
   * below makes this test fail — the form shows the empty comodatario step
   * and `onCreado` is never called, because there is nothing to resume.
   */
  it("resumes an existing borrador from its stored contratoId on mount, without ever calling POST /contratos (task 20.2)", async () => {
    establecerSesion(sesionFalsa());
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });
    const alCrear = vi.fn();
    const fetchSimulado = vi.fn().mockImplementation((ruta: unknown, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      if (ruta === "/contratos/c1" && metodo === "GET") {
        return Promise.resolve(respuestaJson(contratoDetalleValido("borrador")));
      }
      throw new Error(`fetch inesperado: ${metodo} ${String(ruta)}`);
    });
    vi.stubGlobal("fetch", fetchSimulado);

    render(<FormularioBorrador onCreado={alCrear} />);

    expect(await screen.findByLabelText("Modelo de antena")).toHaveValue("Ubiquiti LiteBeam");
    await waitFor(() => expect(alCrear).toHaveBeenCalledWith({ id: "c1", estado: "borrador" }));
    // The stronger half of the proof: the equipos step's submit reads
    // "Continuar", not "Crear borrador" — the only button that issues
    // `POST /contratos` is unreachable once resumed, not merely un-tapped.
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear borrador" })).not.toBeInTheDocument();
    expect(fetchSimulado.mock.calls.some((llamada) => llamada[0] === "/contratos")).toBe(false);
  });

  /**
   * Non-negotiable constraint — a resumed draft must never reopen a contract
   * that is no longer `borrador` (e.g. already signed elsewhere while the
   * técnico was away). Falls back to a fresh, blank draft instead of
   * silently exposing an editable form over a `vigente` contract.
   */
  it("does not resume a contratoId whose contract already left borrador — starts a fresh draft instead (non-negotiable)", async () => {
    establecerSesion(sesionFalsa());
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });
    const alCrear = vi.fn();
    const fetchSimulado = vi.fn().mockResolvedValue(respuestaJson(contratoDetalleValido("vigente")));
    vi.stubGlobal("fetch", fetchSimulado);

    render(<FormularioBorrador onCreado={alCrear} />);

    expect(await screen.findByLabelText("Nombre y apellido")).toHaveValue("");
    expect(alCrear).not.toHaveBeenCalled();
    expect(leerBorradorLocal()).toBeNull();
  });

  /**
   * Same fallback for the case where the stored contract cannot even be
   * confirmed — gone, or the tablet cannot reach the server right now.
   * Guessing "it is probably still fine" is exactly the failure mode the
   * constraint forbids.
   */
  it("does not resume when the stored contratoId can no longer be verified — starts a fresh draft instead", async () => {
    establecerSesion(sesionFalsa());
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });
    const alCrear = vi.fn();
    const fetchSimulado = vi.fn().mockResolvedValue(
      respuestaDeErrorApi(404, "no_encontrado", "Ese contrato no existe."),
    );
    vi.stubGlobal("fetch", fetchSimulado);

    render(<FormularioBorrador onCreado={alCrear} />);

    expect(await screen.findByLabelText("Nombre y apellido")).toHaveValue("");
    expect(alCrear).not.toHaveBeenCalled();
    expect(leerBorradorLocal()).toBeNull();
  });
});
