import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * PR24a/24b — source-scanning guards over `src/**\/*.css`, same shape as
 * `convencionDeAlmacenamiento.spec.ts` and `componentes/convencionDeCapas.spec.ts`.
 * jsdom performs no layout, and Vitest does not load real stylesheets into a
 * document during a test run, so none of the invariants below can be
 * asserted by rendering — each is a text-level check of the actual shipped
 * CSS instead.
 *
 * 1. No `overflow: hidden` / `overflow: clip` anywhere. The document-viewer
 *    surface (`VisorDeDocumento`'s iframe) is the one thing
 *    `funcionalidades/revision/logica/puertaDeLectura.ts` measures, and that
 *    state machine treats "scrolled to the end" and "fits without scrolling
 *    — confirmation pending" as different legal evidence. Clipped overflow
 *    on that surface, or on an ancestor, makes scrolling impossible or
 *    unmeasurable and silently collapses the distinction. Banned everywhere
 *    in the stylesheet rather than scoped to one selector, so the guard
 *    protects the surface before it is styled and after.
 * 2. `[hidden] { display: none !important; }` (`base.css`) always exists.
 *    `EscanerDeMac.tsx` hides its camera `<video>` with the `hidden`
 *    attribute while the camera is closed; a later bare `display:` rule that
 *    happens to match it would silently turn the preview back on.
 *    `!important` is the actual mitigation, so a second `!important` on
 *    `display` anywhere else could still tie or outrank it by source order —
 *    that is banned too.
 * 3. `.boton` — the shared button atom every organism renders through
 *    (`Boton.tsx`) — and the shared `--tamano-toque-minimo` token both stay
 *    at or above 48px. A técnico taps standing up, sometimes with a gloved
 *    thumb; a mis-tap in front of a customer is the cost of shrinking this.
 * 4. (PR24b) `.visor-documento__iframe` — the document-viewer surface itself
 *    — stays bounded to a FRACTION of the viewport, never to its content.
 *    Guard 1 above stops the surface from being clipped; it does nothing to
 *    stop the *other* failure the same legal distinction is exposed to: an
 *    iframe sized generously enough (or sized to content, or left
 *    unbounded) makes a real two-page comodato fit without scrolling, which
 *    silently routes every signing onto the "confirmation pending" branch
 *    instead of "scrolled to the end". So this rule must declare a `height`
 *    (or `max-height`) as an explicit `vh` fraction, must not declare
 *    `height: auto`, and must not declare any `min-height` at all — an
 *    unbounded `min-height` would let content stretch the frame exactly
 *    like `auto` does.
 */

const DIRECTORIO_ESTILOS = dirname(fileURLToPath(import.meta.url));
const DIRECTORIO_SRC = join(DIRECTORIO_ESTILOS, "..");

const PATRON_OVERFLOW_CLIP = /overflow(?:-y|-x)?\s*:\s*(hidden|clip)\b/i;
const REGLA_HIDDEN_PROTEGIDA = /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/;
const PATRON_DISPLAY_IMPORTANT = /display\s*:\s*[^;]+!important/gi;
const PATRON_TAMANO_MINIMO = /--tamano-toque-minimo\s*:\s*(\d+)px/;
const PATRON_ALTURA_ACOTADA_VH = /(?:^|\s)(?:height|max-height)\s*:\s*\d+(?:\.\d+)?vh\b/i;

function archivosCss(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return archivosCss(ruta);
    }
    return nombre.endsWith(".css") ? [{ ruta, contenido: readFileSync(ruta, "utf8") }] : [];
  });
}

function archivo(rutaSufijo: string): { ruta: string; contenido: string } | undefined {
  return archivosCss(DIRECTORIO_SRC).find((candidato) => candidato.ruta.endsWith(rutaSufijo));
}

// `.exec()` on a non-global pattern returns only the FIRST match. Several
// selectors below (`.tabla-de-contratos tr`/`td`) are declared more than
// once across the narrow-layout, base and >=640px table rules, so a
// single-match check silently ignores every later declaration — this is
// the guard-remediation fix for PR2 verify report finding W-1.
function todasLasCoincidencias(contenido: string, selector: string): ReadonlyArray<string> {
  const patron = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g");
  return [...contenido.matchAll(patron)].map((coincidencia) => coincidencia[1] ?? "");
}

const PATRON_OUTLINE_REMOVIDO = /outline\s*:\s*(?:none|0)\b/gi;

/** A declared outline that is a real indicator rather than another removal. */
const PATRON_OUTLINE_DECLARADO = /outline\s*:\s*([^;}]+)/gi;

/**
 * Whether an `outline: none` is accompanied by something a keyboard user can
 * still see: either the rule scopes the removal away from keyboard focus
 * (`:not(:focus-visible)`), or the same rule declares a real outline after it.
 *
 * Split out of the scan that uses it because that scan matches nothing in the
 * current stylesheets. A rule expressed only as a loop over real CSS asserts
 * nothing until someone violates it, which is exactly when you want it to
 * already be right — so the judgement is proven here instead of assumed.
 *
 * Values are captured and then tested, never decided by a lookahead: a
 * negative lookahead sitting behind a variable-width `\s*` is defeated by
 * backtracking, which is how the previous version of this rule came to treat
 * `outline: none` as its own replacement.
 */
function tieneReemplazoDeFoco(selector: string, cuerpo: string): boolean {
  if (/:not\(\s*:focus-visible\s*\)/.test(selector)) {
    return true;
  }

  return [...cuerpo.matchAll(PATRON_OUTLINE_DECLARADO)].some(
    (coincidencia) => !/^(?:none|0)\b/.test((coincidencia[1] ?? "").trim()),
  );
}

/**
 * Every `outline: none`/`outline: 0` in a stylesheet that has no visible
 * replacement, as `{selector, cuerpo}` pairs.
 *
 * Extracted from the scan that used to walk the stylesheets inline, for the
 * reason its own comment gave and then did not act on: no CSS under `src/`
 * declares a bare outline removal today, so that loop ran **zero iterations**
 * and its `expect` never executed. The judgement it delegates to was proven
 * directly; the slicing that FEEDS the judgement never was, and a scan that
 * hands the judge the wrong rule body fails silently in the direction that
 * matters — it reports no violations.
 *
 * Two bugs the extraction made visible and testable:
 *
 * 1. `indexOf("}", indice)` took the first brace after the match, which for
 *    a removal inside a nested block is the INNER rule's brace — fine — but
 *    combined with `lastIndexOf("}", inicioLlave)` for the selector it could
 *    hand the judge a selector containing a whole `@media` prelude.
 * 2. The replacement was only ever looked for inside the SAME rule. The
 *    standard, correct pattern puts it in a sibling — `.x { outline: none }`
 *    with `.x:focus-visible { outline: 3px solid … }` — which this would
 *    have reported as a violation while a genuinely bare removal in a file
 *    with any other focus rule anywhere could slip through.
 *
 * So the replacement is now looked for where CSS actually allows it: in the
 * same rule, or in a rule whose selector targets the same base with a focus
 * state.
 */
export function removalesSinReemplazo(
  contenido: string,
): ReadonlyArray<{ readonly selector: string; readonly cuerpo: string }> {
  const reglas = [...contenido.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((coincidencia) => ({
    selector: (coincidencia[1] ?? "").trim(),
    cuerpo: coincidencia[2] ?? "",
  }));

  return reglas.filter((regla) => {
    if (!new RegExp(PATRON_OUTLINE_REMOVIDO.source, "i").test(regla.cuerpo)) {
      return false;
    }
    if (tieneReemplazoDeFoco(regla.selector, regla.cuerpo)) {
      return false;
    }
    // A sibling rule may carry the replacement — `.x { outline: none }` next
    // to `.x:focus-visible { outline: … }` is the correct pattern, not a
    // violation.
    const base = regla.selector.replace(/:[a-z-]+(\([^)]*\))?/gi, "").trim();
    return !reglas.some(
      (otra) =>
        otra !== regla &&
        base !== "" &&
        otra.selector.replace(/:[a-z-]+(\([^)]*\))?/gi, "").trim() === base &&
        /:focus(-visible)?/i.test(otra.selector) &&
        tieneReemplazoDeFoco(otra.selector, otra.cuerpo),
    );
  });
}

describe("stylesheets never clip a scrollable surface", () => {
  it("finds the shipped CSS files, so a passing suite is not an empty one", () => {
    expect(archivosCss(DIRECTORIO_SRC).length).toBeGreaterThan(0);
  });

  it("declares no overflow: hidden / overflow: clip anywhere", () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        PATRON_OVERFLOW_CLIP.test(contenido),
        `${rutaRelativa} declares overflow: hidden/clip — this can make the document-viewer's reading gate unmeasurable (DESIGN.md D2)`,
      ).toBe(false);
    }
  });
});

describe("[hidden] elements can never be forced visible", () => {
  it("keeps the !important display:none protection rule in estilos/base.css", () => {
    const base = archivo("estilos/base.css");
    expect(base, "estilos/base.css is missing").toBeDefined();
    expect(
      REGLA_HIDDEN_PROTEGIDA.test(base?.contenido ?? ""),
      "estilos/base.css must declare `[hidden] { display: none !important; }`",
    ).toBe(true);
  });

  it("has exactly one !important display declaration — the [hidden] protection itself", () => {
    const total = archivosCss(DIRECTORIO_SRC).reduce(
      (acumulado, { contenido }) => acumulado + [...contenido.matchAll(PATRON_DISPLAY_IMPORTANT)].length,
      0,
    );
    expect(
      total,
      "a second !important display declaration can tie or outrank the [hidden] protection by source order",
    ).toBe(1);
  });
});

