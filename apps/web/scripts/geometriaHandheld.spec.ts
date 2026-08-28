import { describe, expect, it } from "vitest";

import {
  ALTURA_MAXIMA_CABECERA_PX,
  ANCHOS_HANDHELD,
  ESTADOS_ESPERADOS,
  PISO_DE_CONTROLES_POR_ESTADO,
  PISO_DE_TOQUE_PX,
  controlTapadoPorOtroElemento,
  crearBufferAcotado,
  direccionInformada,
  erroresDeCobertura,
  erroresDePrecondicion,
  esControlBajoElPiso,
  esperarPreview,
  excedeAlturaDeCabecera,
  hayDesbordeHorizontal,
  type DiagnosticoDePreview,
  type MedicionDeEstado,
  type ResultadoDePreview,
  type SondaDePreview,
} from "./geometriaHandheld";

/**
 * design.md D8 — third of the three "passes by doing nothing" mechanisms:
 * a short run silently re-measures an earlier state instead of returning
 * nothing. Task 5.1 requires proving the state-count assertion ALONE
 * cannot catch a stub that fabricates the full count, before the companion
 * per-state control-count floor closes that gap — documenting the limit
 * rather than hiding it.
 */
describe("naive-stub falsification (task 5.1)", () => {
  /** The exact stub task 5.1 names: always reports "5 states reached" regardless of what ran. */
  function stubIngenuoDeConteo(): { readonly estadosAlcanzados: number } {
    return { estadosAlcanzados: ESTADOS_ESPERADOS };
  }

  it("the naive stub's fabricated count equals the committed constant — a count-only check would see this and pass", () => {
    // This IS the false pass: the stub always reports the committed
    // constant, so a count-only check's only signal never fires.
    expect(stubIngenuoDeConteo().estadosAlcanzados).toBe(ESTADOS_ESPERADOS);
  });

  it("the companion per-state control-count floor catches that same stub once it reports per-state detail", () => {
    // The fabrication that would let the stub above pass the count check
    // is exactly this: 5 states, 0 controls each.
    const mediciones: MedicionDeEstado[] = Array.from({ length: ESTADOS_ESPERADOS }, (_, i) => ({
      id: `S${i}`,
      controlesMedidos: 0,
    }));

    const errores = erroresDeCobertura(mediciones);

    // The count still matches (5 === 5) — that half stays silent, exactly
    // as proved above. The floor is what fails it here, once per state.
    expect(errores).toHaveLength(ESTADOS_ESPERADOS);
    expect(errores.every((error) => error.includes("0 control"))).toBe(true);
  });
});

describe("erroresDeCobertura", () => {
  const suficiente = (id: string): MedicionDeEstado => ({ id, controlesMedidos: PISO_DE_CONTROLES_POR_ESTADO });

  it("fails closed on a short run, naming the shortfall", () => {
    const errores = erroresDeCobertura([suficiente("S1"), suficiente("S2")]);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("reached 2");
    expect(errores[0]).toContain(`expected exactly ${ESTADOS_ESPERADOS}`);
  });

  it("fails closed on a zero-measurement run, naming the shortfall rather than passing silently", () => {
    const errores = erroresDeCobertura([]);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("reached 0");
  });

  it("fails a single state under the per-state floor, independent of the overall count", () => {
    const mediciones = Array.from({ length: ESTADOS_ESPERADOS }, (_, i) =>
      i === 2 ? { id: "S4", controlesMedidos: 0 } : suficiente(`S${i}`),
    );

    const errores = erroresDeCobertura(mediciones);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("S4");
    expect(errores[0]).toContain("0 control");
  });

  it("passes silently once every state is reached and clears the control floor", () => {
    const mediciones = Array.from({ length: ESTADOS_ESPERADOS }, (_, i) => suficiente(`S${i}`));

    expect(erroresDeCobertura(mediciones)).toEqual([]);
  });
});

describe("erroresDePrecondicion", () => {
  /** design.md D1 (task 1.4) — deliberate fallout: `previewAlcanzable: boolean` no longer exists on `PreflightHandheld`. */
  const alcanceExitoso: ResultadoDePreview = {
    exito: true,
    direccion: "http://127.0.0.1:4174/",
    intentos: 3,
    transcurridoMs: 750,
  };
  const alcanceFallido: ResultadoDePreview = {
    exito: false,
    diagnostico: {
      intentos: 40,
      transcurridoMs: 10_000,
      finDelProceso: "still running",
      ultimoErrorDeSondeo: "ECONNREFUSED",
      salidaCapturada: "",
    },
  };

  it("fails closed when dist/ is missing or empty, naming the precondition", () => {
    const errores = erroresDePrecondicion({ distDisponible: false, alcanceDelPreview: alcanceExitoso });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("dist/");
  });

  it("fails closed when the preview server never becomes reachable, naming the precondition", () => {
    const errores = erroresDePrecondicion({ distDisponible: true, alcanceDelPreview: alcanceFallido });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("preview server");
  });

  it("reports both preconditions at once when both are broken", () => {
    expect(erroresDePrecondicion({ distDisponible: false, alcanceDelPreview: alcanceFallido })).toHaveLength(2);
  });

  it("passes preconditions once dist/ exists and the preview server answers", () => {
    expect(erroresDePrecondicion({ distDisponible: true, alcanceDelPreview: alcanceExitoso })).toEqual([]);
  });
});

