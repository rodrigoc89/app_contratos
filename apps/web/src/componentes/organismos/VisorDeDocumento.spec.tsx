import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ObservadorDeDocumento } from "../../funcionalidades/revision/logica/observadorDeDocumento";
import type { EstadoPuerta, MedicionDeDesplazamiento } from "../../funcionalidades/revision/logica/puertaDeLectura";
import { VisorDeDocumento } from "./VisorDeDocumento";

/**
 * DESIGN.md D2. The threat-matrix requirement (the iframe must never carry
 * `allow-scripts`) and the "never opens on load" requirement are asserted
 * directly against the rendered component. The gate's own transition rules
 * are proven once, without a DOM, in `puertaDeLectura.spec.ts`; here a fake
 * `ObservadorDeDocumento` proves the component wires a real measurement
 * through to that state machine and back out to the confirmation control —
 * the wiring `observadorDeIframe.ts` performs for real in production.
 */
function observadorFalso(): {
  observador: ObservadorDeDocumento;
  emitir: (medicion: MedicionDeDesplazamiento) => void;
} {
  let emisor: ((medicion: MedicionDeDesplazamiento) => void) | null = null;
  return {
    observador: {
      observar(alMedir) {
        emisor = alMedir;
        return () => {
          emisor = null;
        };
      },
    },
    emitir(medicion) {
      emisor?.(medicion);
    },
  };
}

