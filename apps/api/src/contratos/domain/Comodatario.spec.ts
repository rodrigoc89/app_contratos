import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { Comodatario, PROVINCIA } from "./Comodatario";

const DATOS = {
  nombreCompleto: "Juan Carlos Pérez",
  dni: "30.123.456",
  domicilioCalle: "Av. Belgrano 1250",
  ciudad: "La Banda",
  whatsapp: "3854123456",
};

describe("Comodatario", () => {
  it("builds from the fields the contract asks for", () => {
    const comodatario = Comodatario.crear(DATOS);

    expect(comodatario.nombreCompleto).toBe("Juan Carlos Pérez");
    expect(comodatario.dni.formateado).toBe("30.123.456");
    expect(comodatario.domicilioCalle).toBe("Av. Belgrano 1250");
    expect(comodatario.ciudad).toBe("La Banda");
    expect(comodatario.whatsapp.valor).toBe("+5493854123456");
  });

  it("fixes the province, because the template hardcodes it", () => {
    expect(Comodatario.crear(DATOS).provincia).toBe(PROVINCIA);
    expect(PROVINCIA).toBe("Santiago del Estero");
  });

  it("trims surrounding whitespace", () => {
    const comodatario = Comodatario.crear({
      ...DATOS,
      nombreCompleto: "  Juan Carlos Pérez  ",
      ciudad: " La Banda ",
    });

    expect(comodatario.nombreCompleto).toBe("Juan Carlos Pérez");
    expect(comodatario.ciudad).toBe("La Banda");
  });

  it("uses the full name as the aclaración under the signature", () => {
    expect(Comodatario.crear(DATOS).aclaracion).toBe("Juan Carlos Pérez");
  });

  describe("required fields", () => {
    it("rejects an empty name", () => {
      expect(() => Comodatario.crear({ ...DATOS, nombreCompleto: "  " })).toThrow(
        DomainError,
      );
    });

    it("rejects an empty street address, since it is where the equipment lives", () => {
      expect(() => Comodatario.crear({ ...DATOS, domicilioCalle: "" })).toThrow(
        DomainError,
      );
    });

    it("rejects an empty city", () => {
      expect(() => Comodatario.crear({ ...DATOS, ciudad: "" })).toThrow(
        DomainError,
      );
    });

    it("propagates an invalid document", () => {
      expect(() => Comodatario.crear({ ...DATOS, dni: "123" })).toThrow(
        DomainError,
      );
    });

    it("propagates an invalid WhatsApp number", () => {
      expect(() => Comodatario.crear({ ...DATOS, whatsapp: "123" })).toThrow(
        DomainError,
      );
    });

    it("names the offending field so the technician can fix it", () => {
      expect(() => Comodatario.crear({ ...DATOS, ciudad: "" })).toThrow(
        /ciudad/i,
      );
    });
  });
});
