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
    // No CSS file under `src/` declares a bare `outline: none`/`outline: 0`
    // today, so this scan runs zero iterations and its `expect` never
    // executes. That IS the correct passing state for an invariant stated
    // over every future declaration of an outline removal — but it also
    // means the rule being applied could be wrong for years and no run
    // would reveal it. So the rule itself lives in `tieneReemplazoDeFoco`
    // and is proven directly by the test below this one; this scan only
    // walks the real stylesheets and delegates the judgement.
    for (const { ruta, contenido } of archivosCss(DIRECTORIO_SRC)) {
      for (const coincidencia of contenido.matchAll(PATRON_OUTLINE_REMOVIDO)) {
        const indice = coincidencia.index ?? 0;
        const inicioLlave = contenido.lastIndexOf("{", indice);
        const cuerpo = contenido.slice(inicioLlave + 1, contenido.indexOf("}", indice));
        const selector = contenido.slice(
          contenido.lastIndexOf("}", inicioLlave) + 1,
          inicioLlave,
        );

        expect(
          tieneReemplazoDeFoco(selector, cuerpo),
          `${ruta} removes the focus outline with no visible replacement in the same rule`,
        ).toBe(true);
      }
    }
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