describe("primary actions meet the 48px touch-target minimum", () => {
  it("gives .boton a minimum touch target of at least 48px in both dimensions", () => {
    const atomos = archivo("estilos/atomos.css");
    expect(atomos, "estilos/atomos.css is missing").toBeDefined();

    const reglaBoton = /\.boton\s*\{([^}]*)\}/.exec(atomos?.contenido ?? "");
    expect(reglaBoton, ".boton rule not found in estilos/atomos.css").not.toBeNull();
    const cuerpo = reglaBoton?.[1] ?? "";

    for (const propiedad of ["min-height", "min-width"]) {
      const declaracion = new RegExp(
        `${propiedad}\\s*:\\s*(?:var\\(--tamano-toque-minimo\\)|(\\d+)px)`,
      ).exec(cuerpo);
      expect(declaracion, `.boton has no ${propiedad}`).not.toBeNull();
      const valorLiteral = declaracion?.[1];
      if (valorLiteral !== undefined) {
        expect(Number(valorLiteral)).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it("keeps --tamano-toque-minimo at least 48px in estilos/tokens.css", () => {
    const tokens = archivo("estilos/tokens.css");
    expect(tokens, "estilos/tokens.css is missing").toBeDefined();

    const valor = PATRON_TAMANO_MINIMO.exec(tokens?.contenido ?? "");
    expect(valor, "--tamano-toque-minimo is not declared").not.toBeNull();
    expect(Number(valor?.[1])).toBeGreaterThanOrEqual(48);
  });
});

describe("destructive signature actions stay separated from the commit action (PR25)", () => {
  /**
   * PR25 — `Deshacer`/`Borrar` render directly above the step's `Firmar`;
   * `Borrar` and `Firmar` are both reachable by a técnico's thumb while
   * standing in a customer's house. Tapping `Borrar` instead of `Firmar`
   * destroys a signature the customer already made. Two independent guards:
   * a minimum spatial gap, and a distinct destructive colour so the pair
   * does not read like two equally safe actions.
   */
  const SEPARACION_MINIMA_PX = 32;

  function valorDeToken(tokens: string, nombreToken: string): number | undefined {
    const patron = new RegExp(`--${nombreToken}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`);
    const encontrado = patron.exec(tokens);
    return encontrado ? Number(encontrado[1]) : undefined;
  }

  it(`keeps at least ${SEPARACION_MINIMA_PX}px below .lienzo-de-firma__acciones before the next control, so a thumb reaching for Firmar cannot land on Borrar`, () => {
    const organismos = archivo("estilos/organismos.css");
    const tokens = archivo("estilos/tokens.css");
    expect(organismos, "estilos/organismos.css is missing").toBeDefined();
    expect(tokens, "estilos/tokens.css is missing").toBeDefined();

    const regla = /\.lienzo-de-firma__acciones\s*\{([^}]*)\}/.exec(organismos?.contenido ?? "");
    expect(regla, ".lienzo-de-firma__acciones rule not found in estilos/organismos.css").not.toBeNull();
    const cuerpo = regla?.[1] ?? "";

    const declaracion = /margin-bottom\s*:\s*(?:var\(--(espacio-\d+)\)|(\d+(?:\.\d+)?)px)/.exec(cuerpo);
    expect(declaracion, ".lienzo-de-firma__acciones has no margin-bottom declaration").not.toBeNull();

    const nombreToken = declaracion?.[1];
    const valorLiteral = declaracion?.[2];
    const valorPx = nombreToken !== undefined ? valorDeToken(tokens?.contenido ?? "", nombreToken) : Number(valorLiteral);

    expect(valorPx, "could not resolve .lienzo-de-firma__acciones's margin-bottom to a px value").toBeDefined();
    expect(valorPx ?? 0).toBeGreaterThanOrEqual(SEPARACION_MINIMA_PX);
  });

  it("marks the destructive action by name, never by position", () => {
    const organismos = archivo("estilos/organismos.css");
    expect(organismos, "estilos/organismos.css is missing").toBeDefined();
    const contenido = organismos?.contenido ?? "";

    // A positional selector binds the danger colour to whichever control
    // happens to be last. Reorder the pair, or add a third action, and the
    // red moves to the wrong button — the one that does NOT destroy the
    // customer's signature — silently, with every test still green. The
    // warning has to name what it warns about.
    expect(
      /\.lienzo-de-firma__acciones\s+\.boton:last-child/.test(contenido),
      "the destructive action is styled by position (:last-child) instead of by a class that says what it is",
    ).toBe(false);

    const regla = /\.boton--destructivo\s*\{([^}]*)\}/.exec(contenido);
    expect(
      regla,
      "no .boton--destructivo rule in estilos/organismos.css — a destructive action must read differently from a commit action",
    ).not.toBeNull();
    expect(/background-color\s*:\s*var\(--color-error\)/.test(regla?.[1] ?? "")).toBe(true);
  });

  // Whether the class actually reaches Borrar is asserted where it can be
  // observed rather than inferred — against the rendered DOM, in
  // `LienzoDeFirma.spec.tsx`. A source scan would pass even if `Boton`
  // dropped the prop on the floor, which is exactly what it used to do.
});

describe("PR2 (web-panel-oficina): the 48px floor covers the new controls, never data rows (R-3.5)", () => {
  function cuerpoDeRegla(contenido: string, selector: string, mensajeAusente: string): string {
    const regla = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(contenido);
    expect(regla, mensajeAusente).not.toBeNull();
    return regla?.[1] ?? "";
  }

  function esperaMinimoDeToque(cuerpo: string, quien: string): void {
    for (const propiedad of ["min-height", "min-width"]) {
      const declaracion = new RegExp(
        `${propiedad}\\s*:\\s*(?:var\\(--tamano-toque-minimo\\)|(\\d+)px)`,
      ).exec(cuerpo);
      expect(declaracion, `${quien} has no ${propiedad}`).not.toBeNull();
      const valorLiteral = declaracion?.[1];
      if (valorLiteral !== undefined) {
        expect(Number(valorLiteral)).toBeGreaterThanOrEqual(48);
      }
    }
  }

  it("gives the search input a declared minimum touch target", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const cuerpo = cuerpoDeRegla(
      panel?.contenido ?? "",
      "#busqueda-contratos",
      "#busqueda-contratos rule not found in estilos/panel.css",
    );
    esperaMinimoDeToque(cuerpo, "#busqueda-contratos");
  });

  it("gives the estado filter chips a declared minimum touch target, scoped to their own selector", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const cuerpo = cuerpoDeRegla(
      panel?.contenido ?? "",
      "\\.barra-de-busqueda__estados \\.boton",
      ".barra-de-busqueda__estados .boton rule not found in estilos/panel.css",
    );
    esperaMinimoDeToque(cuerpo, ".barra-de-busqueda__estados .boton");
  });

  it("gives the pagination controls a declared minimum touch target, scoped to their own selector", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const cuerpo = cuerpoDeRegla(
      panel?.contenido ?? "",
      "\\.paginador \\.boton",
      ".paginador .boton rule not found in estilos/panel.css",
    );
    esperaMinimoDeToque(cuerpo, ".paginador .boton");
  });

  it("does NOT impose the 48px floor on table rows or cells, across every declaration of each selector", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();

    // `.tabla-de-contratos tr` and `td` are each declared 2-3 times (the
    // narrow-layout block, the standalone rule, and the >=640px table
    // layout) — checking only the first declaration would miss a floor
    // added to a later one.
    for (const selector of ["\\.tabla-de-contratos tr", "\\.tabla-de-contratos td"]) {
      const cuerpos = todasLasCoincidencias(panel?.contenido ?? "", selector);
      expect(cuerpos.length, `${selector} rule not found in estilos/panel.css`).toBeGreaterThan(0);
      for (const cuerpo of cuerpos) {
        expect(/min-height\s*:\s*var\(--tamano-toque-minimo\)/.test(cuerpo)).toBe(false);
      }
    }
  });
});

