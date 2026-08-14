import {
  MINIMO_PUNTOS_FIRMA,
  type DatosContratoDetalle,
  type DatosPrevisualizacion,
  type DatosSesion,
} from "@contratos/esquemas";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hayTrabajoEnCurso, limpiarTrabajoEnCurso } from "../../../pwa/trabajoEnCurso";
import { leerBorradorLocal, limpiarBorradorLocal } from "../../../almacenamiento/borradorLocal";
import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import type { ObservadorDeDocumento } from "../../revision/logica/observadorDeDocumento";
import type { MedicionDeDesplazamiento } from "../../revision/logica/puertaDeLectura";
import type { SuperficieDeFirma } from "../../firma/logica/superficieDeFirma";
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

function previsualizacionValida(): DatosPrevisualizacion {
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
    // Task 20.1 (overrules task 19.1): the local draft now survives
    // creation, carrying the real `contratoId` (see apply-progress) —
    // without this, one test's created draft leaks into the next test in
    // this file as a `resumiendo` mount, since neither seeds nor clears
    // `localStorage` between tests otherwise.
    limpiarBorradorLocal();
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

/**
 * Reported from a real device: once the documents were delivered, the whole
 * técnico flow was a dead end. `/` is the ONE route this app mounts for a
 * técnico (`rutas.tsx`), so there is no navigation to undo, and this
 * container's three pieces of state were never cleared — `EnvioDeFirma`
 * rendered forever. The only escape was "Cerrar sesión", which also throws
 * away the local draft and the session. A técnico who finished one customer
 * could not start the next one without logging back in.
 *
 * The contract is sealed long before this screen (DESIGN.md §6/§8) and the
 * office panel can re-download the PDFs at any time, so leaving is finishing,
 * never discarding — and that is what the copy has to say.
 *
 * What makes this more than a UI nicety: the next customer's form must come
 * up EMPTY. That property is a chain, not a line of code — the form remounts
 * (it was unmounted for the whole signing step), its `useState` initialiser
 * re-reads the local draft, and the draft is gone because `EnvioDeFirma`
 * cleared it when signing succeeded (DESIGN.md D8). Break any link and the
 * previous customer's name, DNI and address greet the next one on a shared
 * tablet: a Ley 25.326 incident, not a cosmetic bug. Hence a test that
 * asserts the fields themselves, through the real containers, rather than
 * merely that some form rendered.
 */

const PNG_DE_PRUEBA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function contratoSellado(): DatosContratoDetalle {
  return {
    id: "c1",
    estado: "vigente",
    numero: 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "San Martín 123",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      whatsapp: "385 4123456",
    },
    equipos: { antenaModelo: "Ubiquiti LiteBeam", antenaMac: "AC:8B:A9:12:34:56", poe: true, canoMetros: 7.5 },
    plazo: { meses: 12, fechaInicio: "2026-08-05", fechaVencimiento: "2027-08-05" },
    fechaFirma: "2026-08-05",
    plantillaVersionId: "v1",
    documentos: [
      { documento: "condiciones_generales", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/condiciones_generales" },
      { documento: "comodato", sha256: "b".repeat(64), enlace: "/contratos/c1/documentos/comodato" },
    ],
    eventos: [{ tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42", usuario: null }],
    equiposPendientesDeRestitucion: false,
  };
}

/** Same shape as `EnvioDeFirma.spec.tsx`'s own fake — keyed by the iframe's `title`. */
function observadorFalsoPorTitulo(): {
  crearObservador: (iframe: HTMLIFrameElement) => ObservadorDeDocumento;
  emitir: (titulo: string, medicion: MedicionDeDesplazamiento) => void;
} {
  const emisores = new Map<string, (medicion: MedicionDeDesplazamiento) => void>();
  const pendientes = new Map<string, MedicionDeDesplazamiento[]>();
  return {
    crearObservador: (iframe) => ({
      observar(alMedir) {
        emisores.set(iframe.title, alMedir);
        for (const medicion of pendientes.get(iframe.title) ?? []) {
          alMedir(medicion);
        }
        pendientes.delete(iframe.title);
        return () => {
          emisores.delete(iframe.title);
        };
      },
    }),
    emitir(titulo, medicion) {
      const emisor = emisores.get(titulo);
      if (emisor !== undefined) {
        emisor(medicion);
        return;
      }
      const cola = pendientes.get(titulo) ?? [];
      cola.push(medicion);
      pendientes.set(titulo, cola);
    },
  };
}

function superficieFalsa(): () => SuperficieDeFirma {
  return () => ({
    dibujarSegmento() {},
    limpiar() {},
    aPngDataUri: () => PNG_DE_PRUEBA,
  });
}

function firmarEnLienzo(lienzo: Element, cantidadDePuntos: number): void {
  fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
  for (let i = 1; i < cantidadDePuntos; i += 1) {
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: i * 2, clientY: 0, pointerType: "touch" });
  }
  fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: cantidadDePuntos * 2, clientY: 0, pointerType: "touch" });
}

describe("InicioTecnico — la visita se puede terminar", () => {
  afterEach(() => {
    limpiarSesion();
    limpiarTrabajoEnCurso();
    limpiarBorradorLocal();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("comes back to a BLANK draft form after finishing the visit, carrying nothing from the previous customer", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchSimuladoCompleto());
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const entregar = vi.fn().mockResolvedValue({ via: "compartido" });

    render(
      <InicioTecnico
        firma={{
          cargarPrevisualizacion: () => Promise.resolve(previsualizacionValida()),
          crearObservador,
          crearSuperficie: superficieFalsa(),
          firmar: vi.fn().mockResolvedValue(contratoSellado()),
          entregar,
        }}
      />,
    );

    // The whole visit, through the real containers: draft → review → both
    // signatures → the sealed contract → delivery.
    await crearBorrador();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByTitle("Condiciones Generales de Uso");
    await act(async () => {});

    const usuario = userEvent.setup();
    act(() => {
      emitir("Condiciones Generales de Uso", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir("Contrato de Comodato", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    const [condiciones, comodato] = screen.getAllByRole("img");
    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);
    await usuario.click(screen.getByRole("button", { name: "Firmar" }));

    await screen.findByRole("heading", { level: 1 });
    await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));
    await screen.findByRole("button", { name: "Compartir de nuevo" });

    await usuario.click(screen.getByRole("button", { name: "Finalizar y empezar otro contrato" }));

    // Back on step one of a brand-new draft — and every field the previous
    // customer filled in is empty. Anything else here is a Ley 25.326
    // incident on a shared tablet, not a UI regression.
    expect(await screen.findByLabelText("Nombre y apellido")).toHaveValue("");
    expect(screen.getByLabelText("DNI")).toHaveValue("");
    expect(screen.getByLabelText("Domicilio")).toHaveValue("");
    expect(screen.getByLabelText("Ciudad")).toHaveValue("");
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("");
    // Nothing left in storage either, so a reload cannot resurrect it.
    expect(leerBorradorLocal()).toBeNull();
    // The sealed contract's own screen is gone with it.
    expect(screen.queryByRole("button", { name: "Compartir de nuevo" })).not.toBeInTheDocument();
  });
});
