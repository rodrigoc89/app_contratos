import { describe, expect, it } from "vitest";

import { normalizarTexto } from "./normalizarTexto";

/**
 * R-1.1–R-1.3.
 *
 * The whole point of this suite: the idiomatic
 * `.normalize("NFD").replace(/\p{Diacritic}/gu, "")` silently turns `ñ` into
 * `n`, because `ñ` (U+00F1) decomposes to `n` + U+0303 and that one-liner
 * deletes every combining mark, tilde included. Every case below with a `ñ`
 * or `Ñ` in it MUST fail against that naive implementation.
 */
describe("normalizarTexto", () => {
  describe("R-1.1 — ñ is preserved, every other diacritic is stripped", () => {
    it("keeps ñ through the diacritic stripper", () => {
      expect(normalizarTexto("Peña")).toBe("peña");
      expect(normalizarTexto("Peña")).not.toBe("pena");
    });

    it("folds uppercase Ñ to lowercase ñ, never to n", () => {
      expect(normalizarTexto("PEÑA")).toBe("peña");
    });

    it("strips vowel diacritics", () => {
      expect(normalizarTexto("Rodríguez")).toBe("rodriguez");
    });

    it("folds ú but keeps ñ inside the same word", () => {
      expect(normalizarTexto("Núñez")).toBe("nuñez");
    });

    it("strips the diaeresis", () => {
      expect(normalizarTexto("Agüero")).toBe("aguero");
    });
  });

  describe("R-1.2 — unicode form does not change the result", () => {
    it("agrees on a precomposed ñ (U+00F1) and a decomposed n + U+0303", () => {
      const precompuesta = "Peña"; // Peña, ñ as one code point
      const descompuesta = "Peña"; // Peña, n + combining tilde

      const a = normalizarTexto(precompuesta);
      const b = normalizarTexto(descompuesta);

      expect(a).toBe(b);
      expect(a).toHaveLength(4);
      expect(a.codePointAt(2)).toBe(0xf1);
    });
  });

  describe("R-1.3 — case, whitespace and empty input", () => {
    it("collapses internal whitespace and trims", () => {
      expect(normalizarTexto("  Juan   Carlos  Pérez ")).toBe(
        "juan carlos perez",
      );
    });

    it("returns the empty string for empty or whitespace-only input", () => {
      expect(normalizarTexto("")).toBe("");
      expect(normalizarTexto("   ")).toBe("");
    });

    it("never throws for any string input", () => {
      expect(() => normalizarTexto("")).not.toThrow();
      expect(() => normalizarTexto("123")).not.toThrow();
      expect(() => normalizarTexto("ñÑ üÜ")).not.toThrow();
    });

    it("combines casing, accents and ñ in one string", () => {
      expect(normalizarTexto("MARÍA José ÑANDÚ")).toBe("maria jose ñandu");
    });
  });
});
