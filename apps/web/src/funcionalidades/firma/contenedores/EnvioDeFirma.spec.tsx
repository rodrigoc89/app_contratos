import {
  MINIMO_PUNTOS_FIRMA,
  type DatosContratoDetalle,
  type DatosFirmaCapturada,
  type DatosPrevisualizacion,
  type TipoDocumentoFirmado,
} from "@contratos/esquemas";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorDeApi } from "../../../datos/clienteHttp";
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { guardarBorradorLocal, leerBorradorLocal, limpiarBorradorLocal } from "../../../almacenamiento/borradorLocal";
import { hayTrabajoEnCurso, limpiarTrabajoEnCurso } from "../../../pwa/trabajoEnCurso";
import { vaciarTrabajoPendiente } from "../../../tests/vaciarTrabajoPendiente";
import type { ObservadorDeDocumento } from "../../revision/logica/observadorDeDocumento";
import type { MedicionDeDesplazamiento } from "../../revision/logica/puertaDeLectura";
import type { SuperficieDeFirma } from "../logica/superficieDeFirma";
import { EnvioDeFirma } from "./EnvioDeFirma";

/**
 * Task 14.3 — the container that finally calls `PasoFirmaDual`'s `onListo`
 * for real: submits `firmarContrato`, clears the local draft on success
 * (DESIGN.md D8) and offers a same-payload retry on failure — the technician
 * never has to re-sign because a network call failed after they already
 * signed correctly.
 */

const PNG_DE_PRUEBA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

function colaFalsa(): ColaDeGuardado {
  return {
    encolar() {},
    vaciar: () => Promise.resolve(),
    get hayPendiente() {
      return false;
    },
  };
}

/** Same shape as `PasoFirmaDual.spec.tsx`'s own fake — keyed by the iframe's `title`. */
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

async function esperarPasoListo(): Promise<void> {
  await screen.findByTitle("Condiciones Generales de Uso");
  await act(async () => {});
}

/** Completes both reading gates and both signatures, then taps Firmar. */
async function firmarAmbosDocumentos(emitir: (titulo: string, medicion: MedicionDeDesplazamiento) => void): Promise<void> {
  const usuario = userEvent.setup();
  act(() => {
    emitir("Condiciones Generales de Uso", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    emitir("Contrato de Comodato", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
  });
  const [condiciones, comodato] = screen.getAllByRole("img");
  firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
  firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);
  await usuario.click(screen.getByRole("button", { name: "Firmar" }));
}

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
    eventos: [
      { tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42", usuario: null },
    ],
    equiposPendientesDeRestitucion: false,
  };
}

const BORRADOR_DE_PRUEBA = {
  contratoId: "c1",
  paso: "equipos" as const,
  valores: {
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30123456",
      domicilioCalle: "San Martín 123",
      ciudad: "Santiago del Estero",
      whatsapp: "385 4123456",
    },
    equipos: { antenaModelo: "Ubiquiti LiteBeam", antenaMac: "AC:8B:A9:12:34:56", poe: true, canoMetros: 7.5 },
  },
};

