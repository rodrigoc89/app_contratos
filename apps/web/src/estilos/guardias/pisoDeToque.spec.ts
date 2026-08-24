import { describe, expect, it } from "vitest";

import {
  cumplePisoHorizontal,
  cumplePisoVertical,
  ELEMENTOS_INTERACTIVOS,
  esControlInteractivo,
  esControlNativoDeToque,
  esExento,
  esInlineSinCaja,
  exencionesSinCorrespondencia,
  type ExencionDeToque,
} from "./pisoDeToque";

/**
 * design.md D5 — fixture-only proof of the touch-floor engine, exercised
 * before guard 20's real scan (`convencionesDeUtilidades.spec.ts`) imports
 * it. Mirrors `convencionesDeEstilos.spec.ts`'s touch-floor describe block
 * one heuristic at a time.
 */

describe("esControlInteractivo classifies the same way the CSS engine did (D5)", () => {
  it.each([...ELEMENTOS_INTERACTIVOS])("flags the interactive tag <%s>", (tag) => {
    expect(esControlInteractivo({ tag, clases: "" })).toBe(true);
  });

  it("does not flag a plain <div>, nor <label> (it forwards its click to the control it names)", () => {
    expect(esControlInteractivo({ tag: "div", clases: "flex" })).toBe(false);
    expect(esControlInteractivo({ tag: "label", clases: "" })).toBe(false);
  });

  it.each<[string, string, string[]]>([
    ["an onClick handler", "", ["onClick"]],
    ["an onChange handler", "", ["onChange"]],
    ["a cursor-pointer token", "cursor-pointer", []],
    ["a hover: variant", "hover:bg-primario", []],
    ["a focus-visible: variant", "focus-visible:ring-2", []],
    ["a disabled: variant", "disabled:opacity-55", []],
  ])("flags %s", (_motivo, clases, props) => {
    expect(esControlInteractivo({ tag: "div", clases, props })).toBe(true);
  });
});

describe("cumplePisoVertical/Horizontal port declaraAlMenosElPiso + the inline veto (D5)", () => {
  it.each<[string, "v" | "h", boolean]>([
    ["size-toque", "v", true],
    ["min-h-toque", "v", true],
    ["h-12", "v", true],
    ["h-8", "v", false],
    ["inline min-h-toque", "v", false], // the real 24px office-link defect
    ["inline-flex min-h-toque", "v", true],
    ["w-full", "h", true],
    ["min-w-full", "h", true],
    ["flex", "h", true],
    ["block", "h", true],
    ["w-12", "h", true],
    ["w-8", "h", false],
  ])("cumplePiso('%s', %s) === %s", (clases, eje, esperado) => {
    expect(eje === "v" ? cumplePisoVertical(clases) : cumplePisoHorizontal(clases)).toBe(esperado);
  });
});

/**
 * PR17 (task 17.1c/17.2, D5) — `base.css`'s `@layer base` rule sizes native
 * `input[type=radio]`/`input[type=checkbox]` to `--spacing-toque` without
 * any class (`FormularioEquipos.tsx:87,97`). D5's table records this as
 * "resolved against that rule, not reported as violations" — a structural
 * exemption for the tag+type pair, never a per-component `EXENCIONES` entry,
 * since the same native-control shape would hit the identical gap anywhere
 * else in the tree.
 */
describe("esControlNativoDeToque — native radio/checkbox sized by base.css's @layer base rule (D5)", () => {
  it("recognises an unclassed native radio/checkbox as resolved against the base rule", () => {
    expect(esControlNativoDeToque("input", "radio", "")).toBe(true);
    expect(esControlNativoDeToque("input", "checkbox", "")).toBe(true);
  });

  it("does not exempt a text/date input, nor a non-input tag", () => {
    expect(esControlNativoDeToque("input", "text", "")).toBe(false);
    expect(esControlNativoDeToque("input", "date", "")).toBe(false);
    expect(esControlNativoDeToque("button", "radio", "")).toBe(false);
  });

  it("defers to the ordinary class-based check once a radio/checkbox attempts its own sizing class", () => {
    expect(esControlNativoDeToque("input", "radio", "h-8")).toBe(false);
  });
});

describe("esInlineSinCaja — the inline veto in isolation", () => {
  it.each<[string, boolean]>([
    ["inline px-2", true],
    ["inline inline-flex", false],
    ["flex", false],
  ])("esInlineSinCaja('%s') === %s", (clases, esperado) => {
    expect(esInlineSinCaja(clases)).toBe(esperado);
  });
});

