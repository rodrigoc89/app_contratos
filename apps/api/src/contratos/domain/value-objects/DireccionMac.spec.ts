import { describe, expect, it } from "vitest";

import { DomainError } from "../../../shared/domain/DomainError";
import { DireccionMac } from "./DireccionMac";

describe("DireccionMac", () => {
  const CANONICA = "AC:8B:A9:12:34:56";

  describe("accepts the shapes a sticker or a scanner can produce", () => {
    it("accepts the canonical colon-separated form", () => {
      expect(DireccionMac.crear("AC:8B:A9:12:34:56").valor).toBe(CANONICA);
    });

    it("uppercases lowercase hex", () => {
      expect(DireccionMac.crear("ac:8b:a9:12:34:56").valor).toBe(CANONICA);
    });

    it("accepts hyphen separators", () => {
      expect(DireccionMac.crear("AC-8B-A9-12-34-56").valor).toBe(CANONICA);
    });

    it("accepts a bare run of hex, which is what most barcodes encode", () => {
      expect(DireccionMac.crear("AC8BA9123456").valor).toBe(CANONICA);
    });

    it("ignores surrounding whitespace left by a scan", () => {
      expect(DireccionMac.crear("  AC8BA9123456\n").valor).toBe(CANONICA);
    });
  });

  describe("rejects anything that is not a MAC", () => {
    it("rejects too few hex digits", () => {
      expect(() => DireccionMac.crear("AC8BA91234")).toThrow(DomainError);
    });

    it("rejects too many hex digits", () => {
      expect(() => DireccionMac.crear("AC8BA912345678")).toThrow(DomainError);
    });

    it("rejects non-hex characters", () => {
      expect(() => DireccionMac.crear("AC:8B:A9:12:34:5G")).toThrow(DomainError);
    });

    it("rejects an empty value", () => {
      expect(() => DireccionMac.crear("")).toThrow(DomainError);
    });

    it("explains what is wrong", () => {
      expect(() => DireccionMac.crear("nope")).toThrow(/MAC/i);
    });
  });

  describe("identity", () => {
    it("treats differently formatted forms of the same address as equal", () => {
      const escaneada = DireccionMac.crear("ac8ba9123456");
      const tipeada = DireccionMac.crear("AC:8B:A9:12:34:56");

      expect(escaneada.esIgualA(tipeada)).toBe(true);
    });

    it("treats different addresses as not equal", () => {
      const una = DireccionMac.crear("AC:8B:A9:12:34:56");
      const otra = DireccionMac.crear("AC:8B:A9:12:34:57");

      expect(una.esIgualA(otra)).toBe(false);
    });
  });
});
