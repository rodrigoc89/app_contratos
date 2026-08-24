import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { act, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { DatosContratoDetalle, DatosContratoResumen, EstadoContrato } from "@contratos/esquemas";

import { Boton, TAMANOS_BOTON, VARIANTES_BOTON } from "../componentes/atomos/Boton";
import { CampoTexto } from "../componentes/atomos/CampoTexto";
import { Etiqueta } from "../componentes/atomos/Etiqueta";
import { MarcaProducto } from "../componentes/atomos/MarcaProducto";
import { Spinner } from "../componentes/atomos/Spinner";
import { BarraDeBusqueda } from "../componentes/moleculas/BarraDeBusqueda";
import { Paginador } from "../componentes/moleculas/Paginador";
import { Toast } from "../componentes/moleculas/Toast";
import { AccionesDeContrato } from "../componentes/organismos/AccionesDeContrato";
import { DetalleDeContrato } from "../componentes/organismos/DetalleDeContrato";
import { EscanerDeMac } from "../componentes/organismos/EscanerDeMac";
import { etiquetaDeEstado, InsigniaDeEstado } from "../componentes/organismos/estadoDeContrato";
import { FormularioComodatario, type ValoresComodatario } from "../componentes/organismos/FormularioComodatario";
import { FormularioEquipos, type ValoresEquipos } from "../componentes/organismos/FormularioEquipos";
import { LienzoDeFirma } from "../componentes/organismos/LienzoDeFirma";
import { TablaDeContratos } from "../componentes/organismos/TablaDeContratos";
import { CabeceraDeSesion } from "../funcionalidades/auth/contenedores/CabeceraDeSesion";
import {
  type CandidatoDeExencion,
  cumplePisoHorizontal,
  cumplePisoVertical,
  esControlInteractivo,
  esControlNativoDeToque,
  esExento,
  EXENCIONES,
  exencionesSinCorrespondencia,
} from "./guardias/pisoDeToque";

// This file is `.spec.ts`, not `.spec.tsx` — `createElement` renders guard
// 3/4's fixtures below without JSX syntax this loader does not parse.

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

const PATRON_TOKEN_SR_ONLY = /\bsr-only\b/;

/**
 * Guard 1's JSX-scanner ban (design.md slice B, `styling-guards`'s
 * "an authored sr-only token is caught before it compiles" scenario) —
 * defence in depth alongside the compiled scan
 * (`convencionesDeCompilado.compilado.spec.ts`): this catches what the team
 * writes, at author time, independent of whether a build has run; the
 * compiled scan catches what anything — including vendored source — emits.
 * Neither substitutes for the other.
 */
function tieneTokenSrOnly(contenido: string): boolean {
  return PATRON_TOKEN_SR_ONLY.test(contenido);
}

describe("guard 1: no first-party .tsx contains the literal sr-only class token (D2/slice B)", () => {
  it("flags a fixture className carrying the literal sr-only token", () => {
    expect(tieneTokenSrOnly('<span className="sr-only">Etiqueta</span>')).toBe(true);
  });

  it("flags the token even when combined with other classes", () => {
    expect(tieneTokenSrOnly('className={cn("flex", "sr-only", "gap-2")}')).toBe(true);
  });

  it("does not flag an unrelated class name", () => {
    expect(tieneTokenSrOnly('<span className="sr-2 only-sr">Etiqueta</span>')).toBe(false);
  });

  it("rejects every real .tsx file under apps/web/src that contains the literal sr-only token", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    expect(fuentes.length, "no .tsx files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        tieneTokenSrOnly(contenido),
        `${rutaRelativa} uses the sr-only class token — this reproduces the 492px overflow regression (design.md slice B); displace instead (left: -10000px)`,
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

/**
 * Guards 9-12 (design.md task 8.3) — real component coverage against the
 * actual `MarcaProducto`, not only a fixture: its wordmark's `text-marca-azul`
 * span, checked against the real compiled `tema.css`. `#0076d9` (4.57:1) is
 * the value that satisfies both requirements at once — brand-presentation's
 * amended spec, "the raw brand blue never reaches the token layer or a
 * stylesheet at all", already confirms the literal `#008bff` string appears
 * in no CSS file (`convencionesDeEstilos.spec.ts`); the icon's raster asset
 * is a binary image this text-only scanner never reads, which is the D1
 * decision itself, not a scoping rule bolted on afterward.
 */
describe("guards 9-12: MarcaProducto's wordmark resolves real brand-blue contrast (D1/D6, PR8)", () => {
  const temaReal = readFileSync(join(DIRECTORIO_SRC, "estilos/tema.css"), "utf8");

  function claseDeMarca(): string {
    const { container, unmount } = render(createElement(MarcaProducto));
    const marca = container.querySelector("[data-marca-producto] span");
    expect(marca, "MarcaProducto's brand-coloured span was not found").not.toBeNull();
    const clases = marca?.className ?? "";
    unmount();
    return clases;
  }

  it("never resolves the wordmark's brand span to the raw #008bff value", () => {
    expect(valorDeColor(claseDeMarca(), temaReal)).not.toBe("#008bff");
  });

  it("resolves the wordmark's brand span to >=4.5:1 against #ffffff", () => {
    const violaciones = violacionesGuardiaDeMarcaJsx(
      [{ selector: "MarcaProducto wordmark", claseTexto: claseDeMarca(), claseFondo: "bg-fondo" }],
      temaReal,
    );

    expect(violaciones).toEqual([]);
  });
});

/**
 * Guard 3 (design.md D5's future engine, scoped to `Boton` in PR7 — the
 * general `pisoDeToque.ts` scan over every interactive element lands in
 * PR9) — the same heuristic that engine will generalise: `*-toque` (D3's
 * `--spacing-toque` token), `size-toque`, or a numeric `w-N`/`h-N` utility
 * where `N * 4 >= 48` (Tailwind's default 4px spacing step). The CSS-scoped
 * predecessor read a `min-height`/`min-width` declaration off `.boton`;
 * this reads the same floor off `Boton`'s `cva` `tamano` variant instead.
 */
function resuelveEjeDeToque(clases: string, eje: "w" | "h"): boolean {
  if (/\bsize-toque\b/.test(clases)) {
    return true;
  }
  if (new RegExp(`\\b(?:min-)?${eje}-toque\\b`).test(clases)) {
    return true;
  }
  const numerico = new RegExp(`\\b(?:min-)?${eje}-(\\d+)\\b`, "g");
  return [...clases.matchAll(numerico)].some((coincidencia) => Number(coincidencia[1]) * 4 >= 48);
}

export function satisfaceToqueEnAmbosEjes(clases: string): boolean {
  return resuelveEjeDeToque(clases, "w") && resuelveEjeDeToque(clases, "h");
}

describe("guard 3: Boton's cva variant map resolves >=48px on both axes (D5 early, JSX)", () => {
  it("flags a fixture class list missing the touch floor on one axis", () => {
    expect(satisfaceToqueEnAmbosEjes("min-h-toque px-4")).toBe(false);
  });

  it("accepts the size-toque shorthand, which sets both axes at once", () => {
    expect(satisfaceToqueEnAmbosEjes("size-toque")).toBe(true);
  });

  it("accepts an equivalent numeric utility once N * 4 >= 48", () => {
    expect(satisfaceToqueEnAmbosEjes("h-12 w-12")).toBe(true);
  });

  it("rejects a numeric utility under the floor", () => {
    expect(satisfaceToqueEnAmbosEjes("h-8 w-8")).toBe(false);
  });

  /**
   * Every variante crossed with every tamano, not tamano alone. The floor
   * lives in `tamano`, but `cn()` merges a variante's utilities on top of
   * it, so a style variant carrying `min-h-0` would silently win — and the
   * previous loop rendered only the default variante, so it could not see
   * that. The gap became reachable when `fantasma` was added for the
   * icon-only logout control; iterating the cross product closes it by
   * construction, for every variant added after this one too.
   */
  it("resolves every variante x tamano Boton declares to >=48px on both axes", () => {
    for (const variante of VARIANTES_BOTON) {
      for (const tamano of TAMANOS_BOTON) {
        const { getByRole, unmount } = render(createElement(Boton, { variante, tamano, children: "Guardar" }));
        const clases = getByRole("button", { name: "Guardar" }).className;
        expect(
          satisfaceToqueEnAmbosEjes(clases),
          `variante="${variante}" tamano="${tamano}" fails the touch floor: ${clases}`,
        ).toBe(true);
        unmount();
      }
    }
  });
});

/**
 * Guard 4 (PR25's CSS-scoped guard, JSX variant half — final confirmation
 * against `LienzoDeFirma`'s real composition lands in PR13): `destructivo`
 * must colour itself off the `variante` prop, never off DOM position, and
 * a fixture composition of adjacent `Boton`s must be able to reach the
 * >=32px separation `organismos.css`'s `.lienzo-de-firma__acciones` rule
 * enforced, via an ordinary Tailwind spacing utility.
 */
describe("guard 4: destructivo variant differs by colour, not position, at >=32px gap in a fixture composition (PR25 -> PR7 variant half)", () => {
  const SEPARACION_MINIMA_PX = 32;

  it("colours the destructivo variant by its own prop, regardless of where it sits in the composition", () => {
    const primera = render(
      createElement(
        "div",
        { className: "flex gap-8" },
        createElement(Boton, { variante: "destructivo", children: "Borrar" }),
        createElement(Boton, { children: "Firmar" }),
      ),
    );
    expect(primera.getByRole("button", { name: "Borrar" })).toHaveClass("bg-error");
    expect(primera.getByRole("button", { name: "Firmar" })).not.toHaveClass("bg-error");
    primera.unmount();

    const segunda = render(
      createElement(
        "div",
        { className: "flex gap-8" },
        createElement(Boton, { children: "Firmar" }),
        createElement(Boton, { variante: "destructivo", children: "Borrar" }),
      ),
    );
    expect(segunda.getByRole("button", { name: "Borrar" })).toHaveClass("bg-error");
    expect(segunda.getByRole("button", { name: "Firmar" })).not.toHaveClass("bg-error");
    segunda.unmount();
  });

  it(`keeps at least ${SEPARACION_MINIMA_PX}px of gap in a fixture composition of adjacent Boton controls`, () => {
    const { container, unmount } = render(
      createElement(
        "div",
        { className: "flex gap-8" },
        createElement(Boton, { children: "Firmar" }),
        createElement(Boton, { variante: "destructivo", children: "Borrar" }),
      ),
    );

    const envoltorio = container.firstElementChild;
    expect(envoltorio, "fixture wrapper not found").not.toBeNull();

    const gap = /\bgap-(\d+)\b/.exec(envoltorio?.className ?? "");
    expect(gap, `fixture composition has no gap-N utility: ${envoltorio?.className}`).not.toBeNull();
    // Tailwind's default (unmodified, D3) spacing scale: N * 4px per step.
    expect(Number(gap?.[1]) * 4).toBeGreaterThanOrEqual(SEPARACION_MINIMA_PX);
    unmount();
  });
});

/** Guard 4 (task 13.2/13.6), final confirmation — the REAL `LienzoDeFirma` composition, not PR7's atom-level fixture above. */
describe("guard 4 (final confirmation, PR13): LienzoDeFirma's real composition confirms colour-not-position and the button gap, not just PR7's atom-level fixture", () => {
  const SEPARACION_MINIMA_PX = 32;

  it("colours Borrar as destructive by its own variant in LienzoDeFirma's real composition, never by position", () => {
    const { getByRole, unmount } = render(createElement(LienzoDeFirma, { etiqueta: "Firma" }));

    const borrar = getByRole("button", { name: "Borrar" });
    const deshacer = getByRole("button", { name: "Deshacer" });
    expect(borrar).toHaveClass("bg-error");
    expect(deshacer).not.toHaveClass("bg-error");
    unmount();
  });

  it(`keeps at least ${SEPARACION_MINIMA_PX}px between Deshacer and Borrar, and below the row before Firmar, in LienzoDeFirma's real composition`, () => {
    const { getByRole, unmount } = render(createElement(LienzoDeFirma, { etiqueta: "Firma" }));

    const acciones = getByRole("button", { name: "Deshacer" }).parentElement;
    expect(acciones, "actions wrapper not found").not.toBeNull();
    const clases = acciones?.className ?? "";

    // Tailwind's default (unmodified, D3) spacing scale: N * 4px per step.
    // `gap-N` separates the pair; `mb-N` is the invariant the CSS guard held
    // (`organismos.css`): a thumb missing Firmar must not land on Borrar.
    // Removing `mb-8` left every spec green until this loop watched it.
    for (const [utilidad, patron] of [["gap", /\bgap-(\d+)\b/], ["mb", /\bmb-(\d+)\b/]] as const) {
      const valor = patron.exec(clases);
      expect(valor, `LienzoDeFirma's real actions row has no ${utilidad}-N utility: ${clases}`).not.toBeNull();
      expect(Number(valor?.[1]) * 4, `${utilidad}-${valor?.[1]} resolves below ${SEPARACION_MINIMA_PX}px`).toBeGreaterThanOrEqual(
        SEPARACION_MINIMA_PX,
      );
    }
    unmount();
  });
});

/** Office-panel fixture shared by the guard 4/20 (PR17b) office blocks below. */
function contratoOficinaFixture(sobrescrituras: Partial<DatosContratoDetalle> = {}): DatosContratoDetalle {
  return {
    id: "c1",
    estado: "vigente",
    numero: 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "Belgrano 250",
      ciudad: "La Banda",
      provincia: "Santiago del Estero",
      whatsapp: "+5493854000111",
    },
    equipos: { antenaModelo: "LiteBeam", antenaMac: "AA:BB:CC:DD:EE:FF", poe: true, canoMetros: 12 },
    plazo: null,
    fechaFirma: "2026-01-05",
    plantillaVersionId: "v1",
    documentos: [{ documento: "comodato", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/comodato" }],
    eventos: [],
    equiposPendientesDeRestitucion: false,
    ...sobrescrituras,
  };
}

/**
 * Guard 4 (task 17b.3), office confirmation — `AccionesDeContrato`'s real
 * composition, the same PR13 (`LienzoDeFirma`) template applied to the
 * office's own destructive pair (Anular, marked destructive by name per the
 * component's own docstring). The confirmation form that follows never
 * co-exists with the actions row in the DOM (the `abierto` state ternary is
 * either/or), so unlike `LienzoDeFirma`'s `mb-8` there is no simultaneous
 * next control to clear — only the gap between the pair is asserted.
 */
describe("guard 4 (office composition, PR17b): AccionesDeContrato colours Anular destructive by its own variant, at >=32px gap from Dar de baja", () => {
  const SEPARACION_MINIMA_PX = 32;

  function renderizarAcciones() {
    return render(
      createElement(AccionesDeContrato, {
        contrato: contratoOficinaFixture(),
        onDarDeBaja: () => {},
        onAnular: () => {},
        onRegistrarRestitucion: () => {},
      }),
    );
  }

  it("colours Anular as destructive by its own variant in AccionesDeContrato's real composition, never by position", () => {
    const { getByRole, unmount } = renderizarAcciones();

    const anular = getByRole("button", { name: "Anular" });
    const darDeBaja = getByRole("button", { name: "Dar de baja" });
    expect(anular).toHaveClass("bg-error");
    expect(darDeBaja).not.toHaveClass("bg-error");
    unmount();
  });

  it(`keeps at least ${SEPARACION_MINIMA_PX}px of gap between Dar de baja and Anular in AccionesDeContrato's real composition`, () => {
    const { getByRole, unmount } = renderizarAcciones();

    const acciones = getByRole("button", { name: "Dar de baja" }).parentElement;
    expect(acciones, "actions wrapper not found").not.toBeNull();
    const clases = acciones?.className ?? "";

    const gap = /\bgap-(\d+)\b/.exec(clases);
    expect(gap, `AccionesDeContrato's real actions row has no gap-N utility: ${clases}`).not.toBeNull();
    expect(
      Number(gap?.[1]) * 4,
      `gap-${gap?.[1]} resolves below ${SEPARACION_MINIMA_PX}px`,
    ).toBeGreaterThanOrEqual(SEPARACION_MINIMA_PX);
    unmount();
  });
});

const PATRON_OUTLINE_NONE_JSX = /\boutline-none\b/;
const PATRON_SOMBRA_DE_FOCO = /\bfocus-visible:shadow-(?!none\b)[\w-]+\b/;
// A colour-suffixed token (`ring-foco`) is NOT a width token — the
// lookahead requires the class to END right after `ring`/`outline` (bare,
// default non-zero width) or right after its numeric suffix, so
// `focus-visible:ring-foco` is correctly left to the colour pattern below.
const PATRON_ANILLO_CON_ANCHO = /\bfocus-visible:(?:ring|outline)(?:-(\d+))?(?=\s|$)/g;
const PATRON_COLOR_DE_ANILLO = /\bfocus-visible:(ring|outline)-([a-z][\w-]*)\b/g;
const RATIO_FOCO_MINIMO = 3;

function tieneAnchoDeAnilloNoNulo(clases: string): boolean {
  if (PATRON_SOMBRA_DE_FOCO.test(clases)) {
    return true;
  }
  return [...clases.matchAll(PATRON_ANILLO_CON_ANCHO)].some(
    (coincidencia) => coincidencia[1] === undefined || Number(coincidencia[1]) > 0,
  );
}

/**
 * The colour half of a `focus-visible:ring-*`/`focus-visible:outline-*`
 * token, excluding its width/offset siblings — scans every match, not just
 * the first, since a width-only token (`ring-offset-2`) can legitimately
 * appear before the real colour token (`ring-foco`) in the same class list.
 */
function claseDeColorDeAnillo(clases: string): string | undefined {
  for (const coincidencia of clases.matchAll(PATRON_COLOR_DE_ANILLO)) {
    const sufijo = coincidencia[2] ?? "";
    if (/^\d+$/.test(sufijo) || sufijo.startsWith("offset")) continue;
    return `${coincidencia[1]}-${sufijo}`;
  }
  return undefined;
}

/**
 * Guard 6 (D6) — the expanded, ring-aware focus judgment.
 * `removalesSinReemplazo`/`tieneReemplazoDeFoco` (`convencionesDeEstilos.spec.ts`)
 * required a real `outline:` declaration; ported verbatim that either
 * false-fails idiomatic shadcn (`outline-none` + `focus-visible:ring-*`) or
 * silently stops protecting anything once `Boton` converts. D6 widens WHAT
 * counts as a replacement — never removes the requirement for one. Accepted
 * only when all three hold: (i) the replacement sits on `focus-visible:`,
 * never unconditional; (ii) it is a ring/outline/shadow token with
 * non-zero width; (iii) its colour resolves >=3:1 against the adjacent
 * background through the same `@theme` map guards 9-12 use.
 */
export function tieneReemplazoDeFocoJsx(clases: string, tema: string, fondoAdyacente = "bg-fondo"): boolean {
  if (!PATRON_OUTLINE_NONE_JSX.test(clases)) {
    return true;
  }
  if (!tieneAnchoDeAnilloNoNulo(clases)) {
    return false;
  }

  const claseColor = claseDeColorDeAnillo(clases);
  if (claseColor === undefined) {
    return false;
  }

  const colorAnillo = valorDeColor(claseColor, tema);
  const colorFondo = valorDeColor(fondoAdyacente, tema);
  if (colorAnillo === undefined || colorFondo === undefined) {
    return false;
  }

  return contraste(colorAnillo, colorFondo) >= RATIO_FOCO_MINIMO;
}

describe("guard 6: ring-based focus replacements pass, bare outline-none with none fails (D6)", () => {
  const TEMA = `
    @theme {
      --color-foco: #0b634a;
      --color-fondo: #ffffff;
    }
  `;

  it("does not flag a class list that never removes the outline", () => {
    expect(tieneReemplazoDeFocoJsx("bg-primario text-white", TEMA)).toBe(true);
  });

  it("rejects a bare outline-none with no replacement at all", () => {
    expect(tieneReemplazoDeFocoJsx("outline-none", TEMA)).toBe(false);
  });

  it("accepts an idiomatic focus-visible:ring replacement with non-zero width and >=3:1 contrast", () => {
    expect(tieneReemplazoDeFocoJsx("outline-none focus-visible:ring-2 focus-visible:ring-foco", TEMA)).toBe(true);
  });

  it("rejects a zero-width ring replacement", () => {
    expect(
      tieneReemplazoDeFocoJsx("outline-none focus-visible:ring-0 focus-visible:ring-foco", TEMA),
    ).toBe(false);
  });

  it("rejects an unconditional (non-focus-visible) ring — D6's requirement (i)", () => {
    expect(tieneReemplazoDeFocoJsx("outline-none ring-2 ring-foco", TEMA)).toBe(false);
  });

  it("rejects a ring replacement whose colour resolves under 3:1 — D6's requirement (iii)", () => {
    const temaClaro = `@theme { --color-foco: #f5f5f5; --color-fondo: #ffffff; }`;
    expect(
      tieneReemplazoDeFocoJsx("outline-none focus-visible:ring-2 focus-visible:ring-foco", temaClaro),
    ).toBe(false);
  });

  it("rejects every real .tsx file under apps/web/src whose outline-none has no valid focus-visible replacement", () => {
    const temaReal = readFileSync(join(DIRECTORIO_SRC, "estilos/tema.css"), "utf8");
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    expect(fuentes.length, "no .tsx files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      expect(
        tieneReemplazoDeFocoJsx(contenido, temaReal),
        `${rutaRelativa} removes focus with outline-none but declares no valid focus-visible ring/outline/shadow replacement (design.md D6)`,
      ).toBe(true);
    }
  });
});

const PATRON_ENLACE_CON_CLASE_JSX = /<(?:a|Link)\b[^>]*\bclassName="([^"]+)"/g;
const PATRON_INTENTO_VERTICAL_ENLACE = /\b(?:min-h|h)-(?:toque|\d+)\b/;
const PATRON_CAJA_ENLACE = /\b(?:inline-flex|inline-grid|inline-block|flex|grid|block|w-full|min-w-full)\b/;

/**
 * Guard 21 (task 8.1/8.5) — `<a>`/`<Link>` gets a real box, ported to JSX
 * class names. `<a>` defaults to `display: inline`, the one box a
 * `min-height` utility cannot arm — `convencionesDeEstilos.spec.ts`'s
 * CSS-scoped version measured this at 24px in Chrome for both office links
 * it still protects (`TablaDeContratos`/`PaginaDetalleContrato`, unconverted
 * until PR15/PR11). Only a link that ATTEMPTS a vertical Tailwind sizing
 * utility is in this scanner's scope: an element with no such attempt (a
 * bare BEM classname, or no className at all) has no silently-inert
 * declaration for this scanner to catch, and stays covered by the
 * still-live CSS-scoped scan until it converts — the same partial-coverage
 * shape guard 4's variant half took in PR7.
 */
export function tieneCajaRealDeEnlace(clases: string): boolean {
  if (!PATRON_INTENTO_VERTICAL_ENLACE.test(clases)) {
    return true;
  }
  return PATRON_CAJA_ENLACE.test(clases);
}

describe("guard 21: every <a>/<Link> gets a real box, ported to JSX class names (PR8)", () => {
  it("flags a fixture link that attempts a min-height utility but stays inline", () => {
    expect(tieneCajaRealDeEnlace("min-h-toque px-4")).toBe(false);
  });

  it("accepts the same attempt once a block/flex/grid companion is present", () => {
    expect(tieneCajaRealDeEnlace("inline-flex min-h-toque px-4")).toBe(true);
  });

  it("does not flag a link with no vertical sizing attempt — nothing silently inert to catch yet", () => {
    expect(tieneCajaRealDeEnlace("tabla-de-contratos__enlace")).toBe(true);
  });

  it("rejects every real .tsx file under apps/web/src whose <a>/<Link> attempts a vertical utility without a box", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    expect(fuentes.length, "no .tsx files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      for (const coincidencia of contenido.matchAll(PATRON_ENLACE_CON_CLASE_JSX)) {
        const clases = coincidencia[1] ?? "";
        expect(
          tieneCajaRealDeEnlace(clases),
          `${rutaRelativa} carries an <a>/<Link> class list ("${clases}") that attempts a vertical sizing utility while staying inline (design.md guard 21)`,
        ).toBe(true);
      }
    }
  });
});

/** Guard 20 (task 9.3/9.4) — `pisoDeToque.ts`, proven on fixtures first
 * (D5), confirmed against every already-converted PR7/PR8 atom. Walks the
 * rendered DOM for every element `esControlInteractivo` classifies, not
 * only a hand-picked `getByRole` query. */
function controlesInteractivosDe(contenedor: HTMLElement): readonly HTMLElement[] {
  return [...contenedor.querySelectorAll<HTMLElement>("*")].filter((elemento) =>
    esControlInteractivo({ tag: elemento.tagName.toLowerCase(), clases: elemento.className }),
  );
}

function esperaControlesEnElPiso(contenedor: HTMLElement): void {
  for (const { className: clases, tagName } of controlesInteractivosDe(contenedor)) {
    const mensaje = `<${tagName.toLowerCase()}> fails the touch floor: ${clases}`;
    expect(cumplePisoVertical(clases) && cumplePisoHorizontal(clases), mensaje).toBe(true);
  }
}

/**
 * Guard 20's JSX half above renders a **named list** of components. That is
 * the exact shape guard 20 exists to escape: the CSS engine replaced an
 * enumerated list precisely because one had already let two real 24px office
 * links ship. The port reproduced the defect the original was built to avoid.
 *
 * It has a concrete hole. `Boton` carries the floor in its `tamano` variant,
 * but `className` merges through `cn()`, so any caller can override it from
 * outside the atom — and every guard above tests the atom in isolation.
 * Verified, not reasoned: adding `min-h-8 min-w-8` to `BarraDeBusqueda`'s
 * filter chips left all 757 specs green. A 32px control for a gloved thumb,
 * shipped silently.
 *
 * So this states the rule over the tree instead. Every `<Boton>` call site in
 * first-party source is read statically, and any explicit sizing utility it
 * passes must still satisfy the floor on the axis it names. A caller may make
 * a button wider or taller; it may not make it smaller than a thumb.
 */
describe("guard 20 (tree-wide): no Boton call site overrides the touch floor below 48px", () => {
  const SIN_PISO_VERTICAL = /\b(?:min-)?h-(\d+)\b/;
  const SIN_PISO_HORIZONTAL = /\b(?:min-)?w-(\d+)\b/;

  /** Every `className="…"` passed to a `<Boton>` element in `contenido`. */
  function clasesDeLlamadasABoton(contenido: string): string[] {
    return [...contenido.matchAll(/<Boton\b[\s\S]*?(?:\/>|>)/g)].flatMap((elemento) =>
      [...(elemento[0] ?? "").matchAll(/className="([^"]*)"/g)].map((atributo) => atributo[1] ?? ""),
    );
  }

  it("flags a fixture call site that shrinks the button below the floor", () => {
    expect(clasesDeLlamadasABoton('<Boton className="rounded-full min-h-8">Filtro</Boton>')).toEqual([
      "rounded-full min-h-8",
    ]);
  });

  it("rejects every real Boton call site that names a sub-floor height or width", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    let llamadasEncontradas = 0;

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      for (const clases of clasesDeLlamadasABoton(contenido)) {
        llamadasEncontradas += 1;
        for (const [eje, patron] of [
          ["height", SIN_PISO_VERTICAL],
          ["width", SIN_PISO_HORIZONTAL],
        ] as const) {
          const declarado = patron.exec(clases);
          if (declarado === null) {
            continue;
          }
          expect(
            Number(declarado[1]) * 4,
            `${rutaRelativa} passes ${declarado[0]} to a <Boton>, overriding the 48px touch floor on ${eje} through cn(): ${clases}`,
          ).toBeGreaterThanOrEqual(48);
        }
      }
    }

    // Anti-rot: a scan that finds no call sites reports zero violations and
    // looks identical to a clean tree.
    expect(llamadasEncontradas, "no <Boton> call sites found — the scan went vacuous").toBeGreaterThan(3);
  });
});

