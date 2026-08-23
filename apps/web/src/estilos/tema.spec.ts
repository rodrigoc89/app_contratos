import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design-system-migration PR1 (D3) — `tema.css` moves `tokens.css`'s custom
 * properties into Tailwind's `@theme` namespace. No real `vite build` runs
 * in this suite (the `dist/` harness lands PR4/PR5), so — same convention
 * as `convencionesDeEstilos.spec.ts` — every assertion is a text-level check
 * of the shipped `tema.css` source.
 *
 * The breakpoint scenario is asserted at the mechanism level: Tailwind v4
 * derives every generated `@media (min-width: …)` prelude deterministically
 * from `@theme`'s `--breakpoint-*` keys. Asserting that only 640px/1024px
 * survive the `initial` reset is what makes "only 640/1024 resolve" true of
 * whatever Tailwind later compiles.
 */

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
  it("carries every --color-* property from tokens.css into @theme, byte-for-byte", () => {
    const colorsDeOrigen = propiedadesDeColor(leerEstilo("tokens.css"));
    expect(colorsDeOrigen.size).toBe(18);

    const tema = bloqueTheme(leerEstilo("tema.css"));
    const colorsDeTema = propiedadesDeColor(tema);

    for (const [nombre, valor] of colorsDeOrigen) {
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
