import { describe, expect, it } from "vitest";

import { NOMBRE_APP, tituloDeDocumento } from "./tituloDeDocumento";

/**
 * DESIGN.md D3 — the title composition is a pure function, no React, no
 * DOM, so `useMatches()`'s output can be tested as plain data: an ordered
 * array of `handle` values, root first, leaf (deepest match) last.
 */
describe("tituloDeDocumento", () => {
  it("uses the deepest match's string handle.titulo, ignoring a shallower one", () => {
    const manejadores = [{ titulo: "Raíz" }, { titulo: "Listado" }];

    expect(tituloDeDocumento(manejadores)).toBe(`Listado · ${NOMBRE_APP}`);
  });

  it("falls back to the bare app name when no match declares a titulo", () => {
    const manejadores = [{}, undefined, { otraCosa: "Contratos" }];

    expect(tituloDeDocumento(manejadores)).toBe(NOMBRE_APP);
  });

  it("skips a malformed handle instead of throwing — a non-object and a non-string titulo", () => {
    const manejadores = ["no soy un objeto", { titulo: 42 }, { titulo: "Ingresar" }];

    expect(tituloDeDocumento(manejadores)).toBe(`Ingresar · ${NOMBRE_APP}`);
  });
});
