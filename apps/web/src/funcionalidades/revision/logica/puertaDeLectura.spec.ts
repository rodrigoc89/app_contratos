import { describe, expect, it } from "vitest";

import {
  confirmar,
  estadoInicialDePuerta,
  medir,
  type EstadoPuerta,
  type MedicionDeDesplazamiento,
} from "./puertaDeLectura";

/**
 * Spec `document-review` + DESIGN.md D2. `puertaDeLectura` is a pure state
 * machine per document — no DOM, no iframe, no timers — driven only by
 * `MedicionDeDesplazamiento` values a caller feeds it. The real feed
 * (`ObservadorDeDocumento`) is exercised separately, through a fake, in
 * `VisorDeDocumento.spec.tsx`; this file proves the state machine itself.
 */

function medicion(datos: MedicionDeDesplazamiento): MedicionDeDesplazamiento {
  return datos;
}

describe("puertaDeLectura", () => {
  it("starts sin_medir, and completo is unreachable without going through medir() or confirmar()", () => {
    const inicial = estadoInicialDePuerta();
    expect(inicial).toEqual({ estado: "sin_medir" });
    // `estadoInicialDePuerta` is the only constructor this module exports —
    // there is no path that yields `{ estado: "completo" }` before a caller
    // supplies a real measurement or an explicit tap.
  });

  it("scenario 1 — a tall document stays pending until the last pixel is reached", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();

    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });

    estado = medir(estado, medicion({ scrollTop: 2100, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });

    estado = medir(estado, medicion({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "completo", motivo: "desplazado_al_final" });
  });

  it("scenario 2 — a document that fits without scrolling needs the explicit tap, never the measurement alone", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();

    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 800, scrollHeight: 400 }));
    // This is the assertion that fails an implementation satisfying the gate
    // straight from `scrollHeight <= clientHeight` — spec `document-review`
    // says such an implementation "fails this scenario".
    expect(estado).toEqual({ estado: "pendiente", motivo: "cabe_sin_desplazar_falta_confirmar" });
    expect(estado.estado).not.toBe("completo");

    estado = confirmar(estado);
    expect(estado).toEqual({ estado: "completo", motivo: "cabe_sin_desplazar" });
  });

  it("confirmar() is a no-op outside the fits-without-scrolling pending state", () => {
    const sinMedir = estadoInicialDePuerta();
    expect(confirmar(sinMedir)).toEqual(sinMedir);

    const faltaDesplazar: EstadoPuerta = { estado: "pendiente", motivo: "falta_desplazar" };
    expect(confirmar(faltaDesplazar)).toEqual(faltaDesplazar);

    let completo: EstadoPuerta = estadoInicialDePuerta();
    completo = medir(completo, medicion({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 }));
    expect(confirmar(completo)).toEqual(completo);
  });

  it("scenario 3 — content that grows after load re-measures and returns a completed document to pending", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();
    estado = medir(estado, medicion({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "completo", motivo: "desplazado_al_final" });

    // A late webfont/image grows the document under the same scroll
    // position. In the real app this measurement is fed by a fake
    // `ObservadorDeDocumento` (VisorDeDocumento.spec.tsx); here it is fed
    // directly, since the gate itself does not know or care where it came
    // from.
    estado = medir(estado, medicion({ scrollTop: 2200, clientHeight: 800, scrollHeight: 4000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });
  });

  it("scenario 4 — a resize that makes a pending document fit does not open its gate", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();
    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });

    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 3200, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "cabe_sin_desplazar_falta_confirmar" });
    expect(estado.estado).not.toBe("completo");
  });

  it("a resize can only move a gate toward pending, never open one already satisfied via the tap", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();
    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 800, scrollHeight: 400 }));
    estado = confirmar(estado);
    expect(estado).toEqual({ estado: "completo", motivo: "cabe_sin_desplazar" });

    estado = medir(estado, medicion({ scrollTop: 0, clientHeight: 800, scrollHeight: 400 }));
    expect(estado).toEqual({ estado: "completo", motivo: "cabe_sin_desplazar" });
  });

  it("a resize that reveals unread content in an already-completed document reopens it toward pending", () => {
    let estado: EstadoPuerta = estadoInicialDePuerta();
    estado = medir(estado, medicion({ scrollTop: 2200, clientHeight: 800, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "completo", motivo: "desplazado_al_final" });

    estado = medir(estado, medicion({ scrollTop: 2200, clientHeight: 400, scrollHeight: 3000 }));
    expect(estado).toEqual({ estado: "pendiente", motivo: "falta_desplazar" });
  });
});
