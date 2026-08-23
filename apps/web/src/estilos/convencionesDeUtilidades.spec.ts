import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design.md D2 — the JSX/`cva`/`@theme` half of the guard endpoint,
 * alongside the still-live `convencionesDeEstilos.spec.ts` (CSS) and
 * `convencionesDeCompilado.compilado.spec.ts` (compiled output, guards
 * 1/2/16). `estilos/guardias/registro.ts` records which scanner owns each
 * of the 21 guards.
 *
 * PR3 seeds this file's skeleton: the vendor-import guard (D1, task 3.5),
 * guard 7's breakpoint prefix whitelist (D3/D4), and the `valorDeColor`/
 * `matiz`/`saturacion` resolvers ported from `convencionesDeEstilos.spec.ts`
 * — same maths verbatim, only the input changes from a raw CSS declaration
 * to a Tailwind utility class name read against the `@theme` block.
 */

const DIRECTORIO_ESTILOS = dirname(fileURLToPath(import.meta.url));
const DIRECTORIO_SRC = join(DIRECTORIO_ESTILOS, "..");

/** Every first-party `.ts`/`.tsx` source file under `apps/web/src`, `.spec.*` excluded. */
function archivosFuente(directorio: string): ReadonlyArray<{ ruta: string; contenido: string }> {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return archivosFuente(ruta);
    }
    const esFuente = /\.(ts|tsx)$/.test(nombre) && !nombre.includes(".spec.");
    return esFuente ? [{ ruta, contenido: readFileSync(ruta, "utf8") }] : [];
  });
}

const PATRON_IMPORTACION_VENDOR_PROHIBIDA = /from\s+["'](?:radix-ui|@radix-ui\/[\w-]+)["']/;

/** True if `contenido` imports the unified `radix-ui` package or a split `@radix-ui/react-*` one. */
function tieneImportacionVendorProhibida(contenido: string): boolean {
  return PATRON_IMPORTACION_VENDOR_PROHIBIDA.test(contenido);
}

/**
 * D1 — shadcn is vendored source, not a runtime dependency: `npx shadcn
 * add` copies files in and this project then owns/edits them. Polymorphism
 * (`asChild`/`Slot`) is removable at vendor time and must be, since it
 * would blind guard 20's JSX classifier (D5). Enforced here rather than
 * merely asserted: a vendored component that arrives with a direct import
 * of the unified `radix-ui` package or a split `@radix-ui/react-*` one
 * fails at vendor time, before it ships.
 */
describe("no first-party file imports Radix directly (D1)", () => {
  it("flags a fixture import of the unified radix-ui package", () => {
    expect(tieneImportacionVendorProhibida('import { Slot } from "radix-ui";')).toBe(true);
  });

  it("flags a fixture import of a split @radix-ui/react-* package", () => {
    expect(tieneImportacionVendorProhibida('import * as Dialog from "@radix-ui/react-dialog";')).toBe(true);
  });

  it("does not flag an unrelated import", () => {
    expect(tieneImportacionVendorProhibida('import { cn } from "../utils/cn";')).toBe(false);
  });

  it("rejects every real file under apps/web/src that imports radix-ui/@radix-ui/* directly", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC);
    expect(fuentes.length, "no source files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        tieneImportacionVendorProhibida(contenido),
        `${rutaRelativa} imports radix-ui/@radix-ui/* directly — strip the polymorphic wrapper before this component ships (design.md D1)`,
      ).toBe(false);
    }
  });
});

const PREFIJOS_BREAKPOINT_CONOCIDOS = ["sm", "md", "lg", "xl", "2xl", "tableta", "escritorio"] as const;
const PREFIJOS_BREAKPOINT_PERMITIDOS: ReadonlySet<string> = new Set(["tableta", "escritorio"]);
const PATRON_PREFIJO_BREAKPOINT = new RegExp(
  `(?:^|[\\s"'\`])(${PREFIJOS_BREAKPOINT_CONOCIDOS.join("|")}):`,
  "g",
);

/** Every breakpoint-shaped variant prefix (`sm:`, `tableta:`, …) found in `contenido` that is NOT one of the two `@theme`-declared tiers. */
function prefijosDeBreakpointEnClase(contenido: string): string[] {
  const encontrados = [...contenido.matchAll(PATRON_PREFIJO_BREAKPOINT)].map((coincidencia) => coincidencia[1] ?? "");
  return [...new Set(encontrados)].filter((prefijo) => !PREFIJOS_BREAKPOINT_PERMITIDOS.has(prefijo));
}