describe("PR2: rows never present a clickable cursor, controls declare hover and focus-visible (R-3.7, R-3.8)", () => {
  it("declares no cursor: pointer on any declaration of a row/cell selector, hover variant included", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const contenido = panel?.contenido ?? "";

    // `.tabla-de-contratos tbody tr:hover` is checked explicitly, not just
    // implied by the bare `tr`/`td` selectors: it is the rule a future
    // author would most plausibly reach for to make rows look clickable,
    // and no other selector in this guard covers it.
    for (const selector of [
      "\\.tabla-de-contratos tr",
      "\\.tabla-de-contratos td",
      "\\.tabla-de-contratos tbody tr:hover",
    ]) {
      const cuerpos = todasLasCoincidencias(contenido, selector);
      expect(cuerpos.length, `${selector} rule not found`).toBeGreaterThan(0);
      for (const cuerpo of cuerpos) {
        expect(/cursor\s*:\s*pointer/.test(cuerpo)).toBe(false);
      }
    }
  });

  it("declares a :hover rule with a non-empty body for the estado chips and the pagination controls", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const contenido = panel?.contenido ?? "";

    // A raw `contenido.includes(selector)` check would pass on a mere
    // comment mention of the selector, or on a rule with an empty body —
    // neither declares an actual visible change. The optional
    // `:not(:disabled)` suffix matches this file's real declarations.
    for (const selectorBase of ["\\.barra-de-busqueda__estados \\.boton", "\\.paginador \\.boton"]) {
      const regla = new RegExp(`${selectorBase}:hover(?::not\\(:disabled\\))?\\s*\\{([^}]*)\\}`).exec(contenido);
      expect(regla, `no :hover rule found for ${selectorBase}:hover`).not.toBeNull();
      expect(
        (regla?.[1] ?? "").trim().length,
        `:hover rule for ${selectorBase} declares no properties`,
      ).toBeGreaterThan(0);
    }
  });

  it("excludes the disabled pagination control from the hover affordance (R-3.8)", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const contenido = panel?.contenido ?? "";

    // R-3.8: "a disabled control does not offer a hover affordance." A
    // disabled <button> still matches CSS :hover in most browsers — only
    // :active/click are suppressed by the `disabled` attribute — so the
    // exclusion has to be explicit in the selector itself. Checking for the
    // absence of a `cursor` declaration would prove nothing here: this
    // stylesheet declares no `cursor` property anywhere, so that check
    // would pass regardless of whether the real affordance (the hover
    // background-color change) is actually excluded.
    const regla = /\.paginador \.boton:hover:not\(:disabled\)\s*\{([^}]*)\}/.exec(contenido);
    expect(
      regla,
      ".paginador .boton:hover:not(:disabled) rule not found — a disabled pagination control would inherit the enabled hover affordance",
    ).not.toBeNull();
    expect((regla?.[1] ?? "").trim().length).toBeGreaterThan(0);
  });

  it("declares a :focus-visible rule with a non-empty body for the search input, the estado chips and pagination", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    const contenido = panel?.contenido ?? "";

    for (const selector of [
      "#busqueda-contratos:focus-visible",
      "\\.barra-de-busqueda__estados \\.boton:focus-visible",
      "\\.paginador \\.boton:focus-visible",
    ]) {
      const regla = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(contenido);
      expect(regla, `no :focus-visible rule found for ${selector}`).not.toBeNull();
      expect(
        (regla?.[1] ?? "").trim().length,
        `:focus-visible rule for ${selector} declares no properties`,
      ).toBeGreaterThan(0);
    }
  });

  it("never removes a focus indicator without declaring a replacement", () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        removalesSinReemplazo(contenido).map((regla) => regla.selector),
        `${rutaRelativa} removes the focus outline with no visible replacement`,
      ).toEqual([]);
    }
  });

  /**
   * The scan itself, proven against synthetic CSS — not just the judgement it
   * delegates to. The real stylesheets contain zero outline removals, so the
   * loop above executes no assertion at all; without these cases the slicing
   * that feeds the judge could be wrong for years and every run stay green.
   */
  describe("removalesSinReemplazo", () => {
    it("reports a bare removal", () => {
      expect(removalesSinReemplazo(".a { outline: none; }").map((r) => r.selector)).toEqual([".a"]);
    });

    it("accepts a removal that declares a real outline in the same rule", () => {
      expect(
        removalesSinReemplazo(".a { outline: none; outline: 3px solid red; }"),
      ).toEqual([]);
    });

    it("accepts a removal scoped away from keyboard focus", () => {
      expect(removalesSinReemplazo(".a:not(:focus-visible) { outline: none; }")).toEqual([]);
    });

    /** The standard correct pattern: remove, then restore on focus-visible. */
    it("accepts a removal whose replacement lives in a sibling focus rule", () => {
      const css = ".a { outline: none; } .a:focus-visible { outline: 3px solid red; }";

      expect(removalesSinReemplazo(css)).toEqual([]);
    });

    it("still reports it when the sibling focus rule also removes the outline", () => {
      const css = ".a { outline: none; } .a:focus-visible { outline: 0; }";

      expect(removalesSinReemplazo(css).map((r) => r.selector)).toEqual([".a", ".a:focus-visible"]);
    });

    it("does not let another element's focus rule cover a bare removal", () => {
      const css = ".a { outline: none; } .b:focus-visible { outline: 3px solid red; }";

      expect(removalesSinReemplazo(css).map((r) => r.selector)).toEqual([".a"]);
    });

    it("finds a removal nested inside a media query, with its own selector", () => {
      const css = "@media (min-width: 640px) { .x { color: red; } .y { outline: none; } }";

      expect(removalesSinReemplazo(css).map((r) => r.selector)).toEqual([".y"]);
    });

    it("reports nothing for a stylesheet that removes no outline", () => {
      expect(removalesSinReemplazo(".a { outline: 3px solid red; }")).toEqual([]);
    });
  });

  /**
   * The rule the scan above applies, exercised directly.
   *
   * Two ways this judgement was silently wrong before, both of which these
   * cases would have caught:
   *
   * 1. The rule body used to be sliced from the opening brace, so the
   *    selector was never part of what got inspected — and `:focus-visible`
   *    only ever appears in a selector. The legitimate-scoping branch could
   *    therefore never fire.
   * 2. The replacement check was `/outline\s*:\s*(?!none|0)/`. A negative
   *    lookahead preceded by a variable-width `\s*` is defeated by
   *    backtracking: against `outline: none` the `\s*` gives back its space,
   *    the lookahead then evaluates at `" none"` — which does not begin with
   *    `none` — and succeeds. The removal counted as its own replacement, so
   *    the guard could never fail.
   */
  describe("tieneReemplazoDeFoco", () => {
    it("accepts a removal scoped away from keyboard focus", () => {
      expect(tieneReemplazoDeFoco(".boton:focus:not(:focus-visible)", "outline: none;")).toBe(true);
    });

    it("accepts a removal that declares a real outline in the same rule", () => {
      expect(
        tieneReemplazoDeFoco(".boton:focus", "outline: none; outline: 2px solid var(--color-foco);"),
      ).toBe(true);
    });

    it("rejects a bare removal — this is the case the old backtracking bug let through", () => {
      expect(tieneReemplazoDeFoco(".boton:focus", "outline: none;")).toBe(false);
      expect(tieneReemplazoDeFoco(".boton:focus", "outline:0;")).toBe(false);
    });

    it("rejects a removal that targets keyboard focus itself", () => {
      expect(tieneReemplazoDeFoco(".boton:focus-visible", "outline: none;")).toBe(false);
    });

    it("does not accept a replacement that is itself another removal", () => {
      expect(tieneReemplazoDeFoco(".boton:focus", "outline: none; outline: 0;")).toBe(false);
    });
  });
});

describe("PR2: exactly the documented breakpoints, min-width only (D13/D17)", () => {
  const PATRON_MEDIA_MIN_WIDTH = /@media\s*\(\s*min-width\s*:\s*(\d+)px\s*\)/g;
  const BREAKPOINTS_DOCUMENTADOS = new Set([640, 1024]);

  it("declares exactly the two documented breakpoints (640px, 1024px) and no others", () => {
    const valores = new Set<number>();
    for (const { contenido } of archivosCss(DIRECTORIO_SRC)) {
      for (const coincidencia of contenido.matchAll(PATRON_MEDIA_MIN_WIDTH)) {
        const valor = coincidencia[1];
        if (valor !== undefined) {
          valores.add(Number(valor));
        }
      }
    }

    expect(valores.size, "no @media (min-width: …) rule was found at all").toBeGreaterThan(0);
    for (const valor of valores) {
      expect(
        BREAKPOINTS_DOCUMENTADOS.has(valor),
        `${valor}px is not one of the two documented breakpoints (640, 1024) — a third breakpoint appeared`,
      ).toBe(true);
    }
  });

  it("uses min-width media queries only — no max-width query anywhere", () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      expect(
        /@media[^{]*max-width/i.test(contenido),
        `${ruta} declares a max-width media query — this app is mobile-first, min-width only`,
      ).toBe(false);
    }
  });

  it(".layout-panel rebinds --fuente-base to at least 16px, while :root keeps its 18px tablet value", () => {
    const panel = archivo("estilos/panel.css");
    const tokens = archivo("estilos/tokens.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    expect(tokens, "estilos/tokens.css is missing").toBeDefined();

    const reglaLayoutPanel = /\.layout-panel\s*\{([^}]*)\}/.exec(panel?.contenido ?? "");
    expect(reglaLayoutPanel, ".layout-panel rule not found in estilos/panel.css").not.toBeNull();
    const valorFuente = /--fuente-base\s*:\s*(\d+)px/.exec(reglaLayoutPanel?.[1] ?? "");
    expect(valorFuente, ".layout-panel does not rebind --fuente-base").not.toBeNull();
    expect(Number(valorFuente?.[1])).toBeGreaterThanOrEqual(16);

    const valorRaiz = /:root\s*\{[^}]*--fuente-base\s*:\s*(\d+)px/.exec(tokens?.contenido ?? "");
    expect(valorRaiz, ":root --fuente-base not found in tokens.css").not.toBeNull();
    expect(Number(valorRaiz?.[1])).toBe(18);
  });

  /**
   * The rebind above is necessary and was never sufficient, which the guard
   * beside it could not see.
   *
   * `body` declares `font-size: var(--fuente-base)` (`base.css:40`), and that
   * `var()` is resolved ON `body` — an ancestor of `.layout-panel`. A custom
   * property rebound on a DESCENDANT cannot retroactively change a value
   * already computed further up, so inherited text inside the panel kept the
   * 18px `body` computed value. Measured in Chrome before this rule existed:
   * a panel `td` rendered at 18px at 360, 1366 and 1920px wide, while
   * `.boton`, `.campo-texto` and `.etiqueta` — the atoms that read
   * `var(--fuente-base)` in their OWN rule (`atomos.css`) — rendered at 16px.
   * The panel was split between two type sizes, not moved to one.
   *
   * So the rebind must be CONSUMED here as well as declared. Reading it back
   * on `.layout-panel` itself is what re-resolves the property below its own
   * declaration and gives the subtree a single inherited base. Asserting only
   * the declaration is what let an inert rule read as a working one.
   */
  it(".layout-panel consumes the rebind it declares — a rebind alone never reaches inherited text", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();

    const reglaLayoutPanel = /\.layout-panel\s*\{([^}]*)\}/.exec(panel?.contenido ?? "");
    expect(reglaLayoutPanel, ".layout-panel rule not found in estilos/panel.css").not.toBeNull();
    expect(
      /font-size\s*:\s*var\(\s*--fuente-base\s*\)/.test(reglaLayoutPanel?.[1] ?? ""),
      ".layout-panel rebinds --fuente-base without reading it back, so the rebind is inert for every inherited element in the panel",
    ).toBe(true);
  });
});

/**
 * Resolves a `var(--token)` or a literal hex against `tokens.css`, so the
 * assertions below test the COLOUR a user sees rather than the spelling of
 * the declaration.
 */
function valorDeColor(declaracion: string, tokens: string): string | undefined {
  const texto = declaracion.trim();

  /**
   * `color-mix()` must be computed, not peeked at. Reading the first `var()`
   * inside one returns the colour being mixed FROM, which is nowhere near
   * what renders — `color-mix(in srgb, var(--color-primario) 8%, white)` is
   * a pale tint, not brand green. The first version of this helper did
   * exactly that and reported an 8% tint as a solid fill, which is the same
   * class of mistake it exists to catch, and it can produce false passes as
   * easily as false failures.
   */
  const mezcla = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/i.exec(texto);
  if (mezcla) {
    const primero = valorDeColor(mezcla[1] ?? "", tokens);
    const segundo = valorDeColor(mezcla[3] ?? "", tokens);
    if (primero === undefined || segundo === undefined) return undefined;
    const proporcion = Number(mezcla[2]) / 100;
    const [a, b] = [canales(primero), canales(segundo)];
    const canal = (i: number) => Math.round((a[i] ?? 0) * proporcion + (b[i] ?? 0) * (1 - proporcion));
    return `#${[0, 1, 2].map((i) => canal(i).toString(16).padStart(2, "0")).join("")}`;
  }

  const referencia = /^var\(\s*(--[\w-]+)\s*\)$/.exec(texto);
  if (referencia) {
    const token = new RegExp(`${referencia[1]}\\s*:\\s*(#[0-9a-f]{3,8})`, "i").exec(tokens);
    return token?.[1]?.toLowerCase();
  }

  return /^#[0-9a-f]{3,8}$/i.test(texto) ? texto.toLowerCase() : undefined;
}

