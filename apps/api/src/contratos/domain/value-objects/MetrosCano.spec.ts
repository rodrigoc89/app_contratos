import { describe, expect, it } from "vitest";

import { DomainError } from "../../../shared/domain/DomainError";
import { MetrosCano } from "./MetrosCano";

describe("MetrosCano", () => {
  describe("accepts realistic mast lengths", () => {
    it("accepts a whole number of metres", () => {
      expect(MetrosCano.crear(6).valor).toBe(6);
    });

    it("accepts half metres", () => {
      expect(MetrosCano.crear(7.5).valor).toBe(7.5);
    });

    it("accepts a numeric string, which is what an input field yields", () => {
      expect(MetrosCano.crear("7.5").valor).toBe(7.5);
    });

    it("accepts a comma as decimal separator, as typed on a Spanish keyboard", () => {
      expect(MetrosCano.crear("7,5").valor).toBe(7.5);
    });

    it("accepts zero metres, since not every install needs mast tubing", () => {
      expect(MetrosCano.crear(0).valor).toBe(0);
    });
  });

  describe("rejects impossible lengths", () => {
    it("rejects a negative length", () => {
      expect(() => MetrosCano.crear(-1)).toThrow(DomainError);
    });

    it("rejects a length beyond any real installation", () => {
      expect(() => MetrosCano.crear(201)).toThrow(DomainError);
    });

    it("rejects more than two decimals, which is always a typing slip", () => {
      expect(() => MetrosCano.crear(6.123)).toThrow(DomainError);
    });

    it("rejects a non-numeric value", () => {
      expect(() => MetrosCano.crear("seis")).toThrow(DomainError);
    });

    it("rejects a value that is not finite", () => {
      expect(() => MetrosCano.crear(Number.POSITIVE_INFINITY)).toThrow(
        DomainError,
      );
    });

    it("explains what is wrong", () => {
      expect(() => MetrosCano.crear(-1)).toThrow(/metro/i);
    });
  });

  describe("identity", () => {
    it("treats the same length written differently as equal", () => {
      expect(MetrosCano.crear("7,5").esIgualA(MetrosCano.crear(7.5))).toBe(true);
    });
  });
});
