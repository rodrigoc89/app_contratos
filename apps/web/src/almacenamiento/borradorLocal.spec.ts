import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosCrearContrato } from "@contratos/esquemas";

import {
  guardarBorradorLocal,
  leerBorradorLocal,
  limpiarBorradorLocal,
} from "./borradorLocal";

/**
 * DESIGN.md D8 — spec scenario 12, part 1 ("The serialized local draft
 * contains no signature data") and "Recovery scope after reload or kill".
 *
 * The settled Ley 25.326 decision: after an app kill, form data is
 * recovered and signatures are not — the technician re-captures them
 * instead. This module is the one place that persists the in-progress
 * `borrador` locally, and the guarantee it gives is structural, not a rule
 * someone has to remember:
 *
 *   `DatosBorradorLocal.valores` is typed as `DatosCrearContrato` —
 *   `{ comodatario; equipos }`, from `@contratos/esquemas` — which has no
 *   `firmas` field and no slot to put one in. `guardarBorradorLocal` cannot
 *   even be *called* with a signature, because there is no parameter to
 *   pass one through. That is a compile-time guarantee.
 *
 * The runtime test below is the belt to that type-system's braces: it
 * proves the guarantee holds even if a future change stopped relying on
 * the type (e.g. someone widened `guardarBorradorLocal`'s parameter type
 * to accept an extra field by hand, bypassing `DatosCrearContrato`). If
 * that ever happens, this is the test that fails — the type change alone
 * would not, since `unknown`/`any`-typed call sites still compile.
 */

const CLAVE_BORRADOR = "contratos.borrador.v1";

const EQUIPOS: DatosCrearContrato["equipos"] = {
  antenaModelo: "Ubiquiti LiteBeam",
  antenaMac: "AC:8B:A9:12:34:56",
  poe: true,
  canoMetros: 7.5,
};

const COMODATARIO: DatosCrearContrato["comodatario"] = {
  nombreCompleto: "Ana López",
  dni: "30123456",
  domicilioCalle: "San Martín 123",
  ciudad: "Santiago del Estero",
  whatsapp: "385 4123456",
};

const VALORES_COMPLETOS: DatosCrearContrato = { comodatario: COMODATARIO, equipos: EQUIPOS };

describe("borradorLocal (scenario 12, part 1 — no signature data ever persisted)", () => {
  afterEach(() => {
    limpiarBorradorLocal();
    vi.useRealTimers();
  });

  it("never serializes imagenPng, trazos or presion — even for a full, both-halves-filled draft", () => {
    guardarBorradorLocal({ contratoId: null, paso: "equipos", valores: VALORES_COMPLETOS });

    const crudo = localStorage.getItem(CLAVE_BORRADOR);

    expect(crudo).not.toBeNull();
    expect(crudo).not.toContain("imagenPng");
    expect(crudo).not.toContain("trazos");
    expect(crudo).not.toContain("presion");
  });

  it("stores exactly the comodatario and equipos values under valores, nothing else", () => {
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });

    const registro = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? "null") as {
      valores: unknown;
    };

    expect(registro.valores).toEqual(VALORES_COMPLETOS);
  });

  it("round-trips through leerBorradorLocal within the 12h window", () => {
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });

    const leido = leerBorradorLocal();

    expect(leido).not.toBeNull();
    expect(leido?.contratoId).toBe("c1");
    expect(leido?.paso).toBe("equipos");
    expect(leido?.valores).toEqual(VALORES_COMPLETOS);
  });

  it("discards a draft older than 12 hours and clears the stored entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T08:00:00.000Z"));
    guardarBorradorLocal({ contratoId: null, paso: "comodatario", valores: VALORES_COMPLETOS });

    // 12 hours and 1 minute later — a visit does not span a day, so a
    // draft resurfacing after this long is worse than retyping (DESIGN.md
    // D8).
    vi.setSystemTime(new Date("2026-08-05T20:01:00.000Z"));

    expect(leerBorradorLocal()).toBeNull();
    expect(localStorage.getItem(CLAVE_BORRADOR)).toBeNull();
  });

  it("keeps a draft saved 11 hours and 59 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T08:00:00.000Z"));
    guardarBorradorLocal({ contratoId: null, paso: "comodatario", valores: VALORES_COMPLETOS });

    vi.setSystemTime(new Date("2026-08-05T19:59:00.000Z"));

    expect(leerBorradorLocal()).not.toBeNull();
  });

  it("discards silently on a version mismatch instead of returning malformed data", () => {
    localStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({
        version: 2,
        guardadoEn: Date.now(),
        contratoId: null,
        paso: "comodatario",
        valores: VALORES_COMPLETOS,
      }),
    );

    expect(leerBorradorLocal()).toBeNull();
    expect(localStorage.getItem(CLAVE_BORRADOR)).toBeNull();
  });

  it("strips any field not on EsquemaCrearContrato from valores on read, even if it was written directly", () => {
    // Simulates a future call site bypassing guardarBorradorLocal's type
    // and writing a widened payload straight to localStorage — the exact
    // failure mode the structural guarantee must survive.
    localStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({
        version: 1,
        guardadoEn: Date.now(),
        contratoId: null,
        paso: "equipos",
        valores: { ...VALORES_COMPLETOS, firmas: [{ imagenPng: "x", trazos: [] }] },
      }),
    );

    const leido = leerBorradorLocal();

    expect(leido).not.toBeNull();
    expect(leido).not.toHaveProperty("valores.firmas");
    expect(JSON.stringify(leido)).not.toContain("firmas");
  });

  it("limpiarBorradorLocal clears an existing draft", () => {
    guardarBorradorLocal({ contratoId: "c1", paso: "equipos", valores: VALORES_COMPLETOS });

    limpiarBorradorLocal();

    expect(localStorage.getItem(CLAVE_BORRADOR)).toBeNull();
    expect(leerBorradorLocal()).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(leerBorradorLocal()).toBeNull();
  });
});