describe("EXENCIONES mechanism — proven on fixtures before the real (empty) export is scanned (D5)", () => {
  const FILA: ExencionDeToque = {
    componente: "TablaDeContratos",
    elemento: "tbody tr",
    porque: "fixture standing in for the real R-3.5/R-3.8 row exemption, ported once TablaDeContratos converts (PR15)",
  };
  const FIXTURES: readonly ExencionDeToque[] = [FILA];

  it("esExento matches a recorded component+element pair, not a different element or component", () => {
    expect(esExento("TablaDeContratos", "tbody tr", FIXTURES)).toBe(true);
    expect(esExento("TablaDeContratos", "thead tr", FIXTURES)).toBe(false);
    expect(esExento("Paginador", "tbody tr", FIXTURES)).toBe(false);
  });

  it("keeps every exemption earning its place — flags one absent from the given corpus, clears one present in it", () => {
    const ausente = exencionesSinCorrespondencia(FIXTURES, [{ componente: "Paginador", elemento: "boton--pagina-actual" }]);
    expect(ausente).toEqual([FILA]);
    expect(exencionesSinCorrespondencia(FIXTURES, [FILA])).toEqual([]);
  });
});

/**
 * The port must AGREE with its predecessor, not merely pass its own tests:
 * both engines' floor logic runs against matched fixture pairs. `cssCumplePiso*`
 * is ported verbatim from `convencionesDeEstilos.spec.ts:1633-1665` (a
 * `describe()` closure in a legacy file frozen for deletion, PR16) — the
 * precedent guards 9-11's `matiz`/`saturacion` already set.
 */
function cssDeclaraAlMenosElPiso(cuerpo: string, propiedades: readonly string[]): boolean {
  const patron = new RegExp(`(?:^|[;\\s])(?:${propiedades.join("|")})\\s*:\\s*([^;}]+)`, "g");
  return [...cuerpo.matchAll(patron)].some((coincidencia) => {
    const valor = (coincidencia[1] ?? "").trim();
    if (/^var\(\s*--tamano-toque-minimo\s*\)/.test(valor)) return true;
    const literal = /^(\d+(?:\.\d+)?)px$/.exec(valor);
    return literal !== null && Number(literal[1]) >= 48;
  });
}

function cssCumplePisoVertical(cuerpo: string): boolean {
  if (/display\s*:\s*inline\s*(?:;|$)/.test(cuerpo)) return false;
  return cssDeclaraAlMenosElPiso(cuerpo, ["min-height", "height"]);
}

function cssCumplePisoHorizontal(cuerpo: string): boolean {
  return (
    cssDeclaraAlMenosElPiso(cuerpo, ["min-width", "width"]) ||
    /(?:^|[;\s])(?:min-width|width)\s*:\s*100%/.test(cuerpo) ||
    /display\s*:\s*(?:flex|grid|block|table)\b/.test(cuerpo)
  );
}

describe("pisoDeToque agrees with its CSS predecessor on shared fixtures (D5)", () => {
  it.each<[string, "v" | "h", string, string, boolean]>([
    ["a literal 48px floor", "v", "min-height: 48px;", "h-12", true],
    ["the shared touch token", "v", "min-height: var(--tamano-toque-minimo);", "min-h-toque", true],
    ["under the floor", "v", "min-height: 32px;", "h-8", false],
    ["the inert-inline defect behind both real 24px office links", "v", "display: inline; min-height: 48px;", "inline h-12", false],
    ["an inline box with a display companion", "v", "display: inline-flex; min-height: 48px;", "inline-flex h-12", true],
    ["a full-width declaration", "h", "width: 100%;", "w-full", true],
    ["a block-level display", "h", "display: flex;", "flex", true],
    ["under the floor with no full/block companion", "h", "width: 32px;", "w-8", false],
  ])("classifies %s the same way", (_motivo, eje, css, jsx, esperado) => {
    const [cssFn, jsxFn] = eje === "v" ? [cssCumplePisoVertical, cumplePisoVertical] : [cssCumplePisoHorizontal, cumplePisoHorizontal];
    expect(cssFn(css)).toBe(esperado);
    expect(jsxFn(jsx)).toBe(esperado);
  });
});