/** design.md D1 (task 1.1/1.2) — the rewritten `erroresDePrecondicion` over `ResultadoDePreview`. */
describe("erroresDePrecondicion (D1 diagnostic evidence)", () => {
  const diagnosticoFallido: DiagnosticoDePreview = {
    intentos: 40,
    transcurridoMs: 10_234,
    finDelProceso: "still running",
    ultimoErrorDeSondeo: "ECONNREFUSED 127.0.0.1:4174",
    salidaCapturada: "vite v5.4.0 building for production...",
  };

  it("renders attempts, elapsed time, process end state, last probe error and captured output on a failed wait (task 1.1, R2a, R3b)", () => {
    const errores = erroresDePrecondicion({
      distDisponible: true,
      alcanceDelPreview: { exito: false, diagnostico: diagnosticoFallido },
    });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("40");
    expect(errores[0]).toContain("10234");
    expect(errores[0]).toContain("still running");
    expect(errores[0]).toContain("ECONNREFUSED 127.0.0.1:4174");
    expect(errores[0]).toContain("vite v5.4.0 building for production...");
  });

  it("yields no errors on a successful wait, and exactly two when dist/ is also missing (task 1.2, R3a, R3b)", () => {
    const exito = erroresDePrecondicion({
      distDisponible: true,
      alcanceDelPreview: { exito: true, direccion: "http://127.0.0.1:4174/", intentos: 3, transcurridoMs: 750 },
    });
    expect(exito).toEqual([]);

    const fallo = erroresDePrecondicion({
      distDisponible: false,
      alcanceDelPreview: { exito: false, diagnostico: diagnosticoFallido },
    });
    expect(fallo).toHaveLength(2);
  });
});

/** design.md D2 (task 2.1) — keep-first-bytes eviction, always drained, never merely capped. */
describe("crearBufferAcotado", () => {
  it("keeps the first bytes and appends the exact dropped-byte count once the limit is exceeded", () => {
    const buffer = crearBufferAcotado(10);
    buffer.agregar("0123456789");
    buffer.agregar("extra");

    expect(buffer.texto()).toBe("0123456789… (5 more bytes dropped)");
  });

  it("returns the plain captured text with no marker when nothing was dropped", () => {
    const buffer = crearBufferAcotado(20);
    buffer.agregar("hello ");
    buffer.agregar("world");

    expect(buffer.texto()).toBe("hello world");
  });
});

/** design.md D3 (task 3.1) — pure address parser, ANSI-stripped, never invents an address. */
describe("direccionInformada", () => {
  it("returns the ANSI-stripped Local: line when vite has printed its startup banner (R2b)", () => {
    const salida =
      "\n  vite v5.4.11 building for production...\n" +
      "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:4174/\x1b[39m\n" +
      "  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m: use --host to expose\n";

    expect(direccionInformada(salida)).toBe("➜  Local:   http://127.0.0.1:4174/");
  });

  it("reports honestly that no address was available when vite has not printed its banner yet (R2c)", () => {
    const salida = "\n  vite v5.4.11 building for production...\n";

    expect(direccionInformada(salida)).toBe("(vite printed no address before the first successful probe)");
  });
});

/** Fake-clock helper — `dormir` advances `ahora()` deterministically, no real timers. */
function crearRelojFake(): { readonly ahora: () => number; readonly dormir: (ms: number) => Promise<void> } {
  let tiempo = 0;
  return {
    ahora: () => tiempo,
    dormir: async (ms: number) => {
      tiempo += ms;
    },
  };
}

const BANNER_LOCAL = "\x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:4174/\x1b[39m\n";