function canales(hex: string): readonly [number, number, number] {
  const c = hex.replace("#", "");
  const ancho = c.length <= 4 ? 1 : 2;
  const leer = (i: number) => {
    const trozo = c.slice(i * ancho, i * ancho + ancho);
    return parseInt(ancho === 1 ? trozo + trozo : trozo, 16);
  };
  return [leer(0), leer(1), leer(2)];
}

/** WCAG relative luminance. */
function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * HSL hue, in degrees [0, 360). D6 scopes the brand-blue family by hue AND
 * saturation rather than by an enumerated list of blues — this is the "which
 * direction is this colour" half of that rule.
 */
function matiz(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => v / 255) as [number, number, number];
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const delta = maximo - minimo;
  if (delta === 0) return 0;

  let h: number;
  if (maximo === r) h = ((g - b) / delta) % 6;
  else if (maximo === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * HSL saturation, as a percentage [0, 100]. The load-bearing half of D6's
 * family test: `--color-estado-borrador-texto` (#39454c) and `--color-borde`
 * (#4b5563) both sit inside the 190°-230° hue window at ~14% saturation —
 * without this floor, a hue-only guard would flag both existing neutrals.
 */
function saturacion(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => v / 255) as [number, number, number];
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const delta = maximo - minimo;
  if (delta === 0) return 0;

  const l = (maximo + minimo) / 2;
  return (delta / (1 - Math.abs(2 * l - 1))) * 100;
}

function fondoDeclarado(cuerpo: string): string | undefined {
  return /background(?:-color)?\s*:\s*([^;}]+)/.exec(cuerpo)?.[1]?.trim();
}

function colorDeclarado(cuerpo: string): string | undefined {
  return /(?:^|[;\s])color\s*:\s*([^;}]+)/.exec(cuerpo)?.[1]?.trim();
}

/**
 * D6 — "brand-blue family" = resolved hue 190°-230° with HSL saturation
 * ≥50%. The saturation floor is load-bearing: `--color-estado-borrador-texto`
 * (#39454c, hue 202°, 14%) and `--color-borde` (#4b5563, hue 215°, 14%) are
 * existing neutrals inside that hue window; a hue-only test would flag both.
 */
const FAMILIA_MARCA_HUE_MIN = 190;
const FAMILIA_MARCA_HUE_MAX = 230;
const FAMILIA_MARCA_SATURACION_MINIMA = 50;
const RATIO_MARCA_MINIMO = 4.5;

function esFamiliaDeMarca(hex: string): boolean {
  const h = matiz(hex);
  return h >= FAMILIA_MARCA_HUE_MIN && h <= FAMILIA_MARCA_HUE_MAX && saturacion(hex) >= FAMILIA_MARCA_SATURACION_MINIMA;
}

/** Every top-level CSS rule as `{selector, cuerpo}`, comments stripped and
 * selector lists split — the same innermost-rule shape the touch-floor scan
 * below (`reglasDeclaradas`) uses. */
function reglasConColor(contenido: string): ReadonlyArray<{ selector: string; cuerpo: string }> {
  const sinComentarios = contenido.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((coincidencia) => {
    const cuerpo = coincidencia[2] ?? "";
    return (coincidencia[1] ?? "")
      .split(",")
      .map((selector) => selector.trim().replace(/\s+/g, " "))
      .filter((selector) => selector !== "" && !selector.startsWith("@"))
      .map((selector) => ({ selector, cuerpo }));
  });
}

/**
 * Guards B/C (D6), a single shared shape for both directions: every rule
 * whose `propiedad` resolves into the brand-blue family, checked against
 * whatever the SAME rule declares for `propiedadOpuesta` — falling back to
 * `--color-fondo` when reading `color` (Guard B) or `--color-texto` when
 * reading `background` (Guard C), matching the fallback the resolved colour
 * would actually render against.
 */
function violacionesGuardiaDeMarca(
  contenido: string,
  tokens: string,
  propiedad: "color" | "background",
  propiedadOpuesta: "color" | "background",
): ReadonlyArray<{ readonly selector: string; readonly ratio: number }> {
  const leerDeclarada = propiedad === "color" ? colorDeclarado : fondoDeclarado;
  const leerOpuesta = propiedadOpuesta === "color" ? colorDeclarado : fondoDeclarado;
  const variableDeReserva = propiedad === "color" ? "var(--color-fondo)" : "var(--color-texto)";

  const violaciones: Array<{ selector: string; ratio: number }> = [];
  for (const { selector, cuerpo } of reglasConColor(contenido)) {
    const declaracion = leerDeclarada(cuerpo);
    if (declaracion === undefined) continue;

    const color = valorDeColor(declaracion, tokens);
    if (color === undefined || !esFamiliaDeMarca(color)) continue;

    const opuestaCruda = leerOpuesta(cuerpo) ?? variableDeReserva;
    const opuesta = valorDeColor(opuestaCruda, tokens);
    if (opuesta === undefined) continue;

    const ratio = contraste(color, opuesta);
    if (ratio < RATIO_MARCA_MINIMO) {
      violaciones.push({ selector, ratio });
    }
  }
  return violaciones;
}

/**
 * Guard A (D6): every `--color-marca-*` token declared in `tokens.css`
 * clears 4.5:1 against `--color-fondo` — the next brand colour cannot ship
 * as illegible text even before any rule consumes it.
 */
function violacionesGuardiaDeTokenDeMarca(
  tokens: string,
): ReadonlyArray<{ readonly selector: string; readonly ratio: number }> {
  const fondo = valorDeColor("var(--color-fondo)", tokens);
  if (fondo === undefined) return [];

  const violaciones: Array<{ selector: string; ratio: number }> = [];
  for (const coincidencia of tokens.matchAll(/(--color-marca-[\w-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
    const nombre = coincidencia[1];
    const valor = coincidencia[2]?.toLowerCase();
    if (nombre === undefined || valor === undefined) continue;

    const ratio = contraste(valor, fondo);
    if (ratio < RATIO_MARCA_MINIMO) {
      violaciones.push({ selector: nombre, ratio });
    }
  }
  return violaciones;
}

describe("the tablet's stylesheets never shrink type below the device floor", () => {
  /**
   * `tokens.css` states the constraint the whole tablet palette is built
   * around: a técnico reads this "held at arm's length, not up close", "in
   * direct Santiago del Estero sunlight", and taps it "sometimes with a
   * gloved thumb". `--fuente-base` is 18px for that reason, and the neutrals
   * are flat maximum contrast rather than tints.
   *
   * `panel.css` is deliberately exempt: the office reads a monitor indoors at
   * 50cm, and it rebinds `--fuente-base` to 16px on its own subtree for
   * exactly that reason (DESIGN.md D13). Every OTHER stylesheet is shared
   * with the tablet, so panel-sized type landing there is a regression a
   * screenshot on a desk will never reveal — it only shows up outdoors, in
   * front of a customer.
   *
   * Caught its first violation immediately: the session header added with
   * the office logout used `0.875rem` (15.75px at this base) and lives in
   * the SHARED sheet, so it shipped panel type onto the sunlit tablet.
   */
  const MINIMO_REM = 1;
  const PATRON_FUENTE_REM = /font-size\s*:\s*(\d+(?:\.\d+)?)rem/gi;

  it(`declares no font-size below ${MINIMO_REM}rem outside estilos/panel.css`, () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      if (rutaRelativa.endsWith("panel.css")) {
        continue;
      }

      const chicas = [...contenido.matchAll(PATRON_FUENTE_REM)]
        .map((coincidencia) => Number(coincidencia[1]))
        .filter((valor) => valor < MINIMO_REM);

      expect(
        chicas,
        `${rutaRelativa} declares ${chicas.join("rem, ")}rem — this sheet is shared with the técnico's tablet, which is read at arm's length in direct sunlight (tokens.css). Panel-sized type belongs in panel.css, which rebinds its own base for an indoor monitor.`,
      ).toEqual([]);
    }
  });
});

describe("valorDeColor resolves what renders, not what is written", () => {
  /**
   * Proven directly rather than assumed, for the same reason
   * `tieneReemplazoDeFoco` is: the colour guards below are loops over real
   * CSS, so they assert nothing until someone violates them — and a resolver
   * that quietly returns the wrong colour produces false PASSES as readily
   * as false failures. This one already got it wrong once, by reading the
   * first `var()` inside a `color-mix()` and reporting an 8% tint as a solid
   * fill.
   */
  const TOKENS = `
    :root {
      --color-primario: #0b634a;
      --color-fondo: #ffffff;
      --corto: #fff;
    }
  `;

  it("resolves a token reference", () => {
    expect(valorDeColor("var(--color-primario)", TOKENS)).toBe("#0b634a");
  });

  it("resolves a literal, and three-digit shorthand", () => {
    expect(valorDeColor("#0B634A", TOKENS)).toBe("#0b634a");
    expect(canales(valorDeColor("var(--corto)", TOKENS) ?? "")).toEqual([255, 255, 255]);
  });

  it("computes a color-mix instead of reading the colour being mixed FROM", () => {
    const mezcla = valorDeColor(
      "color-mix(in srgb, var(--color-primario) 8%, var(--color-fondo))",
      TOKENS,
    );

    expect(mezcla, "an 8% tint must not resolve to the undiluted brand colour").not.toBe("#0b634a");
    // Red channel: 0.08 × 11 + 0.92 × 255 = 235.48 -> 235.
    expect(canales(mezcla ?? "")).toEqual([235, 243, 241]);
  });

  it("resolves a 100% mix to the colour itself, and 0% to the other one", () => {
    expect(valorDeColor("color-mix(in srgb, var(--color-primario) 100%, #ffffff)", TOKENS)).toBe("#0b634a");
    expect(valorDeColor("color-mix(in srgb, var(--color-primario) 0%, #ffffff)", TOKENS)).toBe("#ffffff");
  });

  it("returns undefined for anything it cannot resolve, rather than guessing", () => {
    expect(valorDeColor("var(--no-existe)", TOKENS)).toBeUndefined();
    expect(valorDeColor("rgb(11 99 74)", TOKENS)).toBeUndefined();
    expect(valorDeColor("transparent", TOKENS)).toBeUndefined();
  });
});

/**
 * D6 — the brand-blue contrast guard scopes itself by hue AND saturation,
 * never an enumerated list of blues, so both dimensions get direct
 * assertions here rather than being trusted only through the guard that
 * consumes them.
 *
 * `#39454c` (`--color-estado-borrador-texto`) sits inside the 190°-230° hue
 * window at only ~14% saturation — proof the saturation floor is what
 * excludes it, not the hue window alone.
 */
describe("matiz/saturacion resolve HSL hue and saturation", () => {
  it("resolves hue in degrees", () => {
    expect(matiz("#0076d9")).toBeCloseTo(207, 0);
    expect(matiz("#39454c")).toBeCloseTo(202, 0);
  });

  it("resolves saturation as a percentage", () => {
    expect(saturacion("#0076d9")).toBeCloseTo(100, 0);
    expect(saturacion("#39454c")).toBeCloseTo(14, 0);
  });

  it("resolves an achromatic grey to zero saturation, an independent hue/saturation code path", () => {
    expect(saturacion("#808080")).toBe(0);
    expect(matiz("#808080")).toBe(0);
  });
});

/**
 * D6, spec `brand-presentation` — "a regression is caught". `#008bff`
 * (3.42:1 on white) is the raw brand blue the icons use; the moment it — or
 * anything else in the same hue/saturation family — carries readable text,
 * this must name the offending selector and its computed ratio rather than
 * merely fail.
 */
describe("brand-blue tokens and rules never carry illegible text (D6)", () => {
  const TOKENS_SINTETICOS = `
    :root {
      --color-fondo: #ffffff;
      --color-texto: #14181b;
    }
  `;

  it("fails a synthetic rule that paints text in raw #008bff, naming the selector and its ratio", () => {
    const cssSintetico = ".enlace-ejemplo { color: #008bff; }";

    const violaciones = violacionesGuardiaDeMarca(cssSintetico, TOKENS_SINTETICOS, "color", "background");

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]?.selector).toBe(".enlace-ejemplo");
    // #008bff on white (the fallback background) is the spec's own stated
    // figure — the case this guard exists to reject.
    expect(violaciones[0]?.ratio).toBeCloseTo(3.42, 1);
  });
});

