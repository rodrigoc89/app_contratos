import {
  EsquemaFirmarContrato,
  MINIMO_PUNTOS_FIRMA,
  type DatosFirmaCapturada,
  type DatosPrevisualizacion,
} from "@contratos/esquemas";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import type { ObservadorDeDocumento } from "../../revision/logica/observadorDeDocumento";
import type { MedicionDeDesplazamiento } from "../../revision/logica/puertaDeLectura";
import type { SuperficieDeFirma } from "../logica/superficieDeFirma";
import { PasoFirmaDual } from "./PasoFirmaDual";

/**
 * Spec `document-review` + `firma-capture` + `contract-signing`, DESIGN.md
 * D2/D3/D5 — the dual-signature step container. Three things are proven here
 * that no earlier PR could prove alone, because this is the first PR to
 * compose them:
 *
 * 1. **Task 7.3** — moving into this step is blocked behind
 *    `ColaDeGuardado.vaciar()` (DESIGN.md D3): nothing from the review step
 *    renders until the flush resolves, and a failed flush shows a retry
 *    affordance instead of a broken/partial review screen.
 * 2. **Signing needs BOTH documents' reading gates `completo`** — one alone
 *    is not enough (spec `document-review`, "One document read, one not").
 * 3. **The gate is the captured points, never the image.** A blank canvas
 *    still produces a schema-valid PNG (`superficieDeCanvas.spec.ts`,
 *    `LienzoDeFirma.spec.tsx`) — the fake surface here does too, on purpose,
 *    so a test that gated on the image alone would pass here by mistake.
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

function colaFalsa(vaciar: () => Promise<void>): ColaDeGuardado {
  return {
    encolar() {},
    vaciar,
    get hayPendiente() {
      return false;
    },
  };
}

/**
 * `VisorDeDocumento` calls its `crearObservador` factory once per instance —
 * this hands back a fresh scripted `ObservadorDeDocumento` on every call,
 * indexed by call order, so `emitir(0, …)` drives the first document
 * rendered (`condiciones_generales`) and `emitir(1, …)` the second
 * (`comodato`), matching `DOCUMENTOS_DEL_CONTRATO`'s order.
 */
function observadorFalsoPorLlamada(): {
  crearObservador: () => ObservadorDeDocumento;
  emitir: (indice: number, medicion: MedicionDeDesplazamiento) => void;
} {
  const emisores: Array<(medicion: MedicionDeDesplazamiento) => void> = [];
  return {
    crearObservador: () => {
      const indice = emisores.length;
      return {
        observar(alMedir) {
          emisores[indice] = alMedir;
          return () => {};
        },
      };
    },
    emitir(indice, medicion) {
      emisores[indice]?.(medicion);
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

/** Draws one stroke of exactly `cantidadDePuntos` points — 1 pointerdown + (n-1) pointermoves. */
function firmarEnLienzo(lienzo: Element, cantidadDePuntos: number): void {
  fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 0, clientY: 0, pointerType: "touch" });
  for (let i = 1; i < cantidadDePuntos; i += 1) {
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: i * 2, clientY: 0, pointerType: "touch" });
  }
  fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: cantidadDePuntos * 2, clientY: 0, pointerType: "touch" });
}