describe("EnvioDeFirma", () => {
  afterEach(() => {
    limpiarBorradorLocal();
    limpiarTrabajoEnCurso();
    // PR26 — a timed-out fake-timer test below must never leave fake timers
    // active for the next test in this file (userEvent hangs under them).
    vi.useRealTimers();
  });

  it("marks trabajoEnCurso active as soon as the signing step mounts, and clears it once sealed (DESIGN.md D9)", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi.fn().mockResolvedValue(contratoSellado());

    const { unmount } = render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();
    expect(hayTrabajoEnCurso()).toBe(true);

    await firmarAmbosDocumentos(emitir);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));
    expect(hayTrabajoEnCurso()).toBe(false);

    unmount();
  });

  it("keeps trabajoEnCurso active while a signed-but-unsubmitted-response error is showing — a retry is still pending work", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi
      .fn()
      .mockRejectedValueOnce(new ErrorDeApi(500, { error: { mensaje: "falla de red", codigo: "http" } }));

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    await screen.findByRole("alert");
    expect(hayTrabajoEnCurso()).toBe(true);
  });

  it("submits the assembled firmas[] once Firmar is tapped, and clears the local draft on success (DESIGN.md D8)", async () => {
    guardarBorradorLocal(BORRADOR_DE_PRUEBA);
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const sellado = contratoSellado();
    const firmar = vi.fn().mockResolvedValue(sellado);

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();
    expect(leerBorradorLocal()).not.toBeNull();

    await firmarAmbosDocumentos(emitir);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));
    expect(screen.getByRole("status")).toHaveTextContent("42");
    expect(firmar).toHaveBeenCalledTimes(1);
    const [, firmasEnviadas] = firmar.mock.calls[0] as [string, readonly DatosFirmaCapturada[]];
    expect(firmasEnviadas).toHaveLength(2);
    expect(new Set(firmasEnviadas.map((f) => f.documento))).toEqual(
      new Set<TipoDocumentoFirmado>(["condiciones_generales", "comodato"]),
    );
    // The local draft is gone — signing succeeded, nothing left to recover.
    expect(leerBorradorLocal()).toBeNull();
  });

  /**
   * This reverses a decision PR15 wrote into `EntregaDeDocumentos.spec.tsx`
   * as "offers no exit before anything has been delivered — the customer's
   * copy comes first". Delivery does not happen here any more (DESIGN.md §8,
   * decided 2026-08-18): the office sends the documents, so there is no step
   * left for the técnico to complete and nothing left to gate the exit on.
   *
   * That gate was also a trap. It lived inside the delivered branch alone, so
   * a técnico who never tapped share, who cancelled the OS share sheet, or
   * whose share AND download both failed was left with "Cerrar sesión" — the
   * one action that also throws away the session — as the only way off this
   * screen. The exit is now a property of having signed, nothing else.
   */
  it("offers the exit as soon as the contract is signed, with no delivery step to complete first", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi.fn().mockResolvedValue(contratoSellado());

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));
    expect(screen.getByRole("button", { name: "Finalizar y empezar otro contrato" })).toBeInTheDocument();
    // The técnico shares nothing from the tablet any more — the whole
    // delivery affordance is gone, not merely hidden behind a condition.
    expect(screen.queryByRole("button", { name: "Compartir documentos" })).not.toBeInTheDocument();
  });

  /**
   * The técnico is standing in front of the customer, who is about to ask
   * where their copy is. Removing the share action without saying who sends
   * the documents would leave them with no answer.
   */
  it("says the office sends the documents, so the técnico can answer the customer standing next to them", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={vi.fn().mockResolvedValue(contratoSellado())}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    expect(
      await screen.findByText("Los documentos firmados los envía la oficina. No tenés que hacer nada más."),
    ).toBeInTheDocument();
  });

  it("reports the tap to the visit's owner — this container never resets the visit itself", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const onFinalizarVisita = vi.fn();

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={vi.fn().mockResolvedValue(contratoSellado())}
        onFinalizarVisita={onFinalizarVisita}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "Finalizar y empezar otro contrato" }));

    expect(onFinalizarVisita).toHaveBeenCalledTimes(1);
  });

  /**
   * PR26 — design.md "Toast" category: the signing confirmation is an
   * auto-dismissing, dismissible toast, but everything the técnico needs
   * after it expires must outlive it — the heading, the line naming who
   * sends the documents, and the exit.
   */
  it("auto-dismisses the signing-confirmation toast while the heading, the copy and the exit stay put", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi.fn().mockResolvedValue(contratoSellado());

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    // `fireEvent`, not `userEvent`, throughout this test — `userEvent`'s
    // internal delays rely on real timers, and this test needs fake timers
    // active from BEFORE the toast mounts (its own 5s window starts at
    // mount, not from whenever the test later switches timer modes).
    //
    // With fake timers installed, this test must not touch `waitFor` or
    // `findBy*` again: those poll on the REAL clock against a wall-clock
    // budget and, worse, advance the fake clock behind the test's back. This
    // test used to do exactly that and failed intermittently under CI load.
    // `vaciarTrabajoPendiente` documents the whole race — read it before
    // reintroducing any wall-clock wait below this line.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      emitir("Condiciones Generales de Uso", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir("Contrato de Comodato", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    const [condiciones, comodato] = screen.getAllByRole("img");
    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);
    fireEvent.click(screen.getByRole("button", { name: "Firmar" }));

    // No `waitFor`/`findBy*` anywhere between here and the assertions, on
    // purpose — see `vaciarTrabajoPendiente`. Signing resolves on the
    // microtask queue (the injected `firmar` is a `mockResolvedValue`), so
    // there is nothing to wait for in wall-clock terms: flushing is enough,
    // and flushing cannot be starved by a busy machine.
    await vaciarTrabajoPendiente();

    // Asserted BEFORE advancing, so the "it disappeared" check below can
    // never pass vacuously against a toast that never rendered at all.
    expect(screen.getByRole("status")).toHaveTextContent("firmado");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.queryByText(/firmado correctamente/)).not.toBeInTheDocument();
    // The toast is the only thing that may expire. The `h1` behind it, the
    // line naming who sends the documents and the exit are all durable —
    // auto-dismissal must not take any of them with it.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Contrato Nº 42 firmado");
    expect(
      screen.getByText("Los documentos firmados los envía la oficina. No tenés que hacer nada más."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar y empezar otro contrato" })).toBeInTheDocument();
  });

  /**
   * Verification-by-breaking (a) guard: an error must never auto-dismiss —
   * only toasts do. Proven by advancing well past the toast's 5s window.
   */
  it("never auto-dismisses the signing error, unlike a toast", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi
      .fn()
      .mockRejectedValue(new ErrorDeApi(500, { error: { mensaje: "falla de red", codigo: "http" } }));

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);
    await screen.findByRole("alert");

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  /**
   * Verification-by-breaking (d) guard: the signing-in-progress message
   * stays a progress indicator, never a toast — same role, same position,
   * no auto-dismiss.
   */
  it("never auto-dismisses the Enviando la firma progress message", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    // Never resolves — holds the "firmando" state for the whole test.
    const firmar = vi.fn().mockReturnValue(new Promise<never>(() => {}));

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    const usuario = userEvent.setup();
    act(() => {
      emitir("Condiciones Generales de Uso", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir("Contrato de Comodato", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    const [condiciones, comodato] = screen.getAllByRole("img");
    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);
    await usuario.click(screen.getByRole("button", { name: "Firmar" }));

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(screen.getByRole("status")).toHaveTextContent("Enviando la firma");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Enviando la firma");
    vi.useRealTimers();
  });

  it("shows a mapped error and a Reintentar affordance that resubmits the SAME firmas — no re-signing required", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const sellado = contratoSellado();
    const firmar = vi
      .fn()
      .mockRejectedValueOnce(new ErrorDeApi(409, { error: { mensaje: "conflicto", codigo: "conflicto_de_estado" } }))
      .mockResolvedValueOnce(sellado);

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Este contrato ya está firmado");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));
    expect(firmar).toHaveBeenCalledTimes(2);
    const primeraLlamada = firmar.mock.calls[0] as [string, readonly DatosFirmaCapturada[]];
    const segundaLlamada = firmar.mock.calls[1] as [string, readonly DatosFirmaCapturada[]];
    // The retry sends the identical, already-captured signatures — the
    // customer already signed correctly, so nothing is re-drawn.
    expect(segundaLlamada[1]).toEqual(primeraLlamada[1]);
  });
});