/**
 * The same checking function, wired against the real shipped stylesheets.
 * Passes vacuously until 3.5/3.8 introduce a real `--color-marca-*` token
 * and a real brand-blue rule — this only confirms the wiring, per D6's own
 * table; 3.13 triangulates it against the real `.marca-producto__empresa`
 * rule once it exists.
 */
describe("Guards A/B/C scan the shipped stylesheets for illegible brand-blue text (D6)", () => {
  const tokens = archivo("estilos/tokens.css");

  it("finds estilos/tokens.css", () => {
    expect(tokens).toBeDefined();
  });

  it("Guard A: every --color-marca-* token clears 4.5:1 against --color-fondo", () => {
    const violaciones = violacionesGuardiaDeTokenDeMarca(tokens?.contenido ?? "");
    expect(
      violaciones.map((v) => `${v.selector}: ${v.ratio.toFixed(2)}:1`),
      "a --color-marca-* token fails 4.5:1 against --color-fondo",
    ).toEqual([]);
  });

  it("Guard B: a rule's declared `color:` in the brand-blue family clears 4.5:1 against its own background", () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      const violaciones = violacionesGuardiaDeMarca(contenido, tokens?.contenido ?? "", "color", "background");
      expect(
        violaciones.map((v) => `${v.selector} (${v.ratio.toFixed(2)}:1)`),
        `${rutaRelativa} paints text in the brand-blue family below 4.5:1`,
      ).toEqual([]);
    }
  });

  it("Guard D: the raw brand blue reaches no stylesheet at all, so the mark stays out of reach by construction", () => {
    // `brand-presentation` spec.md, amended after verification. The scenario
    // used to claim the guard "scopes to text/control selectors" — it does
    // not: `violacionesGuardiaDeMarca` walks every rule carrying a colour
    // declaration. The exemption is real, but it holds because D1 ships the
    // wordmark as live text, leaving #008bff only inside the raster icons,
    // which are not CSS and were never scannable.
    //
    // That reason is worth a guard of its own: if #008bff ever lands in a
    // stylesheet it fails 4.5:1 on white at 3.42:1, and this catches it at
    // the source rather than waiting for it to be paired with a background
    // that happens to make Guard B pass.
    // Comments are stripped first: `tokens.css` names #008bff in prose to
    // explain why it is banned, and a guard that fires on its own rationale
    // teaches the next person to delete the explanation instead of the
    // violation. Caught by running this — the first version failed on that
    // comment.
    const sinComentarios = (css: string): string => css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

    const conAzulCrudo = archivosCss(DIRECTORIO_SRC)
      .filter(({ contenido }) => /#008bff/i.test(sinComentarios(contenido)))
      .map(({ ruta }) => relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/"));

    expect(
      conAzulCrudo,
      "the raw brand blue belongs in the raster icons only; use --color-marca-azul (#0076d9) for anything a person reads",
    ).toEqual([]);
  });

  it("Guard C (inverted): a rule's declared `background:` in the brand-blue family clears 4.5:1 against its own text", () => {
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      const violaciones = violacionesGuardiaDeMarca(contenido, tokens?.contenido ?? "", "background", "color");
      expect(
        violaciones.map((v) => `${v.selector} (${v.ratio.toFixed(2)}:1)`),
        `${rutaRelativa} fills a control in the brand-blue family below 4.5:1 against its own text`,
      ).toEqual([]);
    }
  });
});

describe("a filter's on/off state is visible, not just announced (R-3.8)", () => {
  /**
   * The defect this guard exists for, measured in a real browser before it
   * was fixed: an unselected estado chip was `#0b634a` and a selected one
   * `#094f3b` — a contrast ratio of **1.32:1**, which is indistinguishable.
   * Every chip read as a big filled button whether or not it was active, so
   * the office could not tell which filters were on. `aria-pressed` was
   * correct throughout, which made it worse rather than better: a screen
   * reader knew the state and a sighted user did not.
   *
   * The rule is expressed as a measured ratio rather than "these two
   * selectors must differ", because differing is exactly what the broken
   * version already did. Only the amount was wrong.
   *
   * 3:1 is the WCAG 1.4.11 threshold for non-text state indication.
   */
  const RATIO_MINIMO_ESTADO = 3;

  const REGLA_CHIP = /\.barra-de-busqueda__estados\s+\.boton\s*\{([^}]*)\}/;
  const REGLA_CHIP_ACTIVO = /\.barra-de-busqueda__estados\s+\.boton--filtro-activo\s*\{([^}]*)\}/;
  const REGLA_CHIP_HOVER = /\.barra-de-busqueda__estados\s+\.boton:hover:not\(:disabled\)\s*\{([^}]*)\}/;

  function colores() {
    const panel = archivo("estilos/panel.css");
    const tokens = archivo("estilos/tokens.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();
    expect(tokens, "estilos/tokens.css is missing").toBeDefined();
    const css = panel?.contenido ?? "";
    const t = tokens?.contenido ?? "";

    const leer = (patron: RegExp, nombre: string) => {
      const cuerpo = patron.exec(css)?.[1];
      expect(cuerpo, `${nombre} rule not found in estilos/panel.css`).toBeDefined();
      const declaracion = fondoDeclarado(cuerpo ?? "");
      expect(declaracion, `${nombre} declares no background`).toBeDefined();
      const color = valorDeColor(declaracion ?? "", t);
      expect(color, `${nombre}'s background does not resolve to a colour: ${declaracion}`).toBeDefined();
      return color as string;
    };

    return {
      apagado: leer(REGLA_CHIP, "the inactive estado chip"),
      encendido: leer(REGLA_CHIP_ACTIVO, "the active estado chip"),
      hover: leer(REGLA_CHIP_HOVER, "the estado chip's hover"),
    };
  }

  it(`separates a selected estado chip from an unselected one by at least ${RATIO_MINIMO_ESTADO}:1`, () => {
    const { apagado, encendido } = colores();
    const ratio = contraste(apagado, encendido);

    expect(
      ratio,
      `an unselected chip (${apagado}) and a selected one (${encendido}) differ by only ${ratio.toFixed(2)}:1 — the office cannot see which filters are active`,
    ).toBeGreaterThanOrEqual(RATIO_MINIMO_ESTADO);
  });

  it("never paints an unselected chip's hover in the selected colour, which would make hovering a lie", () => {
    const { encendido, hover } = colores();

    expect(
      hover,
      `hovering an unselected chip paints it ${hover}, the exact colour of a selected one — the affordance says "this is on" about a filter that is off`,
    ).not.toBe(encendido);
  });

  /**
   * The same rule, applied to the other control on this screen that has an
   * on/off state: which page you are on. It had the identical defect for the
   * identical reason — the current page was marked by swapping a border
   * colour on an already-solid fill, so "you are here" was nearly invisible.
   *
   * Kept as its own assertion rather than folded into a loop because the two
   * controls resolve their colours from different selectors; what is shared
   * is the threshold, not the mechanism.
   */
  it(`separates the current page from the other page buttons by at least ${RATIO_MINIMO_ESTADO}:1`, () => {
    const panel = archivo("estilos/panel.css");
    const tokens = archivo("estilos/tokens.css");
    const css = panel?.contenido ?? "";
    const t = tokens?.contenido ?? "";

    const cuerpoBase = /\.paginador\s+\.boton\s*\{([^}]*)\}/.exec(css)?.[1];
    const cuerpoActual = /\.paginador\s+\.boton--pagina-actual\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(cuerpoBase, ".paginador .boton rule not found").toBeDefined();
    expect(cuerpoActual, ".paginador .boton--pagina-actual rule not found").toBeDefined();

    const otras = valorDeColor(fondoDeclarado(cuerpoBase ?? "") ?? "", t);
    const actual = valorDeColor(fondoDeclarado(cuerpoActual ?? "") ?? "", t);
    expect(otras, "the pagination buttons declare no resolvable background").toBeDefined();
    expect(actual, "the current page declares no resolvable background").toBeDefined();

    const ratio = contraste(otras as string, actual as string);
    expect(
      ratio,
      `the current page (${actual}) and the other page buttons (${otras}) differ by only ${ratio.toFixed(2)}:1 — "you are here" has to be visible without counting`,
    ).toBeGreaterThanOrEqual(RATIO_MINIMO_ESTADO);
  });
});

