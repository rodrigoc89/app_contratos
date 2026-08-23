import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design.md D2/slice B — compiled-output guards 1, 2 and 16 (the
 * overflow-hidden / `[hidden]` / `sr-only` collision cluster). These scan
 * real `dist/` output, not `src/**\/*.css`, so Tailwind Preflight's own
 * `[hidden]` rule and any `.sr-only` usage — including one emitted by a
 * vendored component's internals — are visible. Runs in the `bundle` CI job
 * (D7), after `vite build`, via `pnpm test:compilado` — never as part of
 * `pnpm -r test`, where `dist/` does not exist on a clean checkout. Same
 * `*.integration.spec.ts` split `apps/api` already uses, for the same
 * reason (`vitest.config.ts`'s matching `exclude`,
 * `vitest.compilado.config.ts`).
 *
 * PR3 scaffolded this file with empty `describe` blocks. PR6 lands the real
 * assertions — `styling-guards`'s collision-cluster requirement — the first
 * PR to have a `dist/` worth scanning against a Preflight-carrying build.
 *
 * **`estilos/` is excluded from Tailwind's own candidate scan**
 * (`index.css`'s `@source not "./";`, added by this PR). Discovered while
 * writing this file: this directory's own English prose (this file's PR3
 * comment said "the overflow-hidden / `[hidden]` / `sr-only` collision
 * cluster", `panel.css` said "...using the sr-only recipe...") is lexically
 * *shaped* like real Tailwind utility class names, and Tailwind's candidate
 * scanner does not know the difference — it had compiled `.sr-only` and
 * `.overflow-hidden` into real `dist/` output before either was ever used
 * by a component. Confirmed live: before the exclusion, a clean `vite
 * build` shipped both; after, `rg -c "sr-only|overflow-hidden"` against the
 * compiled CSS finds nothing. `estilos/` holds no `.tsx`, so excluding it
 * from candidate detection cannot hide a real regression — only the prose
 * that talks about one.
 */

const DIRECTORIO_ESTILOS = dirname(fileURLToPath(import.meta.url));
const DIRECTORIO_DIST = join(DIRECTORIO_ESTILOS, "..", "..", "dist");

/** Every `.css` file under `directorio`, recursively — `dist/assets/*.css` carries a build hash in its name. */
function archivosCssCompilados(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
  let entradas: string[];
  try {
    entradas = readdirSync(directorio);
  } catch {
    return [];
  }

  return entradas.flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return archivosCssCompilados(ruta);
    }
    return nombre.endsWith(".css") ? [{ ruta, contenido: readFileSync(ruta, "utf8") }] : [];
  });
}

/**
 * Every `{selector, cuerpo}` pair in `css`, using the same brace-matching
 * `convencionesDeEstilos.spec.ts`'s `removalesSinReemplazo` already proved
 * reliable against real, nested stylesheets — including, here, Tailwind's
 * own `@layer`/`@supports`/`@media`-nested minified output: a non-brace
 * body run can only close against the *next* real rule's innermost `{...}`,
 * so a naive single-level regex still lands on each leaf declaration block.
 */
function reglasCss(css: string): ReadonlyArray<{ readonly selector: string; readonly cuerpo: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((coincidencia) => ({
    selector: (coincidencia[1] ?? "").trim(),
    cuerpo: coincidencia[2] ?? "",
  }));
}

export interface ReglaEncontrada {
  readonly selector: string;
  readonly declaracion: string;
}

/** Every rule in `css` whose body matches `patron`, as `{selector, declaracion}` pairs for naming in a failure message. */
function reglasQueDeclaran(css: string, patron: RegExp): ReglaEncontrada[] {
  const encontradas: ReglaEncontrada[] = [];
  for (const { selector, cuerpo } of reglasCss(css)) {
    const coincidencia = new RegExp(patron.source, "i").exec(cuerpo);
    if (coincidencia) {
      encontradas.push({ selector, declaracion: coincidencia[0] });
    }
  }
  return encontradas;
}

const PATRON_DISPLAY_IMPORTANTE = /display\s*:\s*[^;]+!important/;

/** Guard 2's compiled half — every rule declaring `display` as `!important`, wherever it came from (Preflight or project-authored). */
export function reglasImportantesDeDisplay(css: string): ReglaEncontrada[] {
  return reglasQueDeclaran(css, PATRON_DISPLAY_IMPORTANTE);
}

