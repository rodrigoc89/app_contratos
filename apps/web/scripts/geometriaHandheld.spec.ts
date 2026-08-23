import { describe, expect, it } from "vitest";

import {
  ALTURA_MAXIMA_CABECERA_PX,
  ANCHOS_HANDHELD,
  ESTADOS_ESPERADOS,
  PISO_DE_CONTROLES_POR_ESTADO,
  PISO_DE_TOQUE_PX,
  erroresDeCobertura,
  erroresDePrecondicion,
  esControlBajoElPiso,
  excedeAlturaDeCabecera,
  hayDesbordeHorizontal,
  type MedicionDeEstado,
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
  it("fails closed when dist/ is missing or empty, naming the precondition", () => {
    const errores = erroresDePrecondicion({ distDisponible: false, previewAlcanzable: true });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("dist/");
  });

  it("fails closed when the preview server never becomes reachable, naming the precondition", () => {
    const errores = erroresDePrecondicion({ distDisponible: true, previewAlcanzable: false });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("preview server");
  });

  it("reports both preconditions at once when both are broken", () => {
    expect(erroresDePrecondicion({ distDisponible: false, previewAlcanzable: false })).toHaveLength(2);
  });

  it("passes preconditions once dist/ exists and the preview server answers", () => {
    expect(erroresDePrecondicion({ distDisponible: true, previewAlcanzable: true })).toEqual([]);
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

  it("commits the pre-slice-F states-reached constant at 5 (task 5.6) — PR13 bumps this to 6", () => {
    expect(ESTADOS_ESPERADOS).toBe(5);
  });
});
