import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FirmanteComodante } from "./FirmanteComodante";

const DATOS = {
  id: "firmante-sieira-v1",
  version: "v1",
  nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
  dni: "27.582.030",
  imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
};

describe("FirmanteComodante", () => {
  it("carries the pre-loaded signature stamped on every contract", () => {
    const firmante = FirmanteComodante.crear(DATOS);

    expect(firmante.id).toBe("firmante-sieira-v1");
    expect(firmante.nombreCompleto).toBe("SIEIRA GUILLERMO FEDERICO");
    expect(firmante.dni.formateado).toBe("27.582.030");
    expect(firmante.imagenFirmaPng).toContain("base64");
  });

  it("uses the full name as the aclaración, like the customer's block", () => {
    expect(FirmanteComodante.crear(DATOS).aclaracion).toBe(
      "SIEIRA GUILLERMO FEDERICO",
    );
  });

  it("is versioned, so every contract records which signature was stamped", () => {
    expect(FirmanteComodante.crear(DATOS).version).toBe("v1");
  });

  it("rejects a signatory without a signature image", () => {
    expect(() =>
      FirmanteComodante.crear({ ...DATOS, imagenFirmaPng: "" }),
    ).toThrow(DomainError);
  });

  it("rejects an invalid document", () => {
    expect(() => FirmanteComodante.crear({ ...DATOS, dni: "abc" })).toThrow(
      DomainError,
    );
  });
});