/**
 * Guard 7 — D3's `@theme` block resets `--breakpoint-*: initial;` before
 * declaring exactly `tableta` (640px) and `escritorio` (1024px), so the
 * default `sm/md/lg/xl/2xl` prefixes compile to nothing rather than being
 * banned by convention alone (`tema.css`'s own comment names this guard).
 * An unknown prefix failing silently at build time is exactly the class of
 * bug D7/D8's fail-closed machinery exists to catch elsewhere — this JSX
 * scan catches it at author time instead.
 */
describe("guard 7: only the named breakpoint prefixes appear in JSX (D3/D4)", () => {
  it("flags a default Tailwind breakpoint prefix (compiles to nothing under this @theme)", () => {
    expect(prefijosDeBreakpointEnClase('className="grid lg:grid-cols-2"')).toEqual(["lg"]);
  });

  it("does not flag the two named breakpoints", () => {
    expect(prefijosDeBreakpointEnClase('className="grid tableta:grid-cols-2 escritorio:grid-cols-3"')).toEqual([]);
  });

  it("does not flag an unrelated state variant", () => {
    expect(prefijosDeBreakpointEnClase('className="hover:bg-primario focus-visible:ring-2"')).toEqual([]);
  });

  it("rejects every real .tsx file under apps/web/src that uses a default breakpoint prefix", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        prefijosDeBreakpointEnClase(contenido),
        `${rutaRelativa} uses a breakpoint prefix outside {tableta, escritorio} — it compiles to nothing under this @theme (design.md D3)`,
      ).toEqual([]);
    }
  });
});

const PREFIJOS_COLOR_TAILWIND = ["bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to"] as const;
const PATRON_CLASE_DE_COLOR = new RegExp(`^(?:${PREFIJOS_COLOR_TAILWIND.join("|")})-([a-z][\\w-]*)$`);

/**
 * Tailwind v4 generates `bg-{name}`/`text-{name}`/etc. utilities directly
 * from each `--color-{name}` `@theme` custom property — the utility's
 * suffix IS the token name. Translating a class name to the exact
 * `var(--color-*)` reference `valorDeColor` already resolves keeps its
 * maths untouched; only what feeds it changes (design.md task 3.6).
 */
function claseAVariableDeColor(clase: string): string | undefined {
  const coincidencia = PATRON_CLASE_DE_COLOR.exec(clase.trim());
  return coincidencia ? `var(--color-${coincidencia[1]})` : undefined;
}

/**
 * Ported verbatim from `convencionesDeEstilos.spec.ts`'s CSS-scoped
 * `valorDeColor` — same `color-mix()`/`var()`/literal-hex resolution, same
 * refusal to guess. Only the caller now passes a Tailwind class name
 * (translated first by `claseAVariableDeColor`) instead of a raw CSS
 * declaration.
 */
