import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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

  it("carries the bounded document-viewer class (PR24b) — CSS sizing lives in convencionesDeEstilos.spec.ts's guard, not here", () => {
    render(<VisorDeDocumento html="<p>hola</p>" titulo="Comodato" />);
    const iframe = screen.getByTitle("Comodato");
    expect(iframe).toHaveClass("visor-documento__iframe");
    expect(iframe.parentElement).toHaveClass("visor-documento");
  });
});