describe("VisorDeDocumento", () => {
  it("threat matrix — the rendered iframe never carries allow-scripts", () => {
    render(<VisorDeDocumento html="<p>hola</p>" titulo="Comodato" />);
    const iframe = screen.getByTitle("Comodato");
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-scripts");
  });

  it("scenario — the gate never opens on load, before any measurement", () => {
    const estados: EstadoPuerta[] = [];
    render(
      <VisorDeDocumento html="<p>hola</p>" titulo="Comodato" onCambiaEstado={(estado) => estados.push(estado)} />,
    );
    expect(estados.at(-1)).toEqual({ estado: "sin_medir" });
  });

  it("scenario 2 through the component — a short document needs the explicit tap, not just the measurement", async () => {
    const usuario = userEvent.setup();
    const { observador, emitir } = observadorFalso();
    const estados: EstadoPuerta[] = [];
    render(
      <VisorDeDocumento
        html="<p>hola</p>"
        titulo="Comodato"
        crearObservador={() => observador}
        onCambiaEstado={(estado) => estados.push(estado)}
      />,
    );

    act(() => {
      emitir({ scrollTop: 0, clientHeight: 800, scrollHeight: 400 });
    });
    expect(estados.at(-1)).toEqual({ estado: "pendiente", motivo: "cabe_sin_desplazar_falta_confirmar" });

    const boton = screen.getByRole("button", { name: "Leí el documento completo" });
    await usuario.click(boton);

    expect(estados.at(-1)).toEqual({ estado: "completo", motivo: "cabe_sin_desplazar" });
    // The confirmation control disappears once its job is done — it is not a
    // generic re-confirm button.
    expect(screen.queryByRole("button", { name: "Leí el documento completo" })).not.toBeInTheDocument();
  });

  it("scenario 1 through the component — a tall document offers no confirmation control until scrolled to the end", () => {
    const { observador, emitir } = observadorFalso();
    const estados: EstadoPuerta[] = [];
    render(
      <VisorDeDocumento
        html="<p>hola</p>"
        titulo="Condiciones generales"
        crearObservador={() => observador}
        onCambiaEstado={(estado) => estados.push(estado)}
      />,
    );

    act(() => {
      emitir({ scrollTop: 0, clientHeight: 800, scrollHeight: 3000 });
    });
    expect(estados.at(-1)).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    act(() => {
      emitir({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 });
    });
    expect(estados.at(-1)).toEqual({ estado: "completo", motivo: "desplazado_al_final" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /*
    The two tests below pin the dependency array of the state-notification
    effect, which is deliberately `[estado]` and not `[estado, onCambiaEstado]`
    (see the comment on that effect). Between them they cover both halves of
    that decision: the half that makes excluding the callback *safe*, and the
    half that makes including it *harmful*. Without them the exclusion reads
    like an oversight, and the obvious "fix" hangs the app.
  */

  it("delivers a state change to the callback the parent passed most recently, never a stale one", () => {
    const { observador, emitir } = observadorFalso();
    // Stable across re-renders on purpose: a fresh `crearObservador` would
    // re-subscribe the observer effect and muddy what this test isolates.
    const crearObservador = () => observador;
    const primera = vi.fn();
    const segunda = vi.fn();

    const { rerender } = render(
      <VisorDeDocumento
        html="<p>hola</p>"
        titulo="Comodato"
        crearObservador={crearObservador}
        onCambiaEstado={primera}
      />,
    );
    expect(primera).toHaveBeenCalledTimes(1);

    // The parent re-renders with a different callback and no state change —
    // the effect does not re-run, so `segunda` is not notified yet.
    rerender(
      <VisorDeDocumento
        html="<p>hola</p>"
        titulo="Comodato"
        crearObservador={crearObservador}
        onCambiaEstado={segunda}
      />,
    );
    expect(segunda).not.toHaveBeenCalled();

    act(() => {
      emitir({ scrollTop: 0, clientHeight: 800, scrollHeight: 3000 });
    });

    // This is what makes the exclusion safe: when the state *does* change,
    // React runs the effect closure from the latest render, so the newest
    // callback is the one that receives it. `onCambiaEstado` is never stale
    // at the moment it fires — it is only ever *not re-fired* for a state
    // the previous callback already received.
    expect(segunda).toHaveBeenCalledTimes(1);
    expect(segunda).toHaveBeenCalledWith({ estado: "pendiente", motivo: "falta_desplazar" });
    expect(primera).toHaveBeenCalledTimes(1);
    expect(primera).toHaveBeenCalledWith({ estado: "sin_medir" });
  });

  it("settles instead of looping when the parent stores each state in fresh state, as PasoFirmaDual does", () => {
    const { observador, emitir } = observadorFalso();
    const crearObservador = () => observador;
    // Generous: the healthy path settles in a handful of renders. This only
    // has to be small enough to trip long before the run wedges.
    const PRESUPUESTO_DE_RENDERS = 40;
    let rendersDelPadre = 0;

    /*
      A faithful miniature of `PasoFirmaDual`: an inline arrow (new identity
      on every render) whose updater always allocates a NEW object, so React
      can never bail out of the parent's re-render. That is precisely the
      shape that turns `onCambiaEstado` in the dependency array into a
      self-feeding loop — effect → parent setState → new callback identity →
      effect → …

      The render budget converts that loop into a readable failure. Without
      it the regression is a hung test run, not a red test.
    */
    function PadreComoPasoFirmaDual() {
      const [, establecerPuertas] = useState<Record<string, EstadoPuerta>>({});
      rendersDelPadre += 1;
      if (rendersDelPadre > PRESUPUESTO_DE_RENDERS) {
        throw new Error(
          `The parent re-rendered ${rendersDelPadre} times for a single measurement: the state notification is feeding back into itself.`,
        );
      }
      return (
        <VisorDeDocumento
          html="<p>hola</p>"
          titulo="Comodato"
          crearObservador={crearObservador}
          onCambiaEstado={(estado) => establecerPuertas((previo) => ({ ...previo, comodato: estado }))}
        />
      );
    }

    render(<PadreComoPasoFirmaDual />);
    act(() => {
      emitir({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 });
    });

    expect(rendersDelPadre).toBeLessThanOrEqual(PRESUPUESTO_DE_RENDERS);
  });

  it("carries the bounded document-viewer class (PR24b) — CSS sizing lives in convencionesDeEstilos.spec.ts's guard, not here", () => {
    render(<VisorDeDocumento html="<p>hola</p>" titulo="Comodato" />);
    const iframe = screen.getByTitle("Comodato");
    expect(iframe).toHaveClass("visor-documento__iframe");
    expect(iframe.parentElement).toHaveClass("visor-documento");
  });
});