describe("guard 20: pisoDeToque confirms every PR7/PR8-converted atom, zero pre-existing violations (D5, PR9)", () => {
  it("finds and clears CampoTexto's and Boton's (every variante x tamano) rendered controls", () => {
    const { container: campo, unmount: cerrar1 } = render(createElement(CampoTexto, { value: "", onCambiar: () => {} }));
    expect(controlesInteractivosDe(campo).length, "CampoTexto rendered no classified control").toBeGreaterThan(0);
    esperaControlesEnElPiso(campo);
    cerrar1();

    for (const variante of VARIANTES_BOTON) {
      for (const tamano of TAMANOS_BOTON) {
        const { container, unmount } = render(createElement(Boton, { variante, tamano, children: "Guardar" }));
        expect(controlesInteractivosDe(container)).toHaveLength(1);
        esperaControlesEnElPiso(container);
        unmount();
      }
    }
  });

  it("finds and clears CabeceraDeSesion's one interactive control — its logout Boton, not the username or wordmark", () => {
    const cabecera = createElement<{ nombreUsuario?: string }>(CabeceraDeSesion, { nombreUsuario: "ana" });
    const { container, unmount } = render(createElement(MemoryRouter, null, cabecera));
    expect(controlesInteractivosDe(container)).toHaveLength(1);
    esperaControlesEnElPiso(container);
    unmount();
  });

  it("finds and clears Toast's one interactive control — its Cerrar button (PR11)", () => {
    const { container, unmount } = render(createElement(Toast, { mensaje: "Borrador creado", onDescartar: () => {} }));
    expect(controlesInteractivosDe(container)).toHaveLength(1);
    esperaControlesEnElPiso(container);
    unmount();
  });

  it("classifies zero controls in the non-interactive atoms — the engine does not over-flag", () => {
    for (const elemento of [createElement(Etiqueta, { children: "Nombre" }), createElement(MarcaProducto), createElement(Spinner, { etiqueta: "Cargando" })]) {
      const { container, unmount } = render(elemento);
      expect(controlesInteractivosDe(container)).toEqual([]);
      unmount();
    }
  });
});

