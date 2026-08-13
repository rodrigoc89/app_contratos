import { describe, expect, it } from "vitest";

import { clavesDeContratos } from "./clavesDeContratos";

/**
 * R-4.2 — no call site may write a query-key string literal. Keys come from
 * this factory and are hierarchical: `.todo` invalidates everything
 * contract-related, `.lista(filtros)` invalidates one list shape.
 */
describe("clavesDeContratos", () => {
  it("builds a hierarchical, parameterized key for a list page", () => {
    const clave = clavesDeContratos.lista({
      termino: "perez",
      estados: ["vigente"],
      pagina: 1,
      tamanoPagina: 20,
    });

    expect(clave).toEqual([
      "contratos",
      "lista",
      { termino: "perez", estados: ["vigente"], pagina: 1, tamanoPagina: 20 },
    ]);
  });

  it("produces different keys for different pages", () => {
    const filtrosBase = { termino: "", estados: [], tamanoPagina: 20 };

    const clavePagina1 = clavesDeContratos.lista({ ...filtrosBase, pagina: 1 });
    const clavePagina2 = clavesDeContratos.lista({ ...filtrosBase, pagina: 2 });

    expect(clavePagina1).not.toEqual(clavePagina2);
  });

  it("exposes a root key that scopes every contract-list key beneath it", () => {
    const clave = clavesDeContratos.lista({ termino: "", estados: [], pagina: 1, tamanoPagina: 20 });

    expect(clavesDeContratos.todo).toEqual(["contratos"]);
    expect(clave.slice(0, 1)).toEqual(clavesDeContratos.todo);
  });
});
