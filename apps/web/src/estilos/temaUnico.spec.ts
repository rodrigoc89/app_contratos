import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * design-system-migration PR1 (design-system-foundation: "single-theme
 * policy — no dark variant") — `shadcn init`'s own scaffold output (run
 * during this PR) injected a `.dark { … }` block and a
 * `@custom-variant dark (&:is(.dark *));` rule into `estilos/index.css`;
 * both were deleted before `tema.css` landed. Same convention as
 * `convencionesDeEstilos.spec.ts`: inline text-level scan, since jsdom
 * performs no layout and no real build runs in this suite.
 */
const DIRECTORIO_ESTILOS = dirname(fileURLToPath(import.meta.url));
const DIRECTORIO_WEB = join(DIRECTORIO_ESTILOS, "..", "..");

function leerEstilo(nombreArchivo: string): string {
  return readFileSync(join(DIRECTORIO_ESTILOS, nombreArchivo), "utf8");
}

function tieneBloqueDark(cssTexto: string): boolean {
  return /(?:^|[\s};])\.dark\s*\{/.test(cssTexto);
}

function tieneCustomVariantDark(cssTexto: string): boolean {
  return /@custom-variant\s+dark\b/.test(cssTexto);
}

/** Reproduces shadcn's exact injected snippet (trimmed) — proves the scan
 *  catches a real historical violation, not only the already-clean repo. */
const FIXTURE_SALIDA_SHADCN = `
@custom-variant dark (&:is(.dark *));
.dark {
  --background: oklch(0.145 0 0);
}
`;

describe("single-theme policy — no dark variant (design-system-foundation)", () => {
  it("flags both artifacts on a fixture reproducing shadcn's scaffold output", () => {
    expect(tieneBloqueDark(FIXTURE_SALIDA_SHADCN)).toBe(true);
    expect(tieneCustomVariantDark(FIXTURE_SALIDA_SHADCN)).toBe(true);
  });

  it("reports neither artifact on CSS that only sets color-scheme: light", () => {
    const limpio = ":root { color-scheme: light; }\n.darkroom { color: red; }";
    expect(tieneBloqueDark(limpio)).toBe(false);
    expect(tieneCustomVariantDark(limpio)).toBe(false);
  });

  it("reports no dark-mode artifacts on the real shipped stylesheets", () => {
    for (const archivo of ["tema.css", "index.css"]) {
      const contenido = leerEstilo(archivo);
      expect(tieneBloqueDark(contenido), archivo).toBe(false);
      expect(tieneCustomVariantDark(contenido), archivo).toBe(false);
    }
  });

  it("keeps color-scheme: light declared verbatim in tema.css", () => {
    expect(/color-scheme\s*:\s*light\s*;/.test(leerEstilo("tema.css"))).toBe(true);
  });

  it("keeps next-themes absent from apps/web's dependencies", () => {
    const paquete = JSON.parse(
      readFileSync(join(DIRECTORIO_WEB, "package.json"), "utf8"),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
    };

    expect(paquete.dependencies?.["next-themes"]).toBeUndefined();
    expect(paquete.devDependencies?.["next-themes"]).toBeUndefined();
  });
});