describe("the estado a contract is in is encoded, never spelled out alone (R-3.8)", () => {
  /**
   * The list exists to answer "what state is this contract in", and that
   * field was the least visually salient thing on the screen — plain text in
   * the third column. Each estado now carries its own badge treatment.
   *
   * The label is never removed, and this guard does not let it be: colour is
   * a second channel, never the only one. `TablaDeContratos.spec.tsx` asserts
   * the Spanish word survives in the markup; this asserts the colours exist
   * and are actually distinct from one another.
   */
  const ESTADOS = ["vigente", "borrador", "dado-de-baja", "anulado"] as const;

  it("gives every estado its own badge rule", () => {
    const panel = archivo("estilos/panel.css");
    const css = panel?.contenido ?? "";

    for (const estado of ESTADOS) {
      expect(
        new RegExp(`\\[data-estado=["']?${estado.replace(/-/g, "[_-]")}["']?\\]`).test(css),
        `no badge rule for estado "${estado}" — its rows would fall back to the default treatment and read as identical to another state`,
      ).toBe(true);
    }
  });

  it("paints the four estados in colours that are actually different from each other", () => {
    const panel = archivo("estilos/panel.css");
    const tokens = archivo("estilos/tokens.css");
    const css = panel?.contenido ?? "";
    const t = tokens?.contenido ?? "";

    const fondos = ESTADOS.map((estado) => {
      const patron = new RegExp(
        `\\[data-estado=["']?${estado.replace(/-/g, "[_-]")}["']?\\][^{]*\\{([^}]*)\\}`,
      );
      const cuerpo = patron.exec(css)?.[1] ?? "";
      return valorDeColor(fondoDeclarado(cuerpo) ?? "", t);
    });

    expect(
      new Set(fondos).size,
      `the four estado badges resolve to ${new Set(fondos).size} distinct colours (${fondos.join(", ")}) — two states that look the same are worse than no colour at all, because they suggest a distinction that is not there`,
    ).toBe(ESTADOS.length);
  });
});

describe("the paginator stays reachable without scrolling the list (R-3.9)", () => {
  /**
   * DESIGN.md D14 rejected a sticky paginator to save ~72px of height. First
   * contact with the built screen overruled it: measured in a real browser,
   * changing page meant scrolling past the entire list — the paginator sat
   * 618px below the fold at 1366×768 with a 20-row page, and still 177px
   * below it after the page size dropped to 10. Reaching the control that
   * turns the page should not require reading the page first.
   *
   * Two of the three ways a sticky footer fails do so SILENTLY, which is
   * what these assertions are for:
   *
   * 1. `position: sticky` with no inset never sticks. It is not an error,
   *    it simply behaves as `static` — the rule looks correct and does
   *    nothing. `bottom` is what arms it.
   * 2. Without an opaque background the rows scroll visibly behind the
   *    controls and the footer reads as a rendering fault.
   *
   * The third — the footer covering the last row at the end of the scroll —
   * is a layout consequence no source scan can see; it is answered by
   * `padding-block` here and verified in a browser, not by this file.
   *
   * `position: sticky` is unrelated to the banned clipped-overflow values:
   * it needs no clipping, and adds no scroll container of its own.
   */
  const PATRON_PAGINADOR = /(?<!__numeros)\n\.paginador\s*\{([^}]*)\}/;

  it("arms the sticky paginator with a bottom inset, since sticky alone silently does nothing", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();

    const regla = PATRON_PAGINADOR.exec(panel?.contenido ?? "");
    expect(regla, ".paginador rule not found in estilos/panel.css").not.toBeNull();
    const cuerpo = regla?.[1] ?? "";

    expect(
      /position\s*:\s*sticky/.test(cuerpo),
      "the paginator must be sticky so changing page never requires scrolling past the whole list (R-3.9)",
    ).toBe(true);

    expect(
      /bottom\s*:/.test(cuerpo),
      "`position: sticky` with no inset is inert — it behaves exactly like `static` and fails silently. Declare `bottom`.",
    ).toBe(true);
  });

  it("gives the sticky paginator an opaque background so rows never show through it", () => {
    const panel = archivo("estilos/panel.css");
    const cuerpo = PATRON_PAGINADOR.exec(panel?.contenido ?? "")?.[1] ?? "";

    expect(
      /background(?:-color)?\s*:/.test(cuerpo),
      "a sticky footer with a transparent background lets the rows scroll visibly behind its controls",
    ).toBe(true);
  });
});

describe("the visually-hidden table header does not widen the document (R-3.6)", () => {
  /**
   * Found by walking R-3.6's `[manual]` scenario in a real browser: at 360px
   * the document's `scrollWidth` was 492 against a 360px viewport — 132px of
   * horizontal overflow with nothing visible to scroll to.
   *
   * The cause is the narrow-layout `thead`. It is hidden rather than removed
   * so the column labels stay in the accessibility tree, using the sr-only
   * recipe — but that recipe's `overflow: hidden` is banned by the first
   * guard in this file (it protects the document viewer's reading gate). The
   * substitute, `clip-path: inset(50%)`, hides the element's PIXELS and does
   * nothing to its LAYOUT: the `th` boxes still occupy space. Worse, the rule
   * is `position: absolute` with no positioned ancestor, so its containing
   * block is the initial containing block and it escapes the table's own
   * `overflow-x: auto` region to overflow the page itself.
   *
   * The fix that holds is horizontal displacement: an absolutely-positioned
   * box at a large negative `left` contributes nothing to `scrollWidth` in a
   * left-to-right document, so no clipping — banned or otherwise — is needed.
   * This app is Spanish-only and always LTR; in an RTL document the same
   * offset would overflow the other way and this guard would need rethinking.
   *
   * Source-scanned rather than rendered because jsdom performs no layout —
   * which is exactly why this defect survived 432 passing web tests.
   */
  const PATRON_THEAD_ESTRECHO = /\.tabla-de-contratos\s+thead\s*\{([^}]*)\}/;

  it("moves the narrow-layout thead off-screen instead of only clipping its pixels", () => {
    const panel = archivo("estilos/panel.css");
    expect(panel, "estilos/panel.css is missing").toBeDefined();

    const regla = PATRON_THEAD_ESTRECHO.exec(panel?.contenido ?? "");
    expect(regla, ".tabla-de-contratos thead rule not found in estilos/panel.css").not.toBeNull();
    const cuerpo = regla?.[1] ?? "";

    const desplazamiento = /left\s*:\s*-\s*(\d+)px/.exec(cuerpo);
    expect(
      desplazamiento,
      "the hidden thead declares no negative `left` — clip-path hides its pixels but leaves its boxes in layout, and they overflow the document horizontally (measured: 492px of scrollWidth against a 360px viewport)",
    ).not.toBeNull();

    // Far enough that no plausible header width reaches back into view.
    expect(Number(desplazamiento?.[1])).toBeGreaterThanOrEqual(2000);
  });

  it("keeps the header hidden rather than removed, so its labels stay in the accessibility tree", () => {
    const panel = archivo("estilos/panel.css");
    const cuerpo = PATRON_THEAD_ESTRECHO.exec(panel?.contenido ?? "")?.[1] ?? "";

    expect(
      /display\s*:\s*none/i.test(cuerpo),
      "the hidden thead must not use display: none — that drops the column labels from the accessibility tree, which is the whole reason it is hidden rather than removed",
    ).toBe(false);
  });
});

describe("the document viewer stays bounded to a fraction of the viewport, never to its content", () => {
  it("finds and constrains .visor-documento__iframe in estilos/organismos.css", () => {
    const organismos = archivo("estilos/organismos.css");
    expect(organismos, "estilos/organismos.css is missing").toBeDefined();

    const regla = /\.visor-documento__iframe\s*\{([^}]*)\}/.exec(organismos?.contenido ?? "");
    expect(regla, ".visor-documento__iframe rule not found in estilos/organismos.css").not.toBeNull();
    const cuerpo = regla?.[1] ?? "";

    expect(
      /height\s*:\s*auto\b/i.test(cuerpo),
      "the document viewer must not size to its content via height: auto — a real two-page comodato would then fit without scrolling, silently moving the reading gate onto the wrong legal branch (puertaDeLectura.ts)",
    ).toBe(false);

    expect(
      /min-height/i.test(cuerpo),
      "the document viewer must declare no min-height at all — an unbounded min-height lets content stretch the frame exactly like height: auto does",
    ).toBe(false);

    expect(
      PATRON_ALTURA_ACOTADA_VH.test(cuerpo),
      "the document viewer must declare height or max-height as an explicit vh fraction of the viewport",
    ).toBe(true);
  });
});

/**
 * A modifier that only overrides its base by source order is one careless
 * paste away from doing nothing at all.
 *
 * This is not hypothetical. `.etiqueta--opcion` was first written above
 * `.etiqueta`, so the base's `display: block` won and the radio labels stayed
 * exactly as broken as before the fix: text 17px below the centre of its own
 * 48px control, measured in a real browser. Every unit test passed — the
 * class WAS on the element, and jsdom performs no layout, so nothing in the
 * suite could see it.
 *
 * The rule holds for the pattern rather than for this one selector: any
 * `X--modificador` sharing a stylesheet with its bare `X` must come after it.
 */
