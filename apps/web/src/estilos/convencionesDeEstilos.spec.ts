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

  it("styles Borrar — the last action in .lienzo-de-firma__acciones — with the error token, distinct from the primary .boton background", () => {
    const organismos = archivo("estilos/organismos.css");
    expect(organismos, "estilos/organismos.css is missing").toBeDefined();

    const regla = /\.lienzo-de-firma__acciones\s+\.boton:last-child\s*\{([^}]*)\}/.exec(organismos?.contenido ?? "");
    expect(
      regla,
      "no rule styles .lienzo-de-firma__acciones .boton:last-child (Borrar) — a destructive action must read differently from a commit action",
    ).not.toBeNull();
    expect(/background-color\s*:\s*var\(--color-error\)/.test(regla?.[1] ?? "")).toBe(true);
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