/**
 * Guard 8's rebuild (task 9.5/9.6, D4) — the ≥1rem floor's exemption axis
 * moves from a CSS filename (`panel.css`) to a component-path matcher.
 * Deliberately narrower than a blanket `componentes/**`: `componentes/atomos/`
 * is the cross-cutting layer PR7/PR8 confirmed renders under BOTH layouts —
 * exempting it site-wide would let a técnico screen regress below the
 * sunlit-arm's-length floor `tokens.css` states, the "too broad" failure
 * this task warns against. `organismos/`, `moleculas/` and
 * `funcionalidades/contratos/` are real panel-heavy subtrees instead —
 * narrow enough to hold the line on shared atoms, wide enough not to
 * false-fail an office component once one converts.
 */
const PREFIJOS_RUTA_PANEL = ["componentes/organismos/", "componentes/moleculas/", "funcionalidades/contratos/"] as const;

export function esRutaDelSubarbolDelPanel(rutaRelativa: string): boolean {
  return PREFIJOS_RUTA_PANEL.some((prefijo) => rutaRelativa.startsWith(prefijo));
}

const MINIMO_REM_JSX = 1;
/**
 * `base.css` puts `--fuente-base` (18px) on `body`, never on `html`, so
 * `rem` stays the browser's 16px default and a px value converts by this
 * constant. Asserted by "keeps rem anchored…" below rather than assumed —
 * an `html { font-size }` added later would silently move the floor.
 */
