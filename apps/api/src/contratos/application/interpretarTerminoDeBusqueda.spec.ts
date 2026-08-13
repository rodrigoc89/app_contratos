import { describe, expect, it } from "vitest";

import { interpretarTerminoDeBusqueda } from "./interpretarTerminoDeBusqueda";

/** R-1.4: one term, dispatched to exactly one query. */
describe("interpretarTerminoDeBusqueda", () => {
  it("reads dotted, undotted and spaced DNIs as the same dni term", () => {
    for (const termino of ["30.123.456", "30123456", "30 123 456"]) {
      expect(interpretarTerminoDeBusqueda(termino)).toEqual({
        tipo: "dni",
        digitos: "30123456",
      });
    }
  });

  it("reads a partial DNI as a dni term", () => {
    expect(interpretarTerminoDeBusqueda("30123")).toEqual({
      tipo: "dni",
      digitos: "30123",
    });
  });

  it("never reads a name as a dni term", () => {
    expect(interpretarTerminoDeBusqueda("Peña")).toEqual({
      tipo: "nombre",
      normalizado: "peña",
    });
  });

  it("reads a hyphenated number as a name, not a dni — no stored DNI can carry a dash", () => {
    expect(interpretarTerminoDeBusqueda("30-123-456")).toEqual({
      tipo: "nombre",
      normalizado: "30-123-456",
    });
  });

  it("reads a blank term as no filter at all", () => {
    expect(interpretarTerminoDeBusqueda("")).toBeNull();
    expect(interpretarTerminoDeBusqueda("   ")).toBeNull();
  });

  /**
   * D5: Prisma's `contains` forwards `%` and `_` to Postgres `LIKE` as live
   * wildcards, while the in-memory double's `String.includes` treats them
   * literally. Stripping them here — once, before either adapter sees the
   * term — is what keeps the two implementations from disagreeing on the
   * same input.
   */
  describe("D5 — wildcard characters never reach a name search", () => {
    it("strips % from a name term", () => {
      expect(interpretarTerminoDeBusqueda("a%z")).toEqual({
        tipo: "nombre",
        normalizado: "az",
      });
    });

    it("strips _ from a name term", () => {
      expect(interpretarTerminoDeBusqueda("a_z")).toEqual({
        tipo: "nombre",
        normalizado: "az",
      });
    });

    it("strips a backslash from a name term", () => {
      expect(interpretarTerminoDeBusqueda("a\\z")).toEqual({
        tipo: "nombre",
        normalizado: "az",
      });
    });

    it("treats a term that is only wildcard characters as blank", () => {
      expect(interpretarTerminoDeBusqueda("%%%")).toBeNull();
    });

    it("never lets a digits-only DNI term reach the wildcard strip — it is inherently safe", () => {
      expect(interpretarTerminoDeBusqueda("30123456")).toEqual({
        tipo: "dni",
        digitos: "30123456",
      });
    });
  });
});