function valorDeColor(declaracion: string, tokens: string): string | undefined {
  const texto = (claseAVariableDeColor(declaracion) ?? declaracion).trim();

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

/** WCAG relative luminance — ported verbatim. */
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

/** HSL hue, in degrees [0, 360) — ported verbatim, never touched a selector. */
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
 * HSL saturation, as a percentage [0, 100] — ported verbatim. The 50%
 * floor (`FAMILIA_MARCA_SATURACION_MINIMA`) is what excludes existing
 * ~14%-saturation neutrals from the brand-blue hue window (guard 12).
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

/**
 * Guards 9-11 — `valorDeColor`/`matiz`/`saturacion` ported from
 * `convencionesDeEstilos.spec.ts`'s CSS-scoped versions. The maths are
 * reused verbatim (`matiz`/`saturacion` are unmodified — they only ever
 * took a resolved hex, never a selector). Only `valorDeColor`'s INPUT
 * changes: a small adapter (`claseAVariableDeColor`) translates a Tailwind
 * utility class name (`bg-primario`, `text-marca-azul`) to the same
 * `var(--color-*)` reference the original function already resolved — v4
 * generates that utility directly from the matching `--color-{name}`
 * `@theme` property, so the utility's suffix IS the token name.
 */
describe("guards 9-11: valorDeColor/matiz/saturacion resolve @theme class names (D3)", () => {
  const TEMA = `
    @theme {
      --color-primario: #0b634a;
      --color-fondo: #ffffff;
    }
  `;

  it("resolves a bg-* utility class against the @theme block", () => {
    expect(valorDeColor("bg-primario", TEMA)).toBe("#0b634a");
  });

  it("resolves a text-* utility class against the @theme block", () => {
    expect(valorDeColor("text-fondo", TEMA)).toBe("#ffffff");
  });

  it("returns undefined for a class with no matching @theme token", () => {
    expect(valorDeColor("bg-no-existe", TEMA)).toBeUndefined();
  });

  it("resolves hue in degrees, unchanged from the CSS-scoped version", () => {
    expect(matiz("#0076d9")).toBeCloseTo(207, 0);
  });

  it("resolves saturation as a percentage, unchanged from the CSS-scoped version", () => {
    expect(saturacion("#0076d9")).toBeCloseTo(100, 0);
  });

  it("resolves an achromatic grey to zero saturation — the 50% brand-blue floor's counter-example", () => {
    expect(saturacion("#808080")).toBe(0);
  });
});

/**
 * D6 — "brand-blue family" = resolved hue 190°-230° with HSL saturation
 * ≥50%, ported verbatim from the CSS-scoped guard.
 */
const FAMILIA_MARCA_HUE_MIN = 190;
const FAMILIA_MARCA_HUE_MAX = 230;
const FAMILIA_MARCA_SATURACION_MINIMA = 50;
const RATIO_MARCA_MINIMO = 4.5;

function esFamiliaDeMarca(hex: string): boolean {
  const h = matiz(hex);
  return h >= FAMILIA_MARCA_HUE_MIN && h <= FAMILIA_MARCA_HUE_MAX && saturacion(hex) >= FAMILIA_MARCA_SATURACION_MINIMA;
}

/** One JSX element's text/background classes, as read from a `className` string. */
interface ElementoConClaseDeColor {
  readonly selector: string;
  readonly claseTexto?: string;
  readonly claseFondo?: string;
}

/**
 * Guards B/C's shared shape (D6), ported to JSX: every element whose text
 * class resolves into the brand-blue family, checked against whatever the
 * SAME element declares for its background — falling back to `bg-fondo`
 * when none is declared, matching the fallback the resolved colour would
 * actually render against.
 */
function violacionesGuardiaDeMarcaJsx(
  elementos: readonly ElementoConClaseDeColor[],
  tema: string,
): ReadonlyArray<{ readonly selector: string; readonly ratio: number }> {
  const violaciones: Array<{ selector: string; ratio: number }> = [];

  for (const { selector, claseTexto, claseFondo } of elementos) {
    if (claseTexto === undefined) continue;

    const color = valorDeColor(claseTexto, tema);
    if (color === undefined || !esFamiliaDeMarca(color)) continue;

    const opuesta = valorDeColor(claseFondo ?? "bg-fondo", tema);
    if (opuesta === undefined) continue;

    const ratio = contraste(color, opuesta);
    if (ratio < RATIO_MARCA_MINIMO) {
      violaciones.push({ selector, ratio });
    }
  }

  return violaciones;
}

/**
 * Guard 12 — Guards A-D's brand-blue contrast assertion, ported to JSX
 * class names. Real component coverage lands in PR8 (`registro.ts`); this
 * PR proves the mechanism against a fixture Tailwind class, the same way
 * `convencionesDeEstilos.spec.ts`'s CSS-scoped version proves it against a
 * synthetic `.enlace-ejemplo { color: #008bff; }` rule.
 */
describe("guard 12: Guards A-D brand-blue contrast assertion, ported to JSX class names (D6)", () => {
  const TEMA = `
    @theme {
      --color-marca-cruda: #008bff;
      --color-fondo: #ffffff;
    }
  `;

  it("fails a fixture Tailwind class resolving to raw #008bff on text, naming the selector and ratio", () => {
    const violaciones = violacionesGuardiaDeMarcaJsx(
      [{ selector: ".enlace-ejemplo", claseTexto: "text-marca-cruda" }],
      TEMA,
    );

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]?.selector).toBe(".enlace-ejemplo");
    // #008bff on white — the same 3.42:1 figure the CSS-scoped guard rejects.
    expect(violaciones[0]?.ratio).toBeCloseTo(3.42, 1);
  });

  it("does not flag a class outside the brand-blue hue/saturation family", () => {
    const violaciones = violacionesGuardiaDeMarcaJsx([{ selector: ".otro", claseTexto: "text-fondo" }], TEMA);

    expect(violaciones).toEqual([]);
  });
});