describe("a BEM modifier is never declared above the base it overrides", () => {
  function posicion(contenido: string, selector: string): number {
    const escapado = selector.replace(/[-[\]{}()*+?.\\^$|]/g, "\\$&");
    return contenido.search(new RegExp(`^${escapado}\\s*(,|\\{)`, "m"));
  }

  const hojas = archivosCss(DIRECTORIO_SRC);

  it("finds the stylesheets to check", () => {
    expect(hojas.length).toBeGreaterThan(0);
  });

  it.each(["etiqueta", "boton"])(
    "declares every `.%s--*` modifier after the bare `.%s`",
    (base) => {
      for (const hoja of hojas) {
        const posicionBase = posicion(hoja.contenido, `.${base}`);
        if (posicionBase === -1) {
          continue;
        }
        const modificadores = [
          ...hoja.contenido.matchAll(
            new RegExp(`^\\.${base}--[a-z-]+`, "gm"),
          ),
        ];
        for (const modificador of modificadores) {
          expect(
            modificador.index,
            `${hoja.ruta}: ${modificador[0]} está declarado antes de .${base}, así que la base gana por orden`,
          ).toBeGreaterThan(posicionBase);
        }
      }
    },
  );
});

/**
 * The signature surface is bounded, and the bound belongs on the CANVAS —
 * not on the wrapper that also holds Deshacer/Borrar.
 *
 * The wrapper used to carry `height: 40vh` while the canvas took `height:
 * 100%` inline, so the canvas consumed the wrapper whole and the actions
 * were laid out past the bottom of their own parent. Normal flow reserves no
 * space for overflow, so the next document's iframe was placed on top of
 * them. Measured with `elementFromPoint` at each button's centre, on the
 * phone and on the tablet alike:
 *
 *   ✗ Deshacer  tapado por <iframe class="visor-documento__iframe">
 *   ✗ Borrar    tapado por <iframe class="visor-documento__iframe">
 *
 * Two separate statements, because either one alone lets the bug back:
 * the canvas must stay bounded (a `height: auto` canvas would grow with the
 * viewport and push Firmar off-screen — the reason the cap exists), and the
 * wrapper must not be the thing bounded, or its children overflow it again.
 */
describe("the signature surface is bounded on the canvas, never on the box holding its actions", () => {
  const organismosCss = archivo("estilos/organismos.css");

  it("finds estilos/organismos.css", () => {
    expect(organismosCss).toBeDefined();
  });

  it("bounds .lienzo-de-firma__lienzo to an explicit vh fraction", () => {
    const regla = /\.lienzo-de-firma__lienzo\s*\{([^}]*)\}/.exec(organismosCss?.contenido ?? "");
    expect(regla, ".lienzo-de-firma__lienzo rule not found").not.toBeNull();
    expect(
      PATRON_ALTURA_ACOTADA_VH.test(regla?.[1] ?? ""),
      "the signature canvas must declare height or max-height as an explicit vh fraction",
    ).toBe(true);
  });

  it("does not pin .lienzo-de-firma itself, whose children would then overflow it", () => {
    const regla = /\.lienzo-de-firma\s*\{([^}]*)\}/.exec(organismosCss?.contenido ?? "");
    expect(regla, ".lienzo-de-firma rule not found").not.toBeNull();
    expect(
      /(?:^|\s|;)height\s*:/i.test(regla?.[1] ?? ""),
      ".lienzo-de-firma must not declare a height: Deshacer/Borrar live inside it and would be laid out past its bottom edge, where the next document's iframe covers them",
    ).toBe(false);
  });
});

/**
 * The touch-target floor, applied to EVERY control the stylesheets define
 * rather than to a list of selectors somebody remembered to extend.
 *
 * "primary actions meet the 48px touch-target minimum" and its PR2 sibling
 * above already assert `min-height`/`min-width` against
 * `--tamano-toque-minimo` — for `.boton`, `#busqueda-contratos`,
 * `.barra-de-busqueda__estados .boton` and `.paginador .boton`. Both were
 * green while the two links the office actually navigates with measured, in
 * Chrome at 1366×768:
 *
 *   a.tabla-de-contratos__enlace        91×24 … 174.5×24  (ten per page, and
 *                                                          the only way into
 *                                                          a contract)
 *   .pagina-detalle-contrato__volver a  166.6×24
 *
 * WCAG 2.5.5 AA asks 44×44 and `tokens.css` asks 48. Neither rule declared a
 * size at all, and neither selector was on the list. That is the defect
 * itself, not an oversight in applying it: a guard written as an enumeration
 * only ever covers what someone thought to enumerate, so the NEXT control
 * ships exactly the same way — which is why widening the list would have
 * fixed this instance and nothing else.
 *
 * So the polarity is inverted here. Anything the stylesheets declare that
 * LOOKS like a control — an interaction pseudo-class in its selector, an
 * inherently interactive element as the selector's key, or `cursor: pointer`
 * in its body — must be covered, and anything that is genuinely not a target
 * has to say so by name in `EXENCIONES`, with its reason. A new component
 * cannot slip through by not being on a list.
 *
 * What this still cannot see, stated plainly rather than papered over:
 *
 * 1. A control the stylesheets never mention. The scan reads CSS, so a
 *    `<button>` that is styled by nothing is invisible to it. The one class
 *    of control that is inline by DEFAULT — a link — is covered from the
 *    component side too, by the `<a>`/`<Link>` scan below, because that is
 *    the case where the omission actually renders as 24px.
 * 2. Computed geometry. jsdom performs no layout, so this asserts what the
 *    stylesheet DECLARES. A declaration can still be defeated at runtime by
 *    a more specific rule elsewhere, and only a browser sees that. The known
 *    silent-no-op inside a declaration — `min-height` on an inline box —
 *    is checked directly, in the last assertion of this block.
 * 3. The horizontal floor accepts a block-level `display` and `width: 100%`
 *    as satisfying it. A block-level control fills its container's inline
 *    axis, which on every screen in this app is far past 48px, but the
 *    number itself is a layout fact this file cannot compute.
 */
