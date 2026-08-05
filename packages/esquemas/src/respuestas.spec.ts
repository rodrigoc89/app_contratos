import { describe, expect, it } from "vitest";

import {
  EsquemaContratoDetalle,
  EsquemaPrevisualizacion,
} from "./respuestas";

const detalle = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  estado: "vigente",
  numero: 1042,
  comodatario: {
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30.123.456",
    domicilioCalle: "Av. Belgrano 1250",
    ciudad: "La Banda",
    provincia: "Santiago del Estero",
    whatsapp: "+5493854123456",
  },
  equipos: {
    antenaModelo: "LiteBeam 5AC Gen2",
    antenaMac: "AC:8B:A9:12:34:56",
    poe: true,
    canoMetros: 6,
  },
  plazo: {
    meses: 120,
    fechaInicio: "2026-08-04",
    fechaVencimiento: "2036-08-04",
  },
  fechaFirma: "2026-08-04",
  plantillaVersionId: "plantilla-contrato-v1",
  documentos: [
    {
      documento: "comodato",
      sha256: "a".repeat(64),
      enlace: "/contratos/11111111-1111-4111-8111-111111111111/documentos/comodato",
    },
  ],
  eventos: [{ tipo: "firmado", fecha: "2026-08-04", detalle: "Nº 1042" }],
  equiposPendientesDeRestitucion: false,
});

describe("EsquemaContratoDetalle", () => {
  it("describes a signed contract", () => {
    expect(EsquemaContratoDetalle.safeParse(detalle()).success).toBe(true);
  });

  it("describes a draft, where almost everything is still null", () => {
    const borrador = {
      ...detalle(),
      estado: "borrador",
      numero: null,
      plazo: null,
      fechaFirma: null,
      plantillaVersionId: null,
      documentos: [],
      eventos: [{ tipo: "creado", fecha: null, detalle: null }],
    };

    expect(EsquemaContratoDetalle.safeParse(borrador).success).toBe(true);
  });

  /**
   * The response says *where to ask for* a document, never where it sits on
   * disk. A filesystem path in an API response is a map of the server.
   */
  it("carries a download link and a hash, never a stored path", () => {
    const analizado = EsquemaContratoDetalle.parse(detalle());

    expect(analizado.documentos[0]?.enlace.startsWith("/contratos/")).toBe(true);
    expect(analizado.documentos[0]).not.toHaveProperty("ruta");
  });

  /**
   * The signature image and the raw stroke points are evidence, not a view
   * model. Shipping them on every detail read would put a customer's
   * handwritten signature into any browser cache that ever opened the office
   * panel.
   */
  it("never carries the signature image or the stroke data", () => {
    const analizado = EsquemaContratoDetalle.parse({
      ...detalle(),
      firmas: [{ documento: "comodato", imagenPng: "data:image/png;base64,AAA", trazos: [] }],
      contexto: { ip: "192.0.2.10", geo: { latitud: -27.78, longitud: -64.26 } },
    });

    const serializado = JSON.stringify(analizado);
    expect(serializado).not.toContain("imagenPng");
    expect(serializado).not.toContain("trazos");
    expect(serializado).not.toContain("192.0.2.10");
    expect(serializado).not.toContain("-27.78");
  });
});

describe("EsquemaPrevisualizacion", () => {
  it("carries the rendered text of both documents", () => {
    const previsualizacion = {
      contratoId: "11111111-1111-4111-8111-111111111111",
      plantillaVersion: "v1",
      plazoMeses: 120,
      fechaPrevistaDeFirma: "2026-08-04",
      fechaPrevistaDeVencimiento: "2036-08-04",
      documentos: [
        { documento: "condiciones_generales", html: "<h1>CONDICIONES</h1>" },
        { documento: "comodato", html: "<h1>COMODATO</h1>" },
      ],
    };

    expect(EsquemaPrevisualizacion.safeParse(previsualizacion).success).toBe(true);
  });

  it("requires both documents: the customer reads what they sign twice", () => {
    expect(
      EsquemaPrevisualizacion.safeParse({
        contratoId: "11111111-1111-4111-8111-111111111111",
        plantillaVersion: "v1",
        plazoMeses: 120,
        fechaPrevistaDeFirma: "2026-08-04",
        fechaPrevistaDeVencimiento: "2036-08-04",
        documentos: [{ documento: "comodato", html: "<h1>COMODATO</h1>" }],
      }).success,
    ).toBe(false);
  });
});