const PX_POR_REM = 16;
const TAMANOS_TEXTO_TAILWIND_BAJO_PISO: ReadonlyMap<string, number> = new Map([
  ["text-xs", 0.75],
  ["text-sm", 0.875],
]);
const PATRON_TEXTO_ARBITRARIO_REM = /\btext-\[(\d+(?:\.\d+)?)rem\]/g;
// PR16's gate proved the rem pattern alone blind to `text-[12px]`.
const PATRON_TEXTO_ARBITRARIO_PX = /\btext-\[(\d+(?:\.\d+)?)px\]/g;

/** Every sub-1rem font-size value a class list attempts — named scale, arbitrary rem or arbitrary px. */
export function tamanosDeTextoBajoElPiso(clases: string): readonly number[] {
  const encontrados: number[] = [];
  for (const [clase, valor] of TAMANOS_TEXTO_TAILWIND_BAJO_PISO) {
    if (valor < MINIMO_REM_JSX && new RegExp(`\\b${clase}\\b`).test(clases)) encontrados.push(valor);
  }
  for (const coincidencia of clases.matchAll(PATRON_TEXTO_ARBITRARIO_REM)) {
    const valor = Number(coincidencia[1]);
    if (valor < MINIMO_REM_JSX) encontrados.push(valor);
  }
  for (const coincidencia of clases.matchAll(PATRON_TEXTO_ARBITRARIO_PX)) {
    const valor = Number(coincidencia[1]) / PX_POR_REM;
    if (valor < MINIMO_REM_JSX) encontrados.push(valor);
  }
  return encontrados;
}

describe("guard 8: no font-size<1rem outside the panel subtree, matched by component path (D4, PR9)", () => {
  it.each<[string, string, boolean]>([
    ["a panel-subtree organism", "componentes/organismos/TablaDeContratos.tsx", true],
    ["a técnico-rooted path — path-based, not a blanket allowance", "funcionalidades/auth/contenedores/InicioTecnico.tsx", false],
    ["the shared atoms layer, even nested under componentes/ (the too-broad trap)", "componentes/atomos/Boton.tsx", false],
  ])("classifies %s", (_motivo, ruta, esperado) => {
    expect(esRutaDelSubarbolDelPanel(ruta)).toBe(esperado);
  });

  it("flags sub-1rem type — named scale, arbitrary rem or arbitrary px alike — and clears the floor otherwise", () => {
    expect(tamanosDeTextoBajoElPiso("text-sm").length).toBeGreaterThan(0);
    expect(tamanosDeTextoBajoElPiso("text-[0.8125rem]")).toEqual([0.8125]);
    expect(tamanosDeTextoBajoElPiso("text-[12px]")).toEqual([0.75]);
    expect(tamanosDeTextoBajoElPiso("text-base text-grande text-[16px]")).toEqual([]);
  });

  it("keeps rem anchored to the browser default: no hand-authored sheet sets font-size on html", () => {
    for (const nombre of readdirSync(DIRECTORIO_ESTILOS)) {
      if (!nombre.endsWith(".css")) continue;
      const css = quitarComentariosCss(readFileSync(join(DIRECTORIO_ESTILOS, nombre), "utf8"));
      expect(
        /\bhtml\b[^{]*\{[^}]*font-size/.test(css),
        `estilos/${nombre} sets font-size on html — PX_POR_REM (${PX_POR_REM}) would no longer be the rem basis`,
      ).toBe(false);
    }
  });

  it("rejects every real .tsx file outside the panel subtree that attempts sub-1rem type", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    expect(fuentes.length, "no .tsx files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      if (esRutaDelSubarbolDelPanel(rutaRelativa)) continue;

      expect(
        tamanosDeTextoBajoElPiso(contenido),
        `${rutaRelativa} attempts sub-1rem type outside the panel subtree (design.md D4) — read at arm's length in direct sunlight`,
      ).toEqual([]);
    }
  });
});

/**
 * Guard 13 (D6, PR10) — the estado chip's on/off state and the paginator's
 * current-page marker both carry non-text state (WCAG 1.4.11), ported to
 * JSX the same way guard 12 ports Guards A-D: real rendered `bg-*` classes,
 * resolved against `@theme`, compared through the same `contraste()` the
 * CSS-scoped guard already used (`convencionesDeEstilos.spec.ts:1097-1195`,
 * which stays live against the frozen BEM sheet — this is the JSX-owning
 * replacement now that `BarraDeBusqueda`/`Paginador` no longer render
 * `.boton--filtro-activo`/`.boton--pagina-actual`).
 *
 * The historical defect (`panel.css:107-109`) was `#0b634a` unselected
 * against `#094f3b` selected — 1.32:1, indistinguishable. `aria-pressed`
 * carried the state correctly throughout, which made it worse: a screen
 * reader knew and a sighted user did not. 3:1 is the WCAG 1.4.11 floor for
 * non-text state.
 */
describe("guard 13: estado-chip and pagination current-page state resolve >=3:1, ported to JSX (D6, PR10)", () => {
  const RATIO_ESTADO_MINIMO = 3;
  const temaReal = readFileSync(join(DIRECTORIO_SRC, "estilos/tema.css"), "utf8");

  /** The single winning `bg-*` utility in a rendered `className` — `cn()`'s tailwind-merge already dedupes conflicting backgrounds, so at most one remains. */
  function fondoDeClases(clases: string): string | undefined {
    const coincidencia = /\bbg-([a-z][\w-]*)\b/.exec(clases);
    return coincidencia ? valorDeColor(`bg-${coincidencia[1]}`, temaReal) : undefined;
  }

  it("rejects the historical estado-chip pair (#0b634a vs #094f3b, 1.32:1) that shipped once and was invisible", () => {
    const ratio = contraste("#0b634a", "#094f3b");

    expect(ratio).toBeCloseTo(1.32, 1);
    expect(
      ratio,
      `the historical estado-chip pair resolves to ${ratio.toFixed(2)}:1 — the exact regression guard 13 exists to reject`,
    ).toBeLessThan(RATIO_ESTADO_MINIMO);
  });

  it("separates BarraDeBusqueda's active estado chip from an inactive one by >=3:1, resolved from real rendered classes", () => {
    const { container, unmount } = render(
      createElement(BarraDeBusqueda, {
        termino: "",
        onCambiarTermino: () => {},
        onBuscarInmediato: () => {},
        estados: ["vigente"],
        onAlternarEstado: () => {},
      }),
    );

    const chips = [...container.querySelectorAll<HTMLButtonElement>("[aria-pressed]")];
    expect(chips.length, "BarraDeBusqueda rendered no aria-pressed chip").toBeGreaterThan(0);
    const activo = chips.find((boton) => boton.getAttribute("aria-pressed") === "true");
    const inactivo = chips.find((boton) => boton.getAttribute("aria-pressed") === "false");
    expect(activo, "no active (aria-pressed=true) chip found").toBeDefined();
    expect(inactivo, "no inactive (aria-pressed=false) chip found").toBeDefined();

    const colorActivo = fondoDeClases(activo?.className ?? "");
    const colorInactivo = fondoDeClases(inactivo?.className ?? "");
    expect(colorActivo, `active chip's background does not resolve: ${activo?.className}`).toBeDefined();
    expect(colorInactivo, `inactive chip's background does not resolve: ${inactivo?.className}`).toBeDefined();

    const ratio = contraste(colorActivo as string, colorInactivo as string);
    expect(
      ratio,
      `the active chip (${colorActivo}) and an inactive one (${colorInactivo}) differ by only ${ratio.toFixed(2)}:1 — the office cannot see which filters are active`,
    ).toBeGreaterThanOrEqual(RATIO_ESTADO_MINIMO);
    unmount();
  });

  it("separates Paginador's current page from the other page buttons by >=3:1, resolved from real rendered classes", () => {
    const { container, unmount } = render(
      createElement(Paginador, { pagina: 2, total: 30, tamanoPagina: 10, onCambiarPagina: () => {} }),
    );

    const numeros = [...container.querySelectorAll<HTMLButtonElement>("ul button")];
    const actual = numeros.find((boton) => boton.getAttribute("aria-current") === "page");
    const otra = numeros.find((boton) => boton.getAttribute("aria-current") !== "page");
    expect(actual, "no current-page button found").toBeDefined();
    expect(otra, "no other page button found").toBeDefined();

    const colorActual = fondoDeClases(actual?.className ?? "");
    const colorOtra = fondoDeClases(otra?.className ?? "");
    expect(colorActual, `current page's background does not resolve: ${actual?.className}`).toBeDefined();
    expect(colorOtra, `other page's background does not resolve: ${otra?.className}`).toBeDefined();

    const ratio = contraste(colorActual as string, colorOtra as string);
    expect(
      ratio,
      `the current page (${colorActual}) and the other page buttons (${colorOtra}) differ by only ${ratio.toFixed(2)}:1 — "you are here" has to be visible without counting`,
    ).toBeGreaterThanOrEqual(RATIO_ESTADO_MINIMO);
    unmount();
  });
});

/**
 * Guard 15 (PR10) — `position: sticky` with no `bottom` inset silently
 * behaves as `static`; the Tailwind form is the identical trap, `sticky`
 * alone versus `sticky bottom-0`. An opaque background keeps rows from
 * scrolling visibly behind the controls.
 */