/**
 * The confirmation that the contract was signed was a `Toast`, and `Toast`
 * dismisses itself after 5 seconds. Measured on the running app, past that
 * window, the whole screen read:
 *
 *   tecnico
 *   Cerrar sesión
 *   Compartir documentos
 *
 * No number, no state, nothing saying the thing that just happened actually
 * happened — at the one moment in this flow with legal weight, with the
 * customer standing there. The toast is still right for the *moment* it
 * lands; what was missing is anything durable behind it.
 *
 * It doubles as this screen's missing `h1` — the one PR #56 fixed for the
 * draft steps and left open here.
 */
describe("EnvioDeFirma — la confirmación sobrevive al toast", () => {
  afterEach(() => {
    limpiarBorradorLocal();
    limpiarTrabajoEnCurso();
    vi.useRealTimers();
  });

  async function firmarHasta(contrato: DatosContratoDetalle): Promise<void> {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={vi.fn().mockResolvedValue(contrato)}
        onFinalizarVisita={() => {}}
      />,
    );
    await esperarPasoListo();
    await firmarAmbosDocumentos(emitir);
  }

  it("states the contract number in a heading, not only in a toast that expires", async () => {
    await firmarHasta(contratoSellado());

    const titulo = await screen.findByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("Contrato Nº 42 firmado");
  });

  /** A draft that somehow reached here has no number; "Nº null" is the failure to avoid. */
  it("says so honestly when there is no number", async () => {
    await firmarHasta({ ...contratoSellado(), numero: null });

    const titulo = await screen.findByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("Contrato firmado");
    expect(titulo.textContent).not.toContain("null");
  });
});