/** design.md D3 (tasks 3.3-3.5) — the rewritten reachability wait over `SondaDePreview`. */
describe("esperarPreview", () => {
  it("returns exito with the reported address, attempt count and elapsed time once the probe succeeds (task 3.3, R2b)", async () => {
    const reloj = crearRelojFake();
    let llamadas = 0;
    const sonda: SondaDePreview = {
      sondear: async () => {
        llamadas += 1;
        if (llamadas < 3) {
          throw new Error("ECONNREFUSED");
        }
        return 200;
      },
      dormir: reloj.dormir,
      ahora: reloj.ahora,
      estadoDelProceso: () => null,
      salida: () => BANNER_LOCAL,
    };

    const resultado = await esperarPreview("http://127.0.0.1:4174", sonda);

    expect(resultado).toEqual({
      exito: true,
      direccion: "➜  Local:   http://127.0.0.1:4174/",
      intentos: 3,
      transcurridoMs: 500,
    });
  });

  it("polls briefly for the Local: banner when it has not been printed yet at the first successful probe (D3b)", async () => {
    const reloj = crearRelojFake();
    let bannerImpreso = false;
    const sonda: SondaDePreview = {
      sondear: async () => 200,
      dormir: async (ms: number) => {
        bannerImpreso = true;
        await reloj.dormir(ms);
      },
      ahora: reloj.ahora,
      estadoDelProceso: () => null,
      salida: () => (bannerImpreso ? BANNER_LOCAL : ""),
    };

    const resultado = await esperarPreview("http://127.0.0.1:4174", sonda);

    expect(resultado).toEqual({
      exito: true,
      direccion: "➜  Local:   http://127.0.0.1:4174/",
      intentos: 1,
      transcurridoMs: 250,
    });
  });

  it("exhausts all 40 attempts and reports the fake-clock elapsed time when the probe always fails and the child stays alive (task 3.4, R3b)", async () => {
    const reloj = crearRelojFake();
    let llamadas = 0;
    const sonda: SondaDePreview = {
      sondear: async () => {
        llamadas += 1;
        throw new Error("ECONNREFUSED");
      },
      dormir: reloj.dormir,
      ahora: reloj.ahora,
      estadoDelProceso: () => null,
      salida: () => "",
    };

    const resultado = await esperarPreview("http://127.0.0.1:4174", sonda);

    expect(llamadas).toBe(40);
    expect(resultado.exito).toBe(false);
    if (!resultado.exito) {
      expect(resultado.diagnostico.intentos).toBe(40);
      expect(resultado.diagnostico.transcurridoMs).toBe(40 * 250);
      expect(resultado.diagnostico.ultimoErrorDeSondeo).toBe("ECONNREFUSED");
      expect(resultado.diagnostico.finDelProceso).toBe("still running");
    }
  });

  it("ends the wait immediately once the child process reports a terminal state, without exhausting the remaining polling budget (task 3.5, R1)", async () => {
    const reloj = crearRelojFake();
    let llamadas = 0;
    const sonda: SondaDePreview = {
      sondear: async () => {
        llamadas += 1;
        throw new Error("ECONNREFUSED");
      },
      dormir: reloj.dormir,
      ahora: reloj.ahora,
      estadoDelProceso: () => (llamadas >= 1 ? "exit 1" : null),
      salida: () => "",
    };

    const resultado = await esperarPreview("http://127.0.0.1:4174", sonda);

    expect(resultado.exito).toBe(false);
    if (!resultado.exito) {
      expect(resultado.diagnostico.intentos).toBeLessThan(40);
      expect(resultado.diagnostico.finDelProceso).toBe("exit 1");
    }
  });
});

describe("geometry assertions", () => {
  it("flags a scrollWidth wider than clientWidth as overflow, and an exact match as none", () => {
    expect(hayDesbordeHorizontal(400, 360)).toBe(true);
    expect(hayDesbordeHorizontal(360, 360)).toBe(false);
  });

  it("flags a control under the touch floor on either axis, and clears it at exactly the floor ('>=', not '>')", () => {
    expect(esControlBajoElPiso(47, 48)).toBe(true);
    expect(esControlBajoElPiso(48, 47)).toBe(true);
    expect(esControlBajoElPiso(PISO_DE_TOQUE_PX, PISO_DE_TOQUE_PX)).toBe(false);
  });

  it("flags the measured two-row regression and passes a height within the committed budget", () => {
    // design.md D8 — 104px is the actual regression witness this rejects.
    expect(excedeAlturaDeCabecera(104)).toBe(true);
    expect(excedeAlturaDeCabecera(ALTURA_MAXIMA_CABECERA_PX)).toBe(false);
  });
});

describe("committed constants", () => {
  it("names the three handheld widths design.md D8 requires", () => {
    expect(ANCHOS_HANDHELD).toEqual([360, 390, 430]);
  });

  it("commits the slice-F states-reached constant at 6 (task 13.5) — S3 added, LienzoDeFirma/VisorDeDocumento now converted", () => {
    expect(ESTADOS_ESPERADOS).toBe(6);
  });
});

/**
 * Guard 19's runtime half (task 13.1/13.4/13.5) — real Chrome only, jsdom's
 * `elementFromPoint` is unimplemented. `medirCoberturaDeControles` (CLI-only,
 * exercised by `pnpm handheld` at S3) hands this pure predicate the plain
 * boolean facts — never the `Element` itself, which cannot cross
 * `page.evaluate()`'s serialization boundary.
 */
describe("controlTapadoPorOtroElemento", () => {
  it("flags a control as covered when the resolved element is neither the control nor a descendant of it", () => {
    expect(controlTapadoPorOtroElemento({ esElControl: false, esDescendienteDelControl: false })).toBe(true);
  });

  it("clears a control when the resolved element IS the control itself", () => {
    expect(controlTapadoPorOtroElemento({ esElControl: true, esDescendienteDelControl: false })).toBe(false);
  });

  it("clears a control when the resolved element is a descendant of the control (e.g. its own label text node)", () => {
    expect(controlTapadoPorOtroElemento({ esElControl: false, esDescendienteDelControl: true })).toBe(false);
  });
});