describe("PasoFirmaDual", () => {
  it("blocks review content until the pending autosave flush resolves (task 7.3, DESIGN.md D3)", async () => {
    let resolverVaciado: (() => void) | undefined;
    const vaciar = () =>
      new Promise<void>((resolver) => {
        resolverVaciado = resolver;
      });
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(vaciar)}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Guardando los últimos cambios");
    expect(screen.queryByTitle("Condiciones Generales de Uso")).not.toBeInTheDocument();

    resolverVaciado?.();
    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());
  });

  it("shows a retry affordance and stays out of the review step when the flush fails", async () => {
    const vaciar = vi.fn().mockRejectedValueOnce(new Error("fallo de red")).mockResolvedValue(undefined);
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(vaciar)}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
      />,
    );

    await screen.findByRole("alert");
    expect(screen.queryByTitle("Condiciones Generales de Uso")).not.toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());
    expect(vaciar).toHaveBeenCalledTimes(2);
  });

  it("shows a retry affordance when the preview fails to load, after the flush already succeeded", async () => {
    const cargar = vi
      .fn()
      .mockRejectedValueOnce(new Error("fallo de red"))
      .mockResolvedValue(previsualizacionValida());
    render(
      <PasoFirmaDual contratoId="c1" crearCola={() => colaFalsa(() => Promise.resolve())} cargarPrevisualizacion={cargar} />,
    );

    await screen.findByRole("alert");
    expect(screen.queryByTitle("Condiciones Generales de Uso")).not.toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByTitle("Condiciones Generales de Uso")).toBeInTheDocument());
  });

  it("mounts one VisorDeDocumento and one LienzoDeFirma per document once ready", async () => {
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(() => Promise.resolve())}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
      />,
    );

    expect(await screen.findByTitle("Condiciones Generales de Uso")).toBeInTheDocument();
    expect(screen.getByTitle("Contrato de Comodato")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma — Condiciones Generales de Uso" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma — Contrato de Comodato" })).toBeInTheDocument();
  });

  it("keeps Firmar disabled until BOTH documents' reading gates are completo — one alone is not enough", async () => {
    const { crearObservador, emitir } = observadorFalsoPorLlamada();
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(() => Promise.resolve())}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
      />,
    );
    await screen.findByTitle("Condiciones Generales de Uso");
    const [condiciones, comodato] = screen.getAllByRole("img");

    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);

    act(() => {
      emitir(0, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    expect(screen.getByRole("button", { name: "Firmar" })).toBeDisabled();

    act(() => {
      emitir(1, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });
    expect(screen.getByRole("button", { name: "Firmar" })).toBeEnabled();
  });

  it("cannot submit a blank signature — its PNG is schema-valid, but the gate is on captured points, not the image", async () => {
    const { crearObservador, emitir } = observadorFalsoPorLlamada();
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(() => Promise.resolve())}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
      />,
    );
    await screen.findByTitle("Condiciones Generales de Uso");

    act(() => {
      emitir(0, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir(1, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });

    const [condiciones, comodato] = screen.getAllByRole("img");
    // A tap on each canvas — well under MINIMO_PUNTOS_FIRMA. The fake
    // surface still returns a schema-valid PNG regardless.
    firmarEnLienzo(condiciones as Element, 2);
    firmarEnLienzo(comodato as Element, 2);

    expect(screen.getByRole("button", { name: "Firmar" })).toBeDisabled();
  });

  it("calls onListo with an assembled firmas[] the real signing schema accepts, once every requirement is met", async () => {
    const { crearObservador, emitir } = observadorFalsoPorLlamada();
    const alListo = vi.fn();
    render(
      <PasoFirmaDual
        contratoId="c1"
        crearCola={() => colaFalsa(() => Promise.resolve())}
        cargarPrevisualizacion={() => Promise.resolve(previsualizacionValida())}
        crearObservador={crearObservador}
        crearSuperficie={superficieFalsa()}
        onListo={alListo}
      />,
    );
    await screen.findByTitle("Condiciones Generales de Uso");

    act(() => {
      emitir(0, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
      emitir(1, { scrollTop: 3000, clientHeight: 800, scrollHeight: 3000 });
    });

    const [condiciones, comodato] = screen.getAllByRole("img");
    firmarEnLienzo(condiciones as Element, MINIMO_PUNTOS_FIRMA);
    firmarEnLienzo(comodato as Element, MINIMO_PUNTOS_FIRMA);

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Firmar" }));

    expect(alListo).toHaveBeenCalledTimes(1);
    const [firmas] = alListo.mock.calls[0] as [DatosFirmaCapturada[]];
    const cuerpo = { firmas, dispositivoId: "tablet-de-prueba" };
    expect(EsquemaFirmarContrato.safeParse(cuerpo).success).toBe(true);
  });
});