describe("guard 2: Preflight's [hidden] rule is the sole !important display rule in compiled output", () => {
  it("fails when a project-authored !important display rule ships alongside Preflight's own [hidden] rule, naming both", () => {
    const compiladoSimulado =
      "[hidden]:where(:not([hidden=until-found])){display:none!important}" +
      ".mi-regla-propia{display:flex!important}";

    const encontradas = reglasImportantesDeDisplay(compiladoSimulado);

    expect(encontradas).toHaveLength(2);
    expect(encontradas.map((regla) => regla.selector)).toEqual([
      "[hidden]:where(:not([hidden=until-found]))",
      ".mi-regla-propia",
    ]);
  });

  it("does not flag compiled output carrying only Preflight's own [hidden] rule", () => {
    const compiladoSimulado = "[hidden]:where(:not([hidden=until-found])){display:none!important}";
    expect(reglasImportantesDeDisplay(compiladoSimulado)).toHaveLength(1);
  });

  it("finds exactly one !important display rule in the real compiled dist/ output — Preflight's own [hidden] rule", () => {
    const hojas = archivosCssCompilados(DIRECTORIO_DIST);
    expect(hojas.length, "no compiled CSS found under dist/ — run `vite build` first").toBeGreaterThan(0);

    const todas = hojas.flatMap((hoja) => reglasImportantesDeDisplay(hoja.contenido));
    expect(
      todas.map((regla) => regla.selector),
      "more than one !important display rule survives in compiled output — a project-authored duplicate was not removed",
    ).toHaveLength(1);
  });
});

const PATRON_OVERFLOW_O_CLIP = /(?:overflow(?:-y|-x)?\s*:\s*(?:hidden|clip)\b|clip-path\s*:\s*[^;]+)/;

/**
 * Guards 1/16's compiled half — every rule in `css` declaring
 * `overflow:hidden|clip` or `clip-path`. Banned unconditionally, the same
 * "everywhere in the stylesheet, not scoped to one selector" philosophy the
 * source-level guard 1 already uses (`convencionesDeEstilos.spec.ts`'s own
 * header comment) — Tailwind's JIT only ever emits a utility a source file
 * *references* (`index.css`'s `@source not` fix removes the one false
 * positive found while building this: candidate text in a comment, not a
 * className), so anything landing here shipped because something asked for
 * it, project-authored or vendored.
 */
export function reglasDeOverflowOClip(css: string): ReglaEncontrada[] {
  return reglasQueDeclaran(css, PATRON_OVERFLOW_O_CLIP);
}

describe("guard 1/16: compiled output declares no overflow: hidden / overflow: clip / clip-path reachable by shipped markup", () => {
  it("fails when a vendored .sr-only-shaped rule ships in compiled output, naming its overflow/clip-path declaration", () => {
    const compiladoSimulado =
      ".sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;overflow:hidden;width:1px;height:1px}";

    const encontradas = reglasDeOverflowOClip(compiladoSimulado);

    expect(encontradas.length).toBeGreaterThanOrEqual(1);
    expect(encontradas.some((regla) => regla.selector === ".sr-only")).toBe(true);
    expect(encontradas.map((regla) => regla.declaracion).join(" ")).toMatch(/clip-path/);
  });

  it("does not flag the narrow-layout thead displacement recipe (left: -10000px, no clipping)", () => {
    const compiladoSimulado =
      ".tabla-de-contratos thead{position:absolute;left:-10000px;width:1px;height:1px;padding:0;margin:-1px;border:0;white-space:nowrap}";

    expect(reglasDeOverflowOClip(compiladoSimulado)).toEqual([]);
  });

  it("finds no overflow:hidden|clip or clip-path rule in the real compiled dist/ output", () => {
    const hojas = archivosCssCompilados(DIRECTORIO_DIST);
    expect(hojas.length, "no compiled CSS found under dist/ — run `vite build` first").toBeGreaterThan(0);

    const todas = hojas.flatMap((hoja) => reglasDeOverflowOClip(hoja.contenido));
    expect(
      todas.map((regla) => `${regla.selector} { ${regla.declaracion} }`),
      "compiled output ships an overflow:hidden/clip or clip-path rule — the 492px regression's shape",
    ).toEqual([]);
  });
});
