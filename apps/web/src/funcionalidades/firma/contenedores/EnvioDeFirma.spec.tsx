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
    eventos: [{ tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42" }],
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

  it("mounts the delivery screen once signing succeeds (PR15's own composition job, DESIGN.md D11)", async () => {
    const { crearObservador, emitir } = observadorFalsoPorTitulo();
    const firmar = vi.fn().mockResolvedValue(contratoSellado());
    const entregar = vi.fn();

    render(
      <EnvioDeFirma
        contratoId="c1"
        crearCola={() => colaFalsa()}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        firmar={firmar}
        entregar={entregar}
      />,
    );
    await esperarPasoListo();

    await firmarAmbosDocumentos(emitir);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));
    expect(screen.getByRole("button", { name: "Compartir documentos" })).toBeInTheDocument();
    // Nothing is fetched or shared until the technician actually taps it.
    expect(entregar).not.toHaveBeenCalled();
  });

  /**
   * PR26 — design.md "Toast" category: the signing confirmation becomes an
   * auto-dismissing, dismissible toast, but `EntregaDeDocumentos` (mounted
   * alongside it since PR15) must stay reachable throughout — dismissing or
   * auto-hiding the toast must never unmount the delivery screen.
   */
  it("auto-dismisses the signing-confirmation toast after ~5s while EntregaDeDocumentos stays mounted", async () => {
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
      />,
    );
    await esperarPasoListo();

    // `fireEvent`, not `userEvent`, throughout this test — `userEvent`'s
    // internal delays rely on real timers, and this test needs fake timers
    // active from BEFORE the toast mounts (its own 5s window starts at
    // mount, not from whenever the test later switches timer modes).
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      emitir("Condiciones Generales de Uso", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir("Contrato de Comodato", { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    const [condiciones, comodato] = screen.getAllByRole("img");
    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);
    fireEvent.click(screen.getByRole("button", { name: "Firmar" }));

    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("firmado"));

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.queryByText(/firmado correctamente/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compartir documentos" })).toBeInTheDocument();
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
