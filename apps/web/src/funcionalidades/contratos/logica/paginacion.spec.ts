import { describe, expect, it } from "vitest";

import { hayPaginaAnterior, haySiguientePagina, totalPaginas } from "./paginacion";

/**
 * R-3.9 — the one pure place the off-by-one arithmetic lives. `Paginador`
 * and `PaginaListaContratos` both read these instead of each recomputing
 * "am I on the last page" independently.
 */
describe("totalPaginas", () => {
  it("is 0 for zero results — the signal that renders no pagination at all", () => {
    expect(totalPaginas(0, 20)).toBe(0);
  });

  it("is 1 when every result fits on the first page", () => {
    expect(totalPaginas(5, 20)).toBe(1);
    expect(totalPaginas(20, 20)).toBe(1);
  });

  it("rounds up a partial last page", () => {
    expect(totalPaginas(25, 20)).toBe(2);
    expect(totalPaginas(21, 20)).toBe(2);
  });
});

describe("hayPaginaAnterior", () => {
  it("is false on the first page", () => {
    expect(hayPaginaAnterior(1)).toBe(false);
  });

  it("is true on any later page", () => {
    expect(hayPaginaAnterior(2)).toBe(true);
  });
});

describe("haySiguientePagina", () => {
  it("is true when the current page is not the last", () => {
    expect(haySiguientePagina(1, 25, 20)).toBe(true);
  });

  it("is false on the last page", () => {
    expect(haySiguientePagina(2, 25, 20)).toBe(false);
  });

  it("is false when there is only a single page", () => {
    expect(haySiguientePagina(1, 5, 20)).toBe(false);
  });

  it("is false with zero results", () => {
    expect(haySiguientePagina(1, 0, 20)).toBe(false);
  });
});
