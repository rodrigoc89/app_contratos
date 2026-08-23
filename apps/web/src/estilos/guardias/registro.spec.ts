import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  erroresDeArchivoCss,
  erroresDeCompletitud,
  erroresDeDisposicion,
  erroresDePorque,
  erroresDePruebas,
  REGISTRO,
  type EntradaDeRegistro,
} from "./registro";

/**
 * design.md D2 — the register is the third guard-endpoint piece, closing
 * the hole neither `convencionesDeEstilos.spec.ts` (CSS) nor
 * `convencionesDeUtilidades.spec.ts`/`convencionesDeCompilado.compilado.spec.ts`
 * (JSX/compiled) can see alone: a protection that LEFT one scanner and never
 * ARRIVED in the other. `styling-guards` spec's four register assertions
 * are tested individually below, against real files first, then against
 * fixtures that each falsify a naive "always valid" stub — the tasks.md
 * preamble's explicit requirement for this, the dist ceiling, and the
 * handheld harness: the three "passes by doing nothing" mechanisms.
 */

const DIRECTORIO_GUARDIAS = dirname(fileURLToPath(import.meta.url));
const DIRECTORIO_SRC = join(DIRECTORIO_GUARDIAS, "..", "..");

function leerArchivoReal(rutaRelativa: string): string | undefined {
  try {
    return readFileSync(join(DIRECTORIO_SRC, rutaRelativa), "utf8");
  } catch {
    return undefined;
  }
}

function existeArchivoReal(rutaRelativa: string): boolean {
  try {
    return statSync(join(DIRECTORIO_SRC, rutaRelativa)).isFile();
  } catch {
    return false;
  }
}

describe("the disposition register is complete (styling-guards)", () => {
  it("has exactly 21 entries, numbered 1-21 with no gaps", () => {
    expect(erroresDeCompletitud(REGISTRO)).toEqual([]);
    expect(REGISTRO).toHaveLength(21);
  });

  it("never leaves a disposition blank, TBD, or the retired REBUILD value", () => {
    expect(erroresDeDisposicion(REGISTRO)).toEqual([]);
  });

  it("names an it(...) title that is actually present in its owning spec file, for every CSS/JSX/AMBOS entry", () => {
    expect(erroresDePruebas(REGISTRO, leerArchivoReal)).toEqual([]);
  });

  it("names a src/estilos/*.css file that still exists, for every CSS/AMBOS entry", () => {
    expect(erroresDeArchivoCss(REGISTRO, existeArchivoReal)).toEqual([]);
  });

  it("gives every MOOT/RESUELTA entry a non-empty porque", () => {
    expect(erroresDePorque(REGISTRO)).toEqual([]);
  });
});

describe("the register validator catches a deleted guard, not an absent one (falsification, task 3.2)", () => {
  const TITULO_FICTICIO = "protects the fixture from regressing";
  const ARCHIVO_FICTICIO = "estilos/convencionesDeUtilidades.fixture.spec.ts";
  const CONTENIDO_SIN_LA_PRUEBA = 'it("a completely different test", () => { expect(true).toBe(true); });';

  const ENTRADA_CON_GUARDIA_BORRADA: EntradaDeRegistro = {
    numero: 1,
    protege: "fixture guard used only by this falsification test",
    disposicion: "JSX",
    pruebas: [{ archivo: ARCHIVO_FICTICIO, titulo: TITULO_FICTICIO }],
  };

  it("[naive-stub falsification] a stub validator that always returns valid does not catch the deleted guard", () => {
    // Proves the fixture is non-vacuous first: the title really is absent
    // from the fixture file's content below.
    expect(CONTENIDO_SIN_LA_PRUEBA).not.toContain(TITULO_FICTICIO);

    const stubSiempreValido = (_registro: readonly EntradaDeRegistro[]): string[] => [];
    expect(stubSiempreValido([ENTRADA_CON_GUARDIA_BORRADA])).toEqual([]);
  });

  it("fails when a JSX-dispositioned entry's it(...) title is absent from its named spec file", () => {
    const errores = erroresDePruebas([ENTRADA_CON_GUARDIA_BORRADA], (ruta) =>
      ruta === ARCHIVO_FICTICIO ? CONTENIDO_SIN_LA_PRUEBA : undefined,
    );

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain(TITULO_FICTICIO);
  });
});

describe("the register validator catches a dangling CSS reference, not an absent one (falsification, task 3.3)", () => {
  const ARCHIVO_CSS_BORRADO = "estilos/eliminado-en-este-fixture.css";

  const ENTRADA_CON_CSS_BORRADO: EntradaDeRegistro = {
    numero: 1,
    protege: "fixture guard used only by this falsification test",
    disposicion: "CSS",
    archivoCss: ARCHIVO_CSS_BORRADO,
    pruebas: [{ archivo: "estilos/convencionesDeEstilos.spec.ts", titulo: "fixture title, not checked here" }],
  };

  it("[naive-stub falsification] a stub validator that always returns valid does not catch the dangling reference", () => {
    // Proves the fixture is non-vacuous first: the file really does not
    // exist on disk.
    expect(existeArchivoReal(ARCHIVO_CSS_BORRADO)).toBe(false);

    const stubSiempreValido = (_registro: readonly EntradaDeRegistro[]): string[] => [];
    expect(stubSiempreValido([ENTRADA_CON_CSS_BORRADO])).toEqual([]);
  });

  it("fails when a CSS-dispositioned entry names a src/estilos/*.css file that no longer exists", () => {
    const errores = erroresDeArchivoCss([ENTRADA_CON_CSS_BORRADO], existeArchivoReal);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain(ARCHIVO_CSS_BORRADO);
  });
});