describe("guard 15: sticky paginator is armed with a bottom inset and an opaque background, ported to JSX (PR10)", () => {
  function renderNav(): HTMLElement {
    const { container } = render(
      createElement(Paginador, { pagina: 1, total: 30, tamanoPagina: 10, onCambiarPagina: () => {} }),
    );
    const nav = container.querySelector("nav");
    expect(nav, "Paginador did not render a <nav>").not.toBeNull();
    return nav as HTMLElement;
  }

  it("declares sticky with a bottom inset, since sticky alone silently does nothing", () => {
    const nav = renderNav();

    expect(/\bsticky\b/.test(nav.className), `<nav> is not sticky: ${nav.className}`).toBe(true);
    expect(
      /\bbottom-(?:0\b|\[[^\]]+\])/.test(nav.className),
      `<nav> declares sticky with no bottom inset — silently inert, exactly like CSS \`position: sticky\` alone: ${nav.className}`,
    ).toBe(true);
  });

  it("gives the sticky paginator an opaque background so scrolled rows never show through it", () => {
    const nav = renderNav();

    expect(
      /\bbg-[a-z][\w-]*\b/.test(nav.className),
      `<nav> has no background utility — a transparent sticky footer lets rows scroll visibly behind its controls: ${nav.className}`,
    ).toBe(true);
  });

  /**
   * The paginator is not the only thing this project pins. The office
   * header was made sticky on request, and nothing caught it when its
   * `top-0` was removed — verified by deleting the inset and watching all
   * 750 specs stay green. Guard 15 named one component, so it could not.
   *
   * This is guard 20's lesson applied here: an enumerated list already
   * failed this codebase once, and let two real 24px links ship. So the
   * rule is stated over the whole tree instead — any first-party source
   * that declares `sticky` must also declare an inset on the axis it
   * sticks to, and carry a background. `sticky` with no inset computes to
   * `static` and does nothing, silently, in both CSS and Tailwind.
   */
  it("every first-party sticky element declares an inset and a background", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    expect(fuentes.length, "no .tsx files found — the scan matched nothing").toBeGreaterThan(3);

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      for (const [clases] of contenido.matchAll(/className="([^"]*\bsticky\b[^"]*)"/g)) {
        expect(
          /\b(?:top|bottom|inset-y|inset)-(?:0\b|\[[^\]]+\])/.test(clases ?? ""),
          `${rutaRelativa} declares sticky with no inset — it computes to static and does nothing: ${clases}`,
        ).toBe(true);
        expect(
          /\bbg-[a-z][\w-]*\b/.test(clases ?? ""),
          `${rutaRelativa} declares sticky with no background — content scrolls visibly through it: ${clases}`,
        ).toBe(true);
      }
    }
  });
});

/**
 * Guard 12 (D6, PR10) — real coverage extended to the redesigned
 * `BarraDeBusqueda`/`Paginador`: neither renders the raw brand-blue utility,
 * the JSX analogue of Guard D's "the raw brand blue reaches no stylesheet
 * at all" (`convencionesDeEstilos.spec.ts`).
 */
describe("guard 12: BarraDeBusqueda/Paginador render no brand-blue utility class (D6, PR10)", () => {
  it("BarraDeBusqueda's rendered markup carries no marca-azul utility", () => {
    const { container, unmount } = render(
      createElement(BarraDeBusqueda, {
        termino: "",
        onCambiarTermino: () => {},
        onBuscarInmediato: () => {},
        estados: ["vigente"],
        onAlternarEstado: () => {},
      }),
    );

    expect(container.innerHTML).not.toMatch(/\bmarca-azul\b/);
    unmount();
  });

  it("Paginador's rendered markup carries no marca-azul utility", () => {
    const { container, unmount } = render(
      createElement(Paginador, { pagina: 2, total: 30, tamanoPagina: 10, onCambiarPagina: () => {} }),
    );

    expect(container.innerHTML).not.toMatch(/\bmarca-azul\b/);
    unmount();
  });
});

const ESTADOS_CONTRATO: readonly EstadoContrato[] = ["vigente", "borrador", "dado_de_baja", "anulado"];

/**
 * Guard 14 (PR11) — the estado badge's colour is a second channel, never
 * the only one. This is the JSX-owning replacement for
 * `convencionesDeEstilos.spec.ts:1210-1240` ("the estado a contract is in
 * is encoded, never spelled out alone"), which stays live reading the
 * frozen `panel.css`/`tokens.css` pair, unowned here now that
 * `InsigniaDeEstado` renders real `bg-*`/`text-*` utilities instead of the
 * `.insignia-estado[data-estado=...]` CSS rule. The `[data-estado=...]`
 * attribute strategy itself is untouched — design.md D1 singles it out as
 * the guard that survives this migration best, and this redesign keeps it
 * rather than replacing it with a class-based variant.
 */
describe("guard 14: InsigniaDeEstado's four estado colours are distinct and its label never disappears (PR11)", () => {
  const temaReal = readFileSync(join(DIRECTORIO_SRC, "estilos/tema.css"), "utf8");

  /** The single winning `bg-*` utility in a rendered `className`, resolved to a hex value. */
  function fondoDeClases(clases: string): string | undefined {
    const coincidencia = /\bbg-([a-z][\w-]*)\b/.exec(clases);
    return coincidencia ? valorDeColor(`bg-${coincidencia[1]}`, temaReal) : undefined;
  }

  it("renders a [data-estado=...] hook whose background resolves to a real colour, for every estado", () => {
    for (const estado of ESTADOS_CONTRATO) {
      const { container, unmount } = render(createElement(InsigniaDeEstado, { estado }));
      const insignia = container.querySelector(`[data-estado="${estado}"]`);
      expect(insignia, `no [data-estado="${estado}"] element rendered`).not.toBeNull();
      expect(
        fondoDeClases(insignia?.className ?? ""),
        `estado "${estado}" resolves no background colour from its className: ${insignia?.className}`,
      ).toBeDefined();
      unmount();
    }
  });

  it("paints the four estados in colours that are actually different from each other, resolved from real rendered classes", () => {
    const fondos = ESTADOS_CONTRATO.map((estado) => {
      const { container, unmount } = render(createElement(InsigniaDeEstado, { estado }));
      const insignia = container.querySelector(`[data-estado="${estado}"]`);
      const color = fondoDeClases(insignia?.className ?? "");
      unmount();
      return color;
    });

    expect(
      new Set(fondos).size,
      `the four estado badges resolve to ${new Set(fondos).size} distinct colours (${fondos.join(", ")}) — two states that look the same are worse than no colour at all, because they suggest a distinction that is not there`,
    ).toBe(ESTADOS_CONTRATO.length);
  });

  it("keeps the Spanish label as the badge's entire accessible text, for every estado — colour is never the only channel", () => {
    for (const estado of ESTADOS_CONTRATO) {
      const { container, unmount } = render(createElement(InsigniaDeEstado, { estado }));
      expect(container.textContent, `no visible label rendered for estado "${estado}"`).toBe(etiquetaDeEstado(estado));
      unmount();
    }
  });
});

/**
 * Guards 9-11 (PR11) — real coverage extended to `InsigniaDeEstado`'s four
 * estado tokens, the first PR to exercise `valorDeColor` against colours
 * outside the brand palette (guard 12's `bg-primario`/wordmark targets).
 * `matiz`/`saturacion` need no separate estado-specific exercise here: both
 * already carry real coverage via `MarcaProducto`'s wordmark (PR8), and none
 * of the four estado tokens sits anywhere near the 190°-230° brand-blue hue
 * window the saturation floor exists to police — this is a presence/equality
 * check on `valorDeColor`'s resolution, not a hue-family classification.
 */
describe("guards 9-11: InsigniaDeEstado's estado tokens resolve real colours from tema.css (D3, PR11)", () => {
  const temaReal = readFileSync(join(DIRECTORIO_SRC, "estilos/tema.css"), "utf8");
  const FONDOS_ESPERADOS: Record<EstadoContrato, string> = {
    vigente: "#d7f0e4",
    borrador: "#e9edf0",
    dado_de_baja: "#fdecd2",
    anulado: "#fbe0de",
  };

  it("resolves every estado's rendered bg-* utility to the exact hex value tema.css declares", () => {
    for (const estado of ESTADOS_CONTRATO) {
      const { container, unmount } = render(createElement(InsigniaDeEstado, { estado }));
      const insignia = container.querySelector(`[data-estado="${estado}"]`);
      const coincidencia = /\bbg-([a-z][\w-]*)\b/.exec(insignia?.className ?? "");
      const resuelto = coincidencia ? valorDeColor(`bg-${coincidencia[1]}`, temaReal) : undefined;
      expect(resuelto, `estado "${estado}" resolved ${resuelto} from className "${insignia?.className}"`).toBe(
        FONDOS_ESPERADOS[estado],
      );
      unmount();
    }
  });
});

const PATRON_IFRAME_CON_CLASE_JSX = /<iframe\b[^>]*\bclassName="([^"]+)"/g;
const PATRON_ALTURA_AUTO_JSX = /\bh-auto\b/;
const PATRON_MIN_ALTURA_JSX = /\bmin-h-/;
const PATRON_ALTURA_ACOTADA_VH_JSX = /\b(?:h|max-h)-\[\d+(?:\.\d+)?vh\]/;

/**
 * Guard 17 (design.md `styling-guards` "legal-evidence guards get dedicated
 * verification", task 12.1), ported to JSX class names — the highest-stakes
 * single guard in this file, per its own dedicated verification pass rather
 * than batch treatment.
 *
 * `funcionalidades/revision/logica/puertaDeLectura.ts` distinguishes
 * "scrolled to the end" (`desplazado_al_final`) from "fits without
 * scrolling — confirmation pending" (`cabe_sin_desplazar_falta_confirmar`),
 * and that distinction IS the legal evidence that a comodante actually saw
 * what they signed. An iframe sized to its content (`h-auto`) or left
 * unbounded (any `min-h-*`, with or without a `vh` bound — `min-height`
 * lets content stretch the frame exactly like `height: auto` does) makes a
 * real two-page comodato fit without scrolling, which silently routes
 * every signing onto the weaker "confirmation pending" branch instead of
 * "scrolled to the end". So a bounded iframe MUST declare `h-[Nvh]` or
 * `max-h-[Nvh]` and MUST NOT declare `h-auto` or any `min-h-*` at all —
 * same three-part shape as the CSS-scoped predecessor
 * (`convencionesDeEstilos.spec.ts`'s `PATRON_ALTURA_ACOTADA_VH`), only the
 * input changes from a raw CSS declaration to a Tailwind arbitrary-value
 * utility.
 *
 * Stated over the whole tree, not scoped to `VisorDeDocumento` by name —
 * the same correction guard 15 needed after its `CabeceraDeSesion` gap
 * (PR11): an enumerated list only covers what someone thought to name, and
 * this scan instead protects any `<iframe>` this app ever renders, today or
 * later.
 */
