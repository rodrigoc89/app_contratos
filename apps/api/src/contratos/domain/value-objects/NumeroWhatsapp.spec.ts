import { describe, expect, it } from "vitest";

import { DomainError } from "../../../shared/domain/DomainError";
import { NumeroWhatsapp } from "./NumeroWhatsapp";

// Santiago del Estero mobile: area 385, subscriber 4123456.
const E164 = "+5493854123456";

describe("NumeroWhatsapp", () => {
  describe("accepts the shapes a technician actually types", () => {
    it("accepts a bare national number", () => {
      expect(NumeroWhatsapp.crear("3854123456").valor).toBe(E164);
    });

    it("accepts the trunk prefix zero", () => {
      expect(NumeroWhatsapp.crear("03854123456").valor).toBe(E164);
    });

    it("accepts the mobile 15 prefix after the area code", () => {
      expect(NumeroWhatsapp.crear("0385154123456").valor).toBe(E164);
    });

    it("accepts a fully qualified E.164 number", () => {
      expect(NumeroWhatsapp.crear("+5493854123456").valor).toBe(E164);
    });

    it("accepts the country code without the mobile nine", () => {
      expect(NumeroWhatsapp.crear("543854123456").valor).toBe(E164);
    });

    it("accepts the international 00 prefix", () => {
      expect(NumeroWhatsapp.crear("005493854123456").valor).toBe(E164);
    });

    it("ignores spaces, dashes and parentheses", () => {
      expect(NumeroWhatsapp.crear("+54 9 (385) 412-3456").valor).toBe(E164);
    });
  });

  describe("rejects what WhatsApp could not deliver to", () => {
    it("rejects a number that is too short", () => {
      expect(() => NumeroWhatsapp.crear("385412")).toThrow(DomainError);
    });

    it("rejects a number that is too long", () => {
      expect(() => NumeroWhatsapp.crear("38541234567890")).toThrow(DomainError);
    });

    it("rejects a non-Argentine country code, since the fleet only installs locally", () => {
      expect(() => NumeroWhatsapp.crear("+13854123456")).toThrow(DomainError);
    });

    it("rejects an empty value", () => {
      expect(() => NumeroWhatsapp.crear("")).toThrow(DomainError);
    });

    it("explains what is wrong", () => {
      expect(() => NumeroWhatsapp.crear("123")).toThrow(/whatsapp|número/i);
    });

    it("never echoes the attempted number, which would leak it into logs", () => {
      expect(() => NumeroWhatsapp.crear("3854123456789")).not.toThrow(
        /3854123456789/,
      );
    });
  });

  describe("presentation", () => {
    it("exposes a digits-only form for the delivery provider", () => {
      expect(NumeroWhatsapp.crear("3854123456").paraProveedor).toBe(
        "5493854123456",
      );
    });
  });

  describe("identity", () => {
    it("treats differently written forms of the same number as equal", () => {
      const tipeado = NumeroWhatsapp.crear("0385154123456");
      const pegado = NumeroWhatsapp.crear("+54 9 385 412 3456");

      expect(tipeado.esIgualA(pegado)).toBe(true);
    });
  });
});
