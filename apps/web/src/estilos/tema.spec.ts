import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design-system-migration PR1 (D3) — `tema.css` moves `tokens.css`'s custom
 * properties into Tailwind's `@theme` namespace. No real `vite build` runs
 * in this suite (the `dist/` harness lands PR4/PR5), so every assertion is
 * a text-level check of the shipped `tema.css` source.
 *
 * PR19 (task 19.2) deletes `tokens.css` itself along with the rest of the
 * hand-authored BEM sheets — the migration it was the source of truth for
 * is complete. The first test below no longer compares `tema.css` against
 * `tokens.css` at runtime; the 18 `--color-*` pairs are frozen here instead,
 * read from `tokens.css`'s last committed content before deletion, so the
 * byte-for-byte regression protection survives its source file.
 *
 * The breakpoint scenario is asserted at the mechanism level: Tailwind v4
 * derives every generated `@media (min-width: …)` prelude deterministically
 * from `@theme`'s `--breakpoint-*` keys. Asserting that only 640px/1024px
 * survive the `initial` reset is what makes "only 640/1024 resolve" true of
 * whatever Tailwind later compiles.
 */

/** `tokens.css`'s 18 `--color-*` properties, frozen at their last value before PR19 deleted the file. */
const COLORES_CONGELADOS_DE_TOKENS_CSS: ReadonlyMap<string, string> = new Map([
  ["--color-primario", "#0b634a"],
  ["--color-primario-oscuro", "#094f3b"],
  ["--color-marca-azul", "#0076d9"],
  ["--color-fondo", "#ffffff"],
  ["--color-texto", "#14181b"],
  ["--color-texto-suave", "#3f4b52"],
  ["--color-borde", "#4b5563"],
  ["--color-borde-suave", "#d0d7dc"],
  ["--color-error", "#b3261e"],
  ["--color-foco", "#0b634a"],
  ["--color-estado-vigente-fondo", "#d7f0e4"],
  ["--color-estado-vigente-texto", "#08533e"],
  ["--color-estado-borrador-fondo", "#e9edf0"],
  ["--color-estado-borrador-texto", "#39454c"],
  ["--color-estado-baja-fondo", "#fdecd2"],
  ["--color-estado-baja-texto", "#6d4106"],
  ["--color-estado-anulado-fondo", "#fbe0de"],
  ["--color-estado-anulado-texto", "#8c1d18"],
]);

const DIRECTORIO_ESTILOS = dirname(fileURLToPath(import.meta.url));

function leerEstilo(nombreArchivo: string): string {
  return readFileSync(join(DIRECTORIO_ESTILOS, nombreArchivo), "utf8");
}

function bloqueTheme(contenidoTema: string): string {
  const coincidencia = /@theme\s*\{([\s\S]*?)\n\}/.exec(contenidoTema);
  if (coincidencia === null) {
    throw new Error("estilos/tema.css declares no @theme block");
  }
  return coincidencia[1] ?? "";
}

/** Every `--color-*: value;` declaration in a `:root { … }` block, as a map. */
function propiedadesDeColor(contenidoCss: string): ReadonlyMap<string, string> {
  const patron = /(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  const propiedades = new Map<string, string>();
  for (const coincidencia of contenidoCss.matchAll(patron)) {
    const nombre = coincidencia[1];
    const valor = coincidencia[2]?.trim();
    if (nombre !== undefined && valor !== undefined) {
      propiedades.set(nombre, valor);
    }
  }
  return propiedades;
}

describe("estilos/tema.css — @theme token layer (D3)", () => {
  it("carries every --color-* property from tokens.css into @theme, byte-for-byte (frozen, tokens.css deleted PR19)", () => {
    expect(COLORES_CONGELADOS_DE_TOKENS_CSS.size).toBe(18);

    const tema = bloqueTheme(leerEstilo("tema.css"));
    const colorsDeTema = propiedadesDeColor(tema);

    for (const [nombre, valor] of COLORES_CONGELADOS_DE_TOKENS_CSS) {
      expect(colorsDeTema.get(nombre), `@theme is missing ${nombre}`).toBe(valor);
    }
  });

  it("declares --spacing-toque, --text-base/--text-grande, --font-sans and --radius-base", () => {
    const tema = bloqueTheme(leerEstilo("tema.css"));
    expect(/--spacing-toque\s*:\s*48px\s*;/.test(tema)).toBe(true);
    expect(/--text-base\s*:\s*18px\s*;/.test(tema)).toBe(true);
    expect(/--text-grande\s*:\s*22px\s*;/.test(tema)).toBe(true);
    // --radius-base, not a bare --radius: v4's border-radius namespace requires a suffix.
    expect(/--radius-base\s*:\s*8px\s*;/.test(tema)).toBe(true);
    expect(
      /--font-sans\s*:\s*system-ui,\s*-apple-system,\s*"Segoe UI",\s*Roboto,\s*sans-serif\s*;/.test(
        tema,
      ),
    ).toBe(true);
  });

  /**
   * PR22 — the sticky office chrome's anchor. 65px is the session header's
   * real rendered height, measured with a puppeteer probe against the live
   * render at BOTH 1280x800 and 360x640 (48px logout control + 2x8px
   * padding + 1px bottom border). The list page's sticky search block
   * offsets itself by this token (`top-[var(--altura-cabecera-panel)]`),
   * and the header sizes itself with it, so the two tiers can never drift
   * apart — which is why the value lives in @theme, not in any component.
   */
  it("declares --altura-cabecera-panel at the header's measured 65px height", () => {
    const tema = bloqueTheme(leerEstilo("tema.css"));
    expect(/--altura-cabecera-panel\s*:\s*65px\s*;/.test(tema)).toBe(true);
  });

  it("resets the default breakpoint tiers, then names only 640px/1024px", () => {
    const tema = bloqueTheme(leerEstilo("tema.css"));

    expect(/--breakpoint-\*\s*:\s*initial\s*;/.test(tema)).toBe(true);

    const declaracionesDeBreakpoint = [
      ...tema.matchAll(/--breakpoint-([a-z0-9-]+)\s*:\s*([^;]+);/g),
    ].filter((coincidencia) => coincidencia[1] !== "*");

    expect(declaracionesDeBreakpoint).toHaveLength(2);

    const valoresPorNombre = new Map(
      declaracionesDeBreakpoint.map((coincidencia) => [coincidencia[1], coincidencia[2]?.trim()]),
    );
    expect(valoresPorNombre.get("tableta")).toBe("640px");
    expect(valoresPorNombre.get("escritorio")).toBe("1024px");
  });
});