export function tieneAlturaAcotadaVh(clases: string): boolean {
  if (PATRON_ALTURA_AUTO_JSX.test(clases)) {
    return false;
  }
  if (PATRON_MIN_ALTURA_JSX.test(clases)) {
    return false;
  }
  return PATRON_ALTURA_ACOTADA_VH_JSX.test(clases);
}

describe("guard 17: the document-viewer iframe stays bounded to an explicit vh fraction, never auto or unbounded (PR12, legal reading gate)", () => {
  it("rejects height sized to content — h-auto would let a real two-page comodato fit without scrolling", () => {
    expect(tieneAlturaAcotadaVh("h-auto w-full")).toBe(false);
  });

  it("rejects a bare min-h-* with no vh bound — an unbounded min-height stretches to content exactly like h-auto does", () => {
    expect(tieneAlturaAcotadaVh("min-h-64 w-full")).toBe(false);
  });

  it("rejects an arbitrary height value that is not a vh fraction — a fixed px height is not what this guard requires", () => {
    expect(tieneAlturaAcotadaVh("h-[400px] w-full")).toBe(false);
  });

  it("accepts an explicit vh-bounded height", () => {
    expect(tieneAlturaAcotadaVh("h-[45vh] w-full")).toBe(true);
  });

  it("accepts an explicit vh-bounded max-height", () => {
    expect(tieneAlturaAcotadaVh("max-h-[60vh] w-full")).toBe(true);
  });

  it("rejects every real <iframe> under apps/web/src whose className is not bounded to an explicit vh fraction", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    let iframesEncontrados = 0;

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      for (const coincidencia of contenido.matchAll(PATRON_IFRAME_CON_CLASE_JSX)) {
        iframesEncontrados += 1;
        const clases = coincidencia[1] ?? "";
        expect(
          tieneAlturaAcotadaVh(clases),
          `${rutaRelativa} renders an <iframe> ("${clases}") not bounded to an explicit vh fraction — an unbounded document viewer silently routes every reading onto the "confirmation pending" branch instead of "scrolled to the end" (funcionalidades/revision/logica/puertaDeLectura.ts)`,
        ).toBe(true);
      }
    }

    expect(
      iframesEncontrados,
      "no <iframe> found under apps/web/src — the legal reading gate this guard protects has disappeared or moved",
    ).toBeGreaterThanOrEqual(1);
  });
});

const PATRON_CANVAS_CON_CLASE_JSX = /<canvas\b[^>]*\bclassName="([^"]+)"/g;

/**
 * Guard 19 (task 13.1), static half — guard 17's `<iframe>` scan above,
 * ported to the signature canvas: an inline `height: 100%` canvas once
 * consumed its wrapper whole and pushed `Deshacer`/`Borrar` under the NEXT
 * document's iframe. Tree-wide, never scoped to `LienzoDeFirma` by name.
 * The RUNTIME half (`elementFromPoint`) has no jsdom equivalent and runs in
 * real Chrome at S3 in `scripts/geometriaHandheld.ts` (task 13.4/13.5).
 */
describe("guard 19: the signature canvas stays bounded to an explicit vh fraction, never auto or unbounded (PR13, legal-evidence composition, static half)", () => {
  it("rejects every real <canvas> under apps/web/src whose className is not bounded to an explicit vh fraction", () => {
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => ruta.endsWith(".tsx"));
    let canvasesEncontrados = 0;

    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      for (const coincidencia of contenido.matchAll(PATRON_CANVAS_CON_CLASE_JSX)) {
        canvasesEncontrados += 1;
        const clases = coincidencia[1] ?? "";
        expect(
          tieneAlturaAcotadaVh(clases),
          `${rutaRelativa} renders a <canvas> ("${clases}") not bounded to an explicit vh fraction — an unbounded signature canvas can consume its wrapper whole and push Deshacer/Borrar past it, letting the next document's iframe cover them (guard 19, elementFromPoint)`,
        ).toBe(true);
      }
    }

    expect(
      canvasesEncontrados,
      "no <canvas> found under apps/web/src — the signature canvas this guard protects has disappeared or moved",
    ).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Guard 2, final confirmation (task 14.1). PR6's compiled scan established
 * that Preflight's `[hidden]` rule is the ONE `!important display` rule in
 * the output. An `!important` declaration beats any normal-layer utility
 * regardless of order, so `block` beside the attribute is not a fight — the
 * retired `.escaner-de-mac__video` rule declared `display: block` for a
 * reason (an inline replaced element leaves a baseline gap below it). The
 * one silent break is swapping the ATTRIBUTE for Tailwind's `hidden` CLASS:
 * a plain `display: none` that any later `block`/`flex` utility or a `cn()`
 * merge reorders away. The first cut of this guard banned every display
 * utility and cost the `<video>` its `block`; narrowed at the gate.
 */
function usaLaClaseHiddenEnLugarDelAtributo(clases: string): boolean {
  return clases.split(/\s+/).includes("hidden");
}

describe("guard 2 (final confirmation, PR14): EscanerDeMac's camera-preview <video> is hidden by the ATTRIBUTE, never the class", () => {
  it("flags a className carrying the hidden utility class", () => {
    expect(usaLaClaseHiddenEnLugarDelAtributo("hidden w-full")).toBe(true);
  });

  it("does not flag a display utility — Preflight's !important attribute rule wins over it regardless of order", () => {
    expect(usaLaClaseHiddenEnLugarDelAtributo("block w-full max-h-[40vh]")).toBe(false);
  });

  it("EscanerDeMac's real camera-preview <video> carries the hidden ATTRIBUTE and never the hidden class", () => {
    const { getByLabelText, unmount } = render(
      createElement(EscanerDeMac, { valor: "", onCambiar: () => {}, comprobarDisponibilidad: () => Promise.resolve(false) }),
    );

    const video = getByLabelText("Vista de la cámara");
    expect(
      video.hasAttribute("hidden"),
      "EscanerDeMac's <video> is not hidden by the ATTRIBUTE while the preview is inactive",
    ).toBe(true);
    expect(
      usaLaClaseHiddenEnLugarDelAtributo(video.className),
      `EscanerDeMac's <video> className ("${video.className}") carries the hidden class — a plain display:none any later utility or cn() merge reorders away; the attribute is the mechanism`,
    ).toBe(false);
    unmount();
  });
});

/**
 * PR15 (slice F4) — `TablaDeContratos`, guard 20's primary target: the
 * component the enumerated-list defect originally slipped through (two real
 * 24px office links). One row fixture shared by guards 5/16/20's final
 * confirmation below.
 */
function filaDeContratoDeTabla(sobrescrituras: Partial<DatosContratoResumen> = {}): DatosContratoResumen {
  return {
    id: "c1",
    numero: 42,
    estado: "vigente",
    comodatario: { nombreCompleto: "Ana López", dni: "30.123.456" },
    fechaFirma: "2026-01-05",
    ...sobrescrituras,
  };
}

/**
 * Guard 5, final confirmation (task 15.1) — the CSS-scoped version required
 * NO ≥48px floor on table rows/cells at all: a row is not a target, and no
 * office contract-detail click destination exists for a whole-row handler
 * (R-3.5/R-3.8). Ported as a token ban rather than a positive assertion,
 * because the reflowed layout legitimately carries `block`/`w-full`/
 * `table-row` display tokens that must NOT be mistaken for a sizing attempt.
 */
const PATRON_TOKEN_DE_PISO_EN_TABLA = /\b(?:min-)?(?:h|w|size)-(?:toque|\d+)\b/;
const PATRON_CURSOR_POINTER_EN_TABLA = /\bcursor-pointer\b/;

describe("guard 5 (final, PR15): TablaDeContratos' rows/cells carry no touch-floor token and no cursor-pointer — a row is never a target (R-3.5/R-3.8)", () => {
  it("flags a fixture sizing token, in every shape the real scan must catch", () => {
    expect(PATRON_TOKEN_DE_PISO_EN_TABLA.test("min-h-toque")).toBe(true);
    expect(PATRON_TOKEN_DE_PISO_EN_TABLA.test("h-12")).toBe(true);
    expect(PATRON_TOKEN_DE_PISO_EN_TABLA.test("min-h-12")).toBe(true);
  });

  it("does not flag the layout-only tokens a reflowed row legitimately carries", () => {
    expect(PATRON_TOKEN_DE_PISO_EN_TABLA.test("block w-full tableta:table-row")).toBe(false);
  });

  it("rejects every real <tr>/<td>/<th> in TablaDeContratos whose className carries a sizing token or cursor-pointer", () => {
    const { container, unmount } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(TablaDeContratos, {
          contratos: [filaDeContratoDeTabla({ id: "c1" }), filaDeContratoDeTabla({ id: "c2" })],
        }),
      ),
    );

    const filasYCeldas = [...container.querySelectorAll<HTMLElement>("tr, td, th")];
    expect(filasYCeldas.length, "no <tr>/<td>/<th> found in TablaDeContratos — the scan went vacuous").toBeGreaterThan(0);

    for (const elemento of filasYCeldas) {
      const clases = elemento.className;
      expect(
        PATRON_TOKEN_DE_PISO_EN_TABLA.test(clases),
        `<${elemento.tagName.toLowerCase()}> carries a >=48px sizing token — a row/cell is never a target (guard 5): "${clases}"`,
      ).toBe(false);
      expect(
        PATRON_CURSOR_POINTER_EN_TABLA.test(clases),
        `<${elemento.tagName.toLowerCase()}> carries cursor-pointer — a row/cell must never look clickable (guard 5): "${clases}"`,
      ).toBe(false);
    }

    unmount();
  });
});