describe("every interactive control the stylesheets define meets the touch floor", () => {
  const PATRON_COMENTARIO_CSS = /\/\*[\s\S]*?\*\//g;
  const PSEUDOCLASES_INTERACTIVAS = /:(?:hover|active|focus|disabled|checked)\b/;

  /**
   * `label` is deliberately absent. A label forwards its clicks to the
   * control it names, so the SIZE that matters belongs to that control, not
   * to the words — `.formulario__campo label` and
   * `.detalle-contrato__formulario label` are captions above an input, and
   * demanding 48px of them would be noise. A label that IS the target —
   * `.etiqueta--opcion`, the whole row of a radio option — is caught anyway,
   * by its `cursor: pointer`.
   */
  const ELEMENTOS_INTERACTIVOS = new Set(["a", "button", "input", "select", "textarea", "summary"]);

  const EXENCIONES: ReadonlyArray<{ readonly base: string; readonly porque: string }> = [
    {
      base: ".tabla-de-contratos tbody tr",
      porque:
        "R-3.5/R-3.8: a row is not a target. It has no click handler, keeps `cursor: auto`, and its hover tint is deliberately WEAKER than the zebra striping (measured 1.0958 against 1.1129) so it never reads as actionable. Giving it the floor would be the opposite of the requirement — the one link inside it carries the target instead.",
    },
    {
      base: ".tabla-de-contratos__desplazamiento",
      porque:
        "the table's horizontal scroll region (D12). It is focusable so a keyboard can scroll it, which is why it declares `:focus-visible`, but scrolling is not a pointer target: WCAG 2.5.5 sizes things you activate. It is already full-width and far taller than the floor.",
    },
  ];

  /**
   * Innermost rules, comments stripped and selector lists split, as
   * `{selector, cuerpo}`.
   *
   * Comments are removed FIRST because this file's other scans read raw
   * text on purpose and these ones must not: `panel.css` quotes selectors
   * and whole declarations inside its prose, and a commented-out control
   * would otherwise be scanned as a real one — a violation nobody can fix,
   * because the "rule" does not exist.
   *
   * The `([^{}]+)\{([^{}]*)\}` shape is the same one `removalesSinReemplazo`
   * uses, and it yields innermost rules: a `@media` prelude can never be
   * captured as a selector, because the attempt that starts there needs a
   * `}` where the nested rule's `{` is and fails.
   */
  function reglasDeclaradas(contenido: string): ReadonlyArray<{ selector: string; cuerpo: string }> {
    const sinComentarios = contenido.replace(PATRON_COMENTARIO_CSS, "");
    return [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((coincidencia) => {
      const cuerpo = coincidencia[2] ?? "";
      return (coincidencia[1] ?? "")
        .split(",")
        .map((selector) => selector.trim().replace(/\s+/g, " "))
        .filter((selector) => selector !== "" && !selector.startsWith("@"))
        .map((selector) => ({ selector, cuerpo }));
    });
  }

  /** The selector with every pseudo-class and pseudo-element removed. */
  function selectorBase(selector: string): string {
    return selector
      .replace(/::[a-z-]+/g, "")
      .replace(/:[a-z-]+\([^()]*\)/g, "")
      .replace(/:[a-z-]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** The rightmost compound — the thing the rule actually styles. */
  function compuestoClave(base: string): string {
    const partes = base.split(/\s*[>+~]\s*|\s+/).filter((parte) => parte !== "");
    return partes.at(-1) ?? "";
  }

  function elementoClave(base: string): string {
    return /^[a-z][a-z0-9]*/.exec(compuestoClave(base))?.[0] ?? "";
  }

  function claseClave(base: string): string {
    return compuestoClave(base).match(/\.[A-Za-z0-9_-]+/g)?.at(-1) ?? "";
  }

  /**
   * Where the floor for `base` is allowed to have been declared.
   *
   * A control usually carries several classes at once, so the declaration
   * that sizes it need not sit on the selector that styles its colours:
   * `.paginador .boton--pagina-actual` is sized by `.paginador .boton`, and
   * `.detalle-contrato__formulario .campo-texto` by the `.campo-texto` atom.
   * Both directions of that are BEM-shaped, never guessed — a modifier falls
   * back to its base, and a scoped rule falls back to the bare key class,
   * because in both cases the element genuinely matches the other selector
   * too.
   */
  function identidadesDeCobertura(base: string): ReadonlyArray<string> {
    const candidatos = [base, claseClave(base)].filter((candidato) => candidato !== "");
    return [
      ...new Set(
        candidatos.flatMap((candidato) => {
          const sinModificador = candidato.replace(/--[a-z0-9-]+$/, "");
          return sinModificador === candidato ? [candidato] : [candidato, sinModificador];
        }),
      ),
    ];
  }

  /**
   * Whether any declaration of one of `propiedades` resolves to the token or
   * to a literal at or above it. Every declaration is examined, not the
   * first: a rule may set `height` for one reason and `min-height` for
   * another, and only one of them has to clear the floor.
   */
  function declaraAlMenosElPiso(cuerpo: string, propiedades: ReadonlyArray<string>): boolean {
    const patron = new RegExp(`(?:^|[;\\s])(?:${propiedades.join("|")})\\s*:\\s*([^;}]+)`, "g");
    return [...cuerpo.matchAll(patron)].some((coincidencia) => {
      const valor = (coincidencia[1] ?? "").trim();
      if (/^var\(\s*--tamano-toque-minimo\s*\)/.test(valor)) {
        return true;
      }
      const literal = /^(\d+(?:\.\d+)?)px$/.exec(valor);
      return literal !== null && Number(literal[1]) >= 48;
    });
  }

  /** Block-level: the box fills its container's inline axis on its own. */
  const DISPLAY_DE_BLOQUE = /display\s*:\s*(?:flex|grid|block|table)\b/;
  const ANCHO_COMPLETO = /(?:^|[;\s])(?:min-width|width)\s*:\s*100%/;

  function cumplePisoVertical(cuerpo: string): boolean {
    // `min-height` on an inline box is inert — the box is one line tall no
    // matter what it declares, which is precisely how both office links came
    // to measure 24px. A rule that pins itself back to `inline` has not
    // declared a floor, it has declared a decoration.
    if (/display\s*:\s*inline\s*(?:;|$)/.test(cuerpo)) {
      return false;
    }
    return declaraAlMenosElPiso(cuerpo, ["min-height", "height"]);
  }

  function cumplePisoHorizontal(cuerpo: string): boolean {
    return (
      declaraAlMenosElPiso(cuerpo, ["min-width", "width"]) ||
      ANCHO_COMPLETO.test(cuerpo) ||
      DISPLAY_DE_BLOQUE.test(cuerpo)
    );
  }

  const hojas = archivosCss(DIRECTORIO_SRC).map(({ ruta, contenido }) => ({
    ruta: relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/"),
    reglas: reglasDeclaradas(contenido),
  }));

  const todasLasReglas = hojas.flatMap(({ ruta, reglas }) =>
    reglas.map((regla) => ({ ...regla, ruta, base: selectorBase(regla.selector) })),
  );

  const controles = todasLasReglas.filter(
    (regla) =>
      regla.base !== "" &&
      !EXENCIONES.some((exencion) => exencion.base === regla.base) &&
      (PSEUDOCLASES_INTERACTIVAS.test(regla.selector) ||
        ELEMENTOS_INTERACTIVOS.has(elementoClave(regla.base)) ||
        /cursor\s*:\s*pointer/.test(regla.cuerpo)),
  );

  function declarantes(predicado: (cuerpo: string) => boolean): ReadonlySet<string> {
    return new Set(
      todasLasReglas.filter((regla) => regla.base !== "" && predicado(regla.cuerpo)).map((regla) => regla.base),
    );
  }

  function sinCobertura(predicado: (cuerpo: string) => boolean): ReadonlyArray<string> {
    const declarados = declarantes(predicado);
    return [
      ...new Set(
        controles
          .filter((control) => !identidadesDeCobertura(control.base).some((identidad) => declarados.has(identidad)))
          .map((control) => `${control.ruta}: ${control.selector}`),
      ),
    ];
  }

  it("finds controls to check, so a green run is never an empty one", () => {
    expect(hojas.length).toBeGreaterThan(0);
    // Whatever the exact count, a scan that suddenly sees a handful has
    // stopped parsing the stylesheets rather than found a tidier codebase.
    expect(controles.length).toBeGreaterThanOrEqual(15);
  });

  it("declares a vertical touch floor for each of them", () => {
    expect(
      sinCobertura(cumplePisoVertical),
      "these controls declare no min-height/height at or above --tamano-toque-minimo, and none of the selectors they also match declares one for them. A control that is exactly one line tall measures 24px — under WCAG 2.5.5's 44px floor and well under this project's 48px.",
    ).toEqual([]);
  });

  it("declares a horizontal touch floor for each of them", () => {
    expect(
      sinCobertura(cumplePisoHorizontal),
      "these controls declare no min-width/width at or above --tamano-toque-minimo, are not full-width, and are not block-level",
    ).toEqual([]);
  });

  it("keeps every exemption earning its place, so the list cannot rot into a blanket", () => {
    for (const exencion of EXENCIONES) {
      expect(
        todasLasReglas.some((regla) => regla.base === exencion.base),
        `EXENCIONES names ${exencion.base}, which no stylesheet declares any more — a stale exemption is a hole nobody is watching`,
      ).toBe(true);
    }
  });
});

/**
 * A link is the one control that is inline by DEFAULT, so it is the one
 * where forgetting the floor is invisible in the source and obvious in a
 * browser: `<a>` renders as a single line box, which measured 24px in Chrome
 * for both office links.
 *
 * `min-height` alone does not fix that. An inline box ignores it — the same
 * class of silent no-op as `position: sticky` without an inset — so the
 * `display` is what arms the declaration, and it is asserted here rather
 * than assumed.
 *
 * Scanned from the components as well as the stylesheets, because the two
 * links are reached differently and either route alone leaves a hole:
 * `TablaDeContratos.tsx` names its class on the element
 * (`<Link className="tabla-de-contratos__enlace">`) while
 * `PaginaDetalleContrato.tsx` renders a bare `<Link>` styled through its
 * parent (`.pagina-detalle-contrato__volver a`).
 */
describe("a link declares a box, since a floor on an inline box is ignored", () => {
  const DISPLAY_CON_CAJA = /display\s*:\s*(?:inline-flex|inline-grid|inline-block|flex|grid|block)\b/;
  const PISO_VERTICAL = /(?:^|[;\s])min-height\s*:\s*var\(--tamano-toque-minimo\)/;
  const PATRON_ENLACE_TSX = /<(?:a|Link)\b[^>]*\bclassName="([^"]+)"/g;

  /** Components only — a `.spec.tsx` fixture is not a shipped screen. */
  function archivosTsx(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
    return readdirSync(directorio).flatMap((nombre) => {
      const ruta = join(directorio, nombre);
      if (statSync(ruta).isDirectory()) {
        return archivosTsx(ruta);
      }
      return nombre.endsWith(".tsx") && !nombre.endsWith(".spec.tsx")
        ? [{ ruta, contenido: readFileSync(ruta, "utf8") }]
        : [];
    });
  }

  /** Every rule whose body sizes and boxes the given selector. */
  function cuerposDe(selector: string): ReadonlyArray<string> {
    const escapado = selector.replace(/[-[\]{}()*+?.\\^$|#]/g, "\\$&");
    return archivosCss(DIRECTORIO_SRC).flatMap(({ contenido }) =>
      todasLasCoincidencias(contenido, escapado),
    );
  }

  function esperaCajaConPiso(selector: string): void {
    const cuerpos = cuerposDe(selector);
    expect(cuerpos.length, `no rule declares ${selector}`).toBeGreaterThan(0);
    expect(
      cuerpos.some((cuerpo) => PISO_VERTICAL.test(cuerpo)),
      `${selector} declares no min-height: var(--tamano-toque-minimo) — measured 24px in Chrome, against WCAG 2.5.5's 44px floor`,
    ).toBe(true);
    expect(
      cuerpos.some((cuerpo) => DISPLAY_CON_CAJA.test(cuerpo)),
      `${selector} declares a min-height but leaves the link inline, where a min-height is simply ignored — the fix would look right in the diff and change nothing on screen`,
    ).toBe(true);
  }

  /** Selectors whose key is an `<a>`, taken from the stylesheets themselves. */
  const selectoresDeAncla = [
    ...new Set(
      archivosCss(DIRECTORIO_SRC).flatMap(({ contenido }) =>
        [...contenido.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|\n)([^{}\n]*[\s>+~]a)\s*\{/g)].map(
          (coincidencia) => (coincidencia[1] ?? "").trim(),
        ),
      ),
    ),
  ];

  /** Classes the components put on an `<a>`/`<Link>`. */
  const clasesDeEnlace = [
    ...new Set(
      archivosTsx(join(DIRECTORIO_SRC, "componentes"))
        .concat(archivosTsx(join(DIRECTORIO_SRC, "funcionalidades")))
        .flatMap(({ contenido }) =>
          [...contenido.matchAll(PATRON_ENLACE_TSX)].flatMap((coincidencia) =>
            (coincidencia[1] ?? "").split(/\s+/).filter((clase) => clase !== ""),
          ),
        ),
    ),
  ].map((clase) => `.${clase}`);

  it("finds links to check in both the stylesheets and the components", () => {
    expect(selectoresDeAncla.length, "no `… a { }` rule found — the anchor scan matched nothing").toBeGreaterThan(0);
    expect(clasesDeEnlace.length, "no <a>/<Link> with a className found — the component scan matched nothing").toBeGreaterThan(0);
  });

  it.each([...new Set(selectoresDeAncla)])("gives %s a real box", (selector) => {
    esperaCajaConPiso(selector);
  });

  it.each([...new Set(clasesDeEnlace)])("gives %s a real box", (selector) => {
    esperaCajaConPiso(selector);
  });

  /**
   * R-3.8, and the reason this fix is a box rather than an `::after` overlay
   * or a cell-filling target: growing what a thumb can HIT must not grow
   * what the eye reads as clickable. The row is not a link, and the moment
   * the link inside it paints a background or a border it starts to look
   * like the row is.
   */
  it("keeps the row link invisible — a bigger target, not a bigger affordance", () => {
    for (const cuerpo of cuerposDe(".tabla-de-contratos__enlace")) {
      expect(
        /(?:^|[;\s])(?:background(?:-color)?|border(?:-\w+)?)\s*:/.test(cuerpo),
        "the row link paints a background or a border — the row it sits in must not read as clickable (R-3.8), and nothing about the touch target requires painting anything",
      ).toBe(false);
    }
  });
});
