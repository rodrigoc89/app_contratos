import { describe, expect, it } from "vitest";

import { DomainError } from "../../../shared/domain/DomainError";
import { Dni } from "./Dni";

describe("Dni", () => {
  describe("accepts valid documents", () => {
    it("accepts a plain 8-digit document", () => {
      expect(Dni.crear("27582030").valor).toBe("27582030");
    });

    it("accepts a 7-digit document, still common in older customers", () => {
      expect(Dni.crear("5582030").valor).toBe("5582030");
    });

    it("normalises dot separators, which is how people write it", () => {
      expect(Dni.crear("27.582.030").valor).toBe("27582030");
    });

    it("normalises spaces and surrounding whitespace", () => {
      expect(Dni.crear("  27 582 030 ").valor).toBe("27582030");
    });
  });

  describe("rejects invalid documents", () => {
    it("rejects a document with too few digits", () => {
      expect(() => Dni.crear("123456")).toThrow(DomainError);
    });

    it("rejects a document with too many digits", () => {
      expect(() => Dni.crear("123456789")).toThrow(DomainError);
    });

    it("rejects letters", () => {
      expect(() => Dni.crear("2758203X")).toThrow(DomainError);
    });

    it("rejects an empty value", () => {
      expect(() => Dni.crear("   ")).toThrow(DomainError);
    });

    it("explains what is wrong so the technician can fix it on the spot", () => {
      expect(() => Dni.crear("123")).toThrow(/DNI/i);
    });
  });

  describe("presentation", () => {
    it("formats an 8-digit document with dots", () => {
      expect(Dni.crear("27582030").formateado).toBe("27.582.030");
    });

    it("formats a 7-digit document with dots", () => {
      expect(Dni.crear("5582030").formateado).toBe("5.582.030");
    });
  });

  describe("identity", () => {
    it("treats differently written forms of the same document as equal", () => {
      expect(Dni.crear("27.582.030").esIgualA(Dni.crear("27582030"))).toBe(true);
    });

    it("treats different documents as not equal", () => {
      expect(Dni.crear("27582030").esIgualA(Dni.crear("30123456"))).toBe(false);
    });
  });
});