/**
 * Guard 16, final confirmation (task 15.3) — the narrow-layout `thead`
 * displacement recipe (`panel.css:254-263`) ported as utilities: an
 * absolutely-positioned 1px box at a large negative `left`, restored to a
 * static `table-header-group` at `tableta`. Never the `sr-only` token, never
 * an `overflow-hidden`/`overflow-clip` token — that recipe once widened the
 * document to a measured 492px at 360px, because it clips PIXELS while
 * leaving LAYOUT untouched (design.md D3).
 */
describe("guard 16 (final, PR15): TablaDeContratos' thead stays in the accessibility tree, displaced off-screen below tableta, restored as a real header at tableta (D3/D12)", () => {
  it("displaces the header off-screen with a 1px box below tableta, and restores it as a static table-header-group at tableta", () => {
    const { container, unmount } = render(
      createElement(MemoryRouter, null, createElement(TablaDeContratos, { contratos: [filaDeContratoDeTabla()] })),
    );

    const thead = container.querySelector("thead");
    expect(thead, "no <thead> found in TablaDeContratos").not.toBeNull();
    const clases = thead?.className ?? "";

    expect(clases, `thead className: "${clases}"`).toMatch(/\babsolute\b/);
    expect(clases, `thead className: "${clases}"`).toMatch(/-left-\[10000px\]/);
    expect(clases, `thead className: "${clases}"`).toMatch(/\bh-px\b/);
    expect(clases, `thead className: "${clases}"`).toMatch(/\bw-px\b/);
    expect(clases, `thead className: "${clases}"`).toMatch(/\bwhitespace-nowrap\b/);
    expect(clases, `thead className: "${clases}"`).toMatch(/\btableta:static\b/);
    expect(clases, `thead className: "${clases}"`).toMatch(/\btableta:table-header-group\b/);

    unmount();
  });

  it("carries no sr-only token and no overflow-hidden/overflow-clip token anywhere in its rendered classNames", () => {
    const { container, unmount } = render(
      createElement(MemoryRouter, null, createElement(TablaDeContratos, { contratos: [filaDeContratoDeTabla()] })),
    );

    const clasesCompletas = [...container.querySelectorAll<HTMLElement>("*")].map((elemento) => elemento.className).join(" ");
    expect(clasesCompletas).not.toMatch(/\bsr-only\b/);
    expect(clasesCompletas).not.toMatch(/\boverflow-hidden\b/);
    expect(clasesCompletas).not.toMatch(/\boverflow-clip\b/);

    unmount();
  });
});

/**
 * Guard 20, primary-target confirmation (task 15.2) — the component the
 * original enumerated-list engine let two real 24px office links through.
 * The row link is the one real target per row; the `<tr>` itself carries a
 * hover tint at `tableta` (mouse-only affordance separating a name from its
 * estado on a wide row) which makes it register as interactive under D5's
 * `hover:`-variant heuristic without being a target — the same shape the
 * retired CSS engine recorded in its own `EXENCIONES` for
 * `.tabla-de-contratos tbody tr`, carried forward here by name.
 */
function elementoDeExencionDeTabla(elemento: HTMLElement): string {
  const etiqueta = elemento.tagName.toLowerCase();
  if (etiqueta === "tr" && elemento.closest("tbody") !== null) return "tbody tr";
  if (etiqueta === "div" && elemento.getAttribute("role") === "region") return "desplazamiento";
  return etiqueta;
}

describe("guard 20 (final, PR15): TablaDeContratos' primary target — every genuinely interactive control meets the floor, the recorded row exemption holds (D5)", () => {
  it("clears every non-exempt interactive control, and every EXENCIONES entry corresponds to a real scanned candidate", () => {
    const { container, unmount } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(TablaDeContratos, {
          contratos: [filaDeContratoDeTabla({ id: "c1" }), filaDeContratoDeTabla({ id: "c2" })],
        }),
      ),
    );

    const controles = controlesInteractivosDe(container);
    const corpus: CandidatoDeExencion[] = controles.map((elemento) => ({
      componente: "TablaDeContratos",
      elemento: elementoDeExencionDeTabla(elemento),
    }));

    expect(
      exencionesSinCorrespondencia(EXENCIONES, corpus),
      "EXENCIONES names a component+element pair this scan never found in TablaDeContratos — a stale exemption",
    ).toEqual([]);

    let noExentosVistos = 0;
    for (const elemento of controles) {
      const clave = elementoDeExencionDeTabla(elemento);
      if (esExento("TablaDeContratos", clave)) continue;
      noExentosVistos += 1;
      const mensaje = `<${elemento.tagName.toLowerCase()}> inside TablaDeContratos fails guard 20's touch floor: "${elemento.className}"`;
      expect(cumplePisoVertical(elemento.className) && cumplePisoHorizontal(elemento.className), mensaje).toBe(true);
    }

    expect(noExentosVistos, "no non-exempt interactive control found in TablaDeContratos — the scan went vacuous").toBeGreaterThan(0);
    unmount();
  });

  it("records both of TablaDeContratos' exemptions by name, matching the two fixtures the CSS engine's EXENCIONES entries were ported from", () => {
    const elementosExentos = EXENCIONES.filter((exencion) => exencion.componente === "TablaDeContratos").map(
      (exencion) => exencion.elemento,
    );
    expect(elementosExentos, "expected the row and scroll-region exemptions ported from the CSS engine").toEqual(
      expect.arrayContaining(["tbody tr", "desplazamiento"]),
    );
  });
});

/**
 * Guard endpoint for PR16 task 16.1 (design.md's Phase 16 preamble, D2) —
 * `componentes/plantillas/` must carry zero hand-authored BEM classNames.
 * "Hand-authored BEM class" is defined structurally, never lexically: a
 * naive shape-based regex would flag `block`, `flex-1`, `min-h-full` as BEM
 * just as readily as `layout-panel__contenido`. Instead, the banned set is
 * every class token that STILL appears as a real CSS selector in the frozen
 * hand-authored sheets under `estilos/*.css` — every sheet except the
 * Tailwind entry point, identified by its own `@import "tailwindcss"`
 * rather than by filename, so the set stays correct as sheets are deleted
 * through the rest of this migration (PR19). PR18's whole-tree assertion
 * reuses `clasesBemDeclaradas`/`clasesBemEnArchivo` unchanged, only
 * widening the scanned directory prefix.
 */
function quitarComentariosCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function esPuntoDeEntradaTailwind(contenidoCss: string): boolean {
  return /@import\s+["']tailwindcss["']/.test(contenidoCss);
}

/** Every class token declared as a real selector (never inside a rule's body) in one stylesheet. */
export function clasesDeclaradasComoSelector(cssSinComentarios: string): ReadonlySet<string> {
  const clases = new Set<string>();
  const textosDeSelector = cssSinComentarios.match(/[^{}]+(?=\{)/g) ?? [];
  for (const selector of textosDeSelector) {
    for (const coincidencia of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      const clase = coincidencia[1];
      if (clase !== undefined) clases.add(clase);
    }
  }
  return clases;
}

/** Every class token declared in every hand-authored `estilos/*.css` sheet, Tailwind entry excluded. */
export function clasesBemDeclaradas(): ReadonlySet<string> {
  const clases = new Set<string>();
  for (const nombre of readdirSync(DIRECTORIO_ESTILOS)) {
    if (!nombre.endsWith(".css")) continue;
    // Comments first: `base.css` names the Tailwind import in prose (PR17's gate).
    const contenido = quitarComentariosCss(readFileSync(join(DIRECTORIO_ESTILOS, nombre), "utf8"));
    if (esPuntoDeEntradaTailwind(contenido)) continue;
    for (const clase of clasesDeclaradasComoSelector(contenido)) {
      clases.add(clase);
    }
  }
  return clases;
}

/** Block, line and JSX comments go first, so prose naming a retired class never counts as a usage. */
function quitarComentariosTsx(contenidoTsx: string): string {
  return contenidoTsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const PATRON_LITERAL_DE_CADENA = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/**
 * Every hand-authored BEM class token ANY string literal in a `.tsx` file
 * carries — not only `className="…"`. `TablaDeContratos` (PR15) keeps its
 * class lists in `const CLASE_* = "…"` and passes them as `className={…}`,
 * and `cn("…")` arguments are strings too; a scan of the attribute alone
 * was proven blind to `const CLASE_LEGADA = "layout-tecnico"` at PR16's
 * gate. Splitting on whitespace keeps `[data-layout-panel]` and
 * `.layout-panel` selectors in specs from matching the bare token.
 */
export function clasesBemEnArchivo(contenidoTsx: string, clasesBem: ReadonlySet<string>): readonly string[] {
  const encontradas = new Set<string>();
  for (const coincidencia of quitarComentariosTsx(contenidoTsx).matchAll(PATRON_LITERAL_DE_CADENA)) {
    const valor = coincidencia[1] ?? coincidencia[2] ?? coincidencia[3] ?? "";
    for (const token of valor.split(/\s+/).filter(Boolean)) {
      if (clasesBem.has(token)) encontradas.add(token);
    }
  }
  return [...encontradas];
}

describe("guard endpoint (task 16.1, D2): componentes/plantillas/ carries no hand-authored BEM className", () => {
  const PREFIJO_PLANTILLAS = "componentes/plantillas/";

  it("finds a non-trivial set of banned BEM class tokens in the frozen hand-authored sheets", () => {
    // Anti-rot floor on the CSS side: if this ever goes to (near) zero
    // before the sheets are actually deleted (PR19), the scan below would
    // pass vacuously against real BEM markup.
    expect(clasesBemDeclaradas().size).toBeGreaterThan(3);
  });

  it("rejects every real .tsx file under componentes/plantillas/ that carries a hand-authored BEM className", () => {
    const clasesBem = clasesBemDeclaradas();
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter(({ ruta }) => {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      return rutaRelativa.startsWith(PREFIJO_PLANTILLAS) && rutaRelativa.endsWith(".tsx");
    });
    expect(fuentes.length, "no .tsx files found under componentes/plantillas/ — the scan matched nothing").toBeGreaterThan(0);

    const ofensores: string[] = [];
    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      const encontradas = clasesBemEnArchivo(contenido, clasesBem);
      if (encontradas.length > 0) {
        ofensores.push(`${rutaRelativa}: ${encontradas.join(", ")}`);
      }
    }

    expect(ofensores, `hand-authored BEM className found under componentes/plantillas/ — ${ofensores.join(" | ")}`).toEqual([]);
  });
});

/**
 * PR17 (Phase 17, D2/D4/D5) — the técnico half of the four office organisms
 * disclosed by PR11's inventory gap: `FormularioComodatario`/`FormularioEquipos`
 * (arm's-length-in-sunlight) plus `PaginaLogin`, which shares their retired
 * `.formulario` shape. `DetalleDeContrato`/`AccionesDeContrato` (office
 * panel) are deferred to PR17b — a faithful conversion of all four plus the
 * shared shape did not fit the 400-line review budget in one PR.
 */
const VALORES_COMODATARIO_VACIOS: ValoresComodatario = {
  nombreCompleto: "",
  dni: "",
  domicilioCalle: "",
  ciudad: "",
  whatsapp: "",
};
const VALORES_EQUIPOS_VACIOS: ValoresEquipos = { antenaModelo: "", antenaMac: "", poe: undefined, canoMetros: "" };

/**
 * Every non-exempt interactive control inside `contenedor` meets guard 20's
 * floor — native radio/checkbox controls resolved against base.css's
 * `@layer base` rule (`esControlNativoDeToque`, D5) are skipped rather than
 * flagged for carrying no Tailwind sizing class.
 */
function esperaControlesDelPanelEnElPiso(contenedor: HTMLElement, componente: string): void {
  const controles = controlesInteractivosDe(contenedor);
  let noExentosVistos = 0;
  for (const elemento of controles) {
    const tipoNativo = elemento instanceof HTMLInputElement ? elemento.type : undefined;
    if (esControlNativoDeToque(elemento.tagName.toLowerCase(), tipoNativo, elemento.className)) continue;
    noExentosVistos += 1;
    const mensaje = `<${elemento.tagName.toLowerCase()}> inside ${componente} fails guard 20's touch floor: "${elemento.className}"`;
    expect(cumplePisoVertical(elemento.className) && cumplePisoHorizontal(elemento.className), mensaje).toBe(true);
  }
  expect(noExentosVistos, `no non-exempt interactive control found in ${componente} — the scan went vacuous`).toBeGreaterThan(0);
}

describe("guard 20 (PR17, task 17.1a): the técnico organisms meet the touch floor on every non-exempt interactive control (D5)", () => {
  // `esControlNativoDeToque` trusts one stylesheet rule; a guard that trusts
  // a rule must watch it — deleted, every radio would still "pass" here.
  it("anchors esControlNativoDeToque: a hand-authored sheet still sizes native radio/checkbox controls to the touch token", () => {
    const hojas = readdirSync(DIRECTORIO_ESTILOS)
      .filter((nombre) => nombre.endsWith(".css"))
      .map((nombre) => quitarComentariosCss(readFileSync(join(DIRECTORIO_ESTILOS, nombre), "utf8")));
    const reglas = hojas.flatMap((css) => css.match(/[^{}]+\{[^}]*\}/g) ?? []);
    const reglaNativa = reglas.find(
      (regla) =>
        /input\[type="radio"\]/.test(regla) &&
        /input\[type="checkbox"\]/.test(regla) &&
        /\bwidth\s*:\s*var\(--tamano-toque-minimo\)/.test(regla) &&
        /\bheight\s*:\s*var\(--tamano-toque-minimo\)/.test(regla),
    );
    expect(
      reglaNativa,
      "no sheet sizes input[type=radio]/input[type=checkbox] to var(--tamano-toque-minimo) any more — esControlNativoDeToque now exempts controls nothing sizes",
    ).toBeDefined();
  });

  it("clears FormularioComodatario's real rendered controls", () => {
    const { container, unmount } = render(
      createElement(FormularioComodatario, {
        valores: VALORES_COMODATARIO_VACIOS,
        onCambiar: () => {},
        onContinuar: () => {},
        error: null,
        deshabilitado: false,
      }),
    );
    esperaControlesDelPanelEnElPiso(container, "FormularioComodatario");
    unmount();
  });

  it("clears FormularioEquipos' real rendered controls, its native radios resolved against base.css's @layer base rule", async () => {
    const { container, unmount } = render(
      createElement(FormularioEquipos, {
        valores: VALORES_EQUIPOS_VACIOS,
        onCambiar: () => {},
        onCambiarPoe: () => {},
        onVolver: () => {},
        onEnviar: () => {},
        etiquetaEnvio: "Crear borrador",
        error: null,
        deshabilitado: false,
      }),
    );
    await act(async () => {});
    esperaControlesDelPanelEnElPiso(container, "FormularioEquipos");
    unmount();
  });
});

/**
 * Guard 20 (PR17b, task 17b.1): the office half of the panel D5 confirms —
 * `DetalleDeContrato`'s document downloads and `AccionesDeContrato`'s both
 * states (the actions row AND the confirmation form it opens into, since
 * they never render simultaneously).
 */
describe("guard 20 (PR17b, task 17b.1): the office organisms meet the touch floor on every non-exempt interactive control (D5)", () => {
  it("clears DetalleDeContrato's real rendered controls", () => {
    const { container, unmount } = render(
      createElement(DetalleDeContrato, { contrato: contratoOficinaFixture(), onDescargar: () => {} }),
    );
    esperaControlesDelPanelEnElPiso(container, "DetalleDeContrato");
    unmount();
  });

  it("clears AccionesDeContrato's real rendered controls, both the actions row and its confirmation form", () => {
    const { container, getByRole, unmount } = render(
      createElement(AccionesDeContrato, {
        contrato: contratoOficinaFixture(),
        onDarDeBaja: () => {},
        onAnular: () => {},
        onRegistrarRestitucion: () => {},
      }),
    );
    esperaControlesDelPanelEnElPiso(container, "AccionesDeContrato (actions)");

    fireEvent.click(getByRole("button", { name: "Dar de baja" }));
    esperaControlesDelPanelEnElPiso(container, "AccionesDeContrato (confirmation form)");
    unmount();
  });
});

/**
 * Guard 8, técnico component-level confirmation (task 17.1b, D4) — the path
 * axis (`PREFIJOS_RUTA_PANEL`, above) exempts `componentes/organismos/`
 * wholesale, which blinds it to `FormularioComodatario`/`FormularioEquipos`:
 * técnico screens are read at arm's length in direct sunlight, the opposite
 * of the office-panel assumption the axis encodes. Real converted markup
 * carries no sub-1rem attempt at all, so this is a regression floor proven
 * genuinely RED by falsification (`text-sm` injected into the real files,
 * both before and after the redesign) rather than by an inert pre-redesign
 * pass — the same methodology PR16's guard 8 px-blindness probe used.
 */
describe("guard 8 (técnico organisms, task 17.1b, D4): FormularioComodatario/FormularioEquipos attempt no sub-1rem type despite the path axis exempting componentes/organismos/", () => {
  it("finds zero sub-1rem attempts in FormularioComodatario's real rendered markup", () => {
    const { container, unmount } = render(
      createElement(FormularioComodatario, {
        valores: VALORES_COMODATARIO_VACIOS,
        onCambiar: () => {},
        onContinuar: () => {},
        error: null,
        deshabilitado: false,
      }),
    );
    for (const elemento of [...container.querySelectorAll<HTMLElement>("*")]) {
      expect(
        tamanosDeTextoBajoElPiso(elemento.className),
        `<${elemento.tagName.toLowerCase()}> in FormularioComodatario attempts sub-1rem type (design.md D4) — read at arm's length in direct sunlight: "${elemento.className}"`,
      ).toEqual([]);
    }
    unmount();
  });

  it("finds zero sub-1rem attempts in FormularioEquipos' real rendered markup", async () => {
    const { container, unmount } = render(
      createElement(FormularioEquipos, {
        valores: VALORES_EQUIPOS_VACIOS,
        onCambiar: () => {},
        onCambiarPoe: () => {},
        onVolver: () => {},
        onEnviar: () => {},
        etiquetaEnvio: "Crear borrador",
        error: null,
        deshabilitado: false,
      }),
    );
    await act(async () => {});
    for (const elemento of [...container.querySelectorAll<HTMLElement>("*")]) {
      expect(
        tamanosDeTextoBajoElPiso(elemento.className),
        `<${elemento.tagName.toLowerCase()}> in FormularioEquipos attempts sub-1rem type (design.md D4) — read at arm's length in direct sunlight: "${elemento.className}"`,
      ).toEqual([]);
    }
    unmount();
  });
});

/**
 * Guard endpoint (task 17.1c/17b.1, D2) — the técnico organisms + `PaginaLogin`
 * (which shares the retired `.formulario` shape) carry zero hand-authored
 * BEM classNames, same mechanism as PR16's `componentes/plantillas/` block
 * above, over an explicit file list instead of a directory prefix.
 * PR17b widens the list to the office pair, `DetalleDeContrato`/
 * `AccionesDeContrato`, rather than writing a fourth scan.
 */
describe("guard endpoint (task 17.1c/17b.1, D2): the técnico organisms + PaginaLogin + the office organisms carry no hand-authored BEM className", () => {
  const RUTAS_OBJETIVO = [
    "componentes/organismos/FormularioComodatario.tsx",
    "componentes/organismos/FormularioEquipos.tsx",
    "funcionalidades/auth/contenedores/PaginaLogin.tsx",
    "componentes/organismos/DetalleDeContrato.tsx",
    "componentes/organismos/AccionesDeContrato.tsx",
  ];

  it("rejects every real .tsx file among the técnico organisms, PaginaLogin and the office organisms that carries a hand-authored BEM className", () => {
    const clasesBem = clasesBemDeclaradas();
    const fuentes = archivosFuente(DIRECTORIO_SRC).filter((archivo) =>
      RUTAS_OBJETIVO.includes(relative(DIRECTORIO_SRC, archivo.ruta).replaceAll("\\", "/")),
    );
    expect(fuentes.length, "expected exactly 5 target files — the scan matched a different set").toBe(RUTAS_OBJETIVO.length);

    const ofensores: string[] = [];
    for (const { ruta, contenido } of fuentes) {
      const rutaRelativa = relative(DIRECTORIO_SRC, ruta).replaceAll("\\", "/");
      const encontradas = clasesBemEnArchivo(contenido, clasesBem);
      if (encontradas.length > 0) {
        ofensores.push(`${rutaRelativa}: ${encontradas.join(", ")}`);
      }
    }

    expect(ofensores, `hand-authored BEM className found — ${ofensores.join(" | ")}`).toEqual([]);
  });
});
