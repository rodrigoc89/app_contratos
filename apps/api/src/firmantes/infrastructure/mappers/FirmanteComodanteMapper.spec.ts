import { describe, expect, it } from "vitest";

import { firmanteComodanteDesdeFila } from "./FirmanteComodanteMapper";

describe("firmanteComodanteDesdeFila", () => {
  it("maps a stored row to the domain FirmanteComodante", () => {
    const firmante = firmanteComodanteDesdeFila({
      id: "firmante-sieira-v1",
      version: "v1",
      nombreCompleto: "Sieira Guillermo Federico",
      dni: "27.582.030",
      imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
    });

    expect(firmante.id).toBe("firmante-sieira-v1");
    expect(firmante.version).toBe("v1");
    expect(firmante.nombreCompleto).toBe("Sieira Guillermo Federico");
    expect(firmante.dni.formateado).toBe("27.582.030");
    expect(firmante.imagenFirmaPng).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("never serialises the signature image (FirmanteComodante.toJSON)", () => {
    const firmante = firmanteComodanteDesdeFila({
      id: "firmante-sieira-v1",
      version: "v1",
      nombreCompleto: "Sieira Guillermo Federico",
      dni: "27582030",
      imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
    });

    expect(JSON.stringify(firmante)).not.toContain("iVBORw0KGgo");
  });
});
