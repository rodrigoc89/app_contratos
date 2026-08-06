import type { DatosSesion } from "@contratos/esquemas";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hayTrabajoEnCurso, limpiarTrabajoEnCurso } from "../../../pwa/trabajoEnCurso";
import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { InicioTecnico } from "./InicioTecnico";

/**
 * Task 7.3 (PR13) wired `FormularioBorrador` → `InicioTecnico` →
 * `PasoFirmaDual`'s real, end-to-end navigation, gated on
 * `ColaDeGuardado.vaciar()` (DESIGN.md D3, proven directly in
 * `PasoFirmaDual.spec.tsx`).
 *
 * Task 19.1 (maintainer decision, overrules task 7.3): that transition used
 * to fire the instant `POST /contratos` succeeded — task 7.3's own test
 * here asserted "the form is gone, not merely hidden behind the review
 * step". A technician who spots a typo (wrong DNI, wrong MAC) after tapping
 * "Crear borrador" had no way back: a signed `comodato` with wrong data can
 * only be fixed by annulling and re-signing (DESIGN.md §3). The draft now
 * stays mounted and editable, and the technician moves into signing only
 * through an explicit "Continuar" action. `POST /contratos` still fires
 * exactly once — see "creates the draft exactly once" below.
 *
 * Task 18.3/19.2 — the debounced-autosave scenario (spec `borrador-form`)
 * and `PasoFirmaDual`'s existing pre-entry flush (DESIGN.md D3, "Pending
 * edit on forward navigation") were both fully implemented but, before this
 * task, unreachable through any real UI (no surface let the technician edit
 * `comodatario`/`equipos` once a contract existed). This file proves both
 * are reachable now, through the real form.
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

/**
 * Dispatches every route this file's tests need: `POST /contratos` (create,
 * once), `PATCH /contratos/c1` (autosave — `respuestaPatch` lets a test make
 * it fail) and `GET /contratos/c1/previsualizacion` (the review step).
 */
function fetchSimuladoCompleto(respuestaPatch: () => Response = () => respuestaJson({ id: "c1", estado: "borrador" })) {
  return vi.fn().mockImplementation((ruta: unknown, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (ruta === "/contratos" && metodo === "POST") {
      return Promise.resolve(respuestaJson({ id: "c1", estado: "borrador" }));
    }
    if (ruta === "/contratos/c1" && metodo === "PATCH") {
      return Promise.resolve(respuestaPatch());
    }
    if (ruta === "/contratos/c1/previsualizacion") {
      return Promise.resolve(respuestaJson(previsualizacionValida()));
    }
    throw new Error(`fetch inesperado: ${metodo} ${String(ruta)}`);
  });
}

async function crearBorrador(): Promise<void> {
  completarComodatario();
  completarEquipos();
  fireEvent.click(screen.getByRole("button", { name: "Crear borrador" }));
  await screen.findByText(/c1/);
}

/** Narrows a `fetch` mock call — `unknown[]` is `mock.calls`' own element type. */
function esLlamada(llamada: unknown[], ruta: string, metodo: string): boolean {
  const [rutaLlamada, init] = llamada as [unknown, RequestInit?];
  return rutaLlamada === ruta && (init?.method ?? "GET") === metodo;
}

describe("InicioTecnico", () => {
  afterEach(() => {
    limpiarSesion();
    limpiarTrabajoEnCurso();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stays on the draft, editable, once it is created — and moves into the review step only via the explicit Continuar action (task 19.1)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchSimuladoCompleto();
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);
    await crearBorrador();

    // Overrules task 7.3's "the form is gone, not merely hidden" — the
    // maintainer's decision (see apply-progress) is the opposite: the form
    // must still be here so the technician can correct a typo before
    // signing.
    expect(screen.getByLabelText("Modelo de antena")).toBeInTheDocument();
    expect(screen.queryByTitle("Condiciones Generales de Uso")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());
    expect(screen.getByTitle("Contrato de Comodato")).toBeInTheDocument();
    expect(screen.queryByLabelText("Modelo de antena")).not.toBeInTheDocument();
  });

  it("creates the draft exactly once, even after post-creation edits and tapping Continuar — corrections are always a PATCH (task 19.1)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchSimuladoCompleto();
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);
    await crearBorrador();

    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "TP-Link CPE210" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());

    const llamadasPost = fetchSimulado.mock.calls.filter((llamada) => esLlamada(llamada, "/contratos", "POST"));
    expect(llamadasPost).toHaveLength(1);
  });

  it("coalesces two comodatario edits made before the debounce window elapses into exactly one PATCH, through the real form (task 18.3)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchSimuladoCompleto();
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);
    await crearBorrador();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(hayTrabajoEnCurso()).toBe(false);

    // The debounce (800ms) only needs to be controllable from here on — the
    // form's own creation already happened under real timers above.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Ana Gómez" } });
    expect(hayTrabajoEnCurso()).toBe(true);
    fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "27987654" } });

    await vi.advanceTimersByTimeAsync(800);

    const llamadasPatch = fetchSimulado.mock.calls.filter((llamada) => esLlamada(llamada, "/contratos/c1", "PATCH"));
    expect(llamadasPatch).toHaveLength(1);
    const [, init] = llamadasPatch[0] as [string, RequestInit];
    const cuerpo = JSON.parse(init.body as string) as { comodatario: { nombreCompleto: string; dni: string } };
    expect(cuerpo.comodatario.nombreCompleto).toBe("Ana Gómez");
    expect(cuerpo.comodatario.dni).toBe("27987654");
    expect(hayTrabajoEnCurso()).toBe(false);
  });

  it("flushes an edit made just before Continuar, not yet debounced, before the review screen renders (task 19.2)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchSimuladoCompleto();
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);
    await crearBorrador();

    // Faked only around the edit + Continuar tap, so the 800ms debounce
    // cannot fire on its own — proving the flush below is what sends this,
    // not the natural timer. `ColaDeGuardado.vaciar()` cancels that pending
    // timer synchronously before this switches back, so nothing is lost by
    // returning to real timers immediately after.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "TP-Link CPE210" } });
    // Edited, then Continuar tapped immediately — well inside the 800ms
    // debounce window. If `PasoFirmaDual` received a fresh, empty queue
    // instead of this SAME instance, this edit would never reach the wire.
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());

    const llamadasPatch = fetchSimulado.mock.calls.filter((llamada) => esLlamada(llamada, "/contratos/c1", "PATCH"));
    expect(llamadasPatch).toHaveLength(1);
    const [, init] = llamadasPatch[0] as [string, RequestInit];
    const cuerpo = JSON.parse(init.body as string) as { equipos: { antenaModelo: string } };
    expect(cuerpo.equipos.antenaModelo).toBe("TP-Link CPE210");
  });

  it("cancels the move into review when the pre-Continuar flush genuinely fails, instead of showing a preview built from stale data (task 19.2)", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchSimuladoCompleto(() => new Response("no", { status: 500 }));
    vi.stubGlobal("fetch", fetchSimulado);

    render(<InicioTecnico />);
    await crearBorrador();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(screen.getByLabelText("Modelo de antena"), { target: { value: "TP-Link CPE210" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    vi.useRealTimers();

    await waitFor(() =>
      expect(
        screen.getByText("No se pudieron guardar los últimos cambios. Verifique la conexión e intente de nuevo."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTitle("Condiciones Generales de Uso")).not.toBeInTheDocument();
  });
});
