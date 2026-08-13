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

function fondoDeclarado(cuerpo: string): string | undefined {
  return /background(?:-color)?\s*:\s*([^;}]+)/.exec(cuerpo)?.[1]?.trim();
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
