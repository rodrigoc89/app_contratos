import { describe, expect, it } from "vitest";

import {
  EsquemaFirmaCapturada,
  EsquemaFirmarContrato,
  LARGO_MAXIMO_IMAGEN_FIRMA,
  MAXIMO_PUNTOS_POR_TRAZO,
  MINIMO_PUNTOS_FIRMA,
} from "./firma";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const trazo = (puntos = 14) =>
  Array.from({ length: puntos }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const firma = (documento: "condiciones_generales" | "comodato") => ({
  documento,
  imagenPng: PNG,
  trazos: [trazo()],
});

const cuerpoDeFirma = () => ({
  firmas: [firma("condiciones_generales"), firma("comodato")],
  dispositivoId: "tablet-lenovo-03",
});

describe("EsquemaFirmaCapturada", () => {
  it("accepts a signature with an image and its stroke evidence", () => {
    expect(EsquemaFirmaCapturada.safeParse(firma("comodato")).success).toBe(true);
  });

  it("rejects a document that is not one of the two that get signed", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({ ...firma("comodato"), documento: "otro" })
        .success,
    ).toBe(false);
  });

  it("rejects a signature with no strokes at all", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({ ...firma("comodato"), trazos: [] })
        .success,
    ).toBe(false);
  });

  it("rejects an empty stroke", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({ ...firma("comodato"), trazos: [[]] })
        .success,
    ).toBe(false);
  });

  // A tap is one or two samples; a pen drawing anything produces dozens.
  it("rejects a tap on the screen dressed up as a signature", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        trazos: [trazo(MINIMO_PUNTOS_FIRMA - 1)],
      }).success,
    ).toBe(false);
  });

  it("rejects stroke timestamps that go backwards", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        trazos: [[...trazo(), { x: 1, y: 1, t: 0 }]],
      }).success,
    ).toBe(false);
  });

  it("rejects a point whose coordinates are not finite numbers", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        trazos: [[...trazo(), { x: "izquierda", y: 1, t: 999 }]],
      }).success,
    ).toBe(false);
  });

  it("accepts pen pressure when the tablet reports it", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        trazos: [trazo().map((punto) => ({ ...punto, presion: 0.4 }))],
      }).success,
    ).toBe(true);
  });

  /**
   * The image goes straight into `src="…"` of the rendered contract. Anything
   * other than a PNG data URI there is either a mistake or an attempt to make
   * the renderer fetch or execute something.
   */
  it("rejects an image that is not an inline PNG", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        imagenPng: "https://ejemplo.invalido/firma.png",
      }).success,
    ).toBe(false);

    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        imagenPng: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      }).success,
    ).toBe(false);
  });

  it("caps the image, so one request cannot be a memory attack", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        imagenPng: `data:image/png;base64,${"A".repeat(LARGO_MAXIMO_IMAGEN_FIRMA)}`,
      }).success,
    ).toBe(false);
  });

  it("caps the number of points in a stroke", () => {
    expect(
      EsquemaFirmaCapturada.safeParse({
        ...firma("comodato"),
        trazos: [trazo(MAXIMO_PUNTOS_POR_TRAZO + 1)],
      }).success,
    ).toBe(false);
  });
});

describe("EsquemaFirmarContrato", () => {
  it("accepts the two signatures plus the device that captured them", () => {
    expect(EsquemaFirmarContrato.safeParse(cuerpoDeFirma()).success).toBe(true);
  });

  it("rejects a single signature: the customer signs twice", () => {
    expect(
      EsquemaFirmarContrato.safeParse({
        ...cuerpoDeFirma(),
        firmas: [firma("comodato")],
      }).success,
    ).toBe(false);
  });

  it("rejects two signatures for the same document", () => {
    expect(
      EsquemaFirmarContrato.safeParse({
        ...cuerpoDeFirma(),
        firmas: [firma("comodato"), firma("comodato")],
      }).success,
    ).toBe(false);
  });

  it("requires the device identifier, which is forensic evidence", () => {
    const { dispositivoId: _omitido, ...sinDispositivo } = cuerpoDeFirma();

    expect(EsquemaFirmarContrato.safeParse(sinDispositivo).success).toBe(false);
  });

  it("accepts geolocation when the customer granted it", () => {
    expect(
      EsquemaFirmarContrato.safeParse({
        ...cuerpoDeFirma(),
        geo: { latitud: -27.7834, longitud: -64.2642 },
      }).success,
    ).toBe(true);
  });

  it("accepts a missing geolocation: a denied permission cannot block a signing", () => {
    expect(EsquemaFirmarContrato.safeParse(cuerpoDeFirma()).success).toBe(true);
    expect(
      EsquemaFirmarContrato.safeParse({ ...cuerpoDeFirma(), geo: null }).success,
    ).toBe(true);
  });

  it("rejects impossible coordinates", () => {
    expect(
      EsquemaFirmarContrato.safeParse({
        ...cuerpoDeFirma(),
        geo: { latitud: 91, longitud: 0 },
      }).success,
    ).toBe(false);
  });

  /**
   * Ley 25.326: those two numbers locate the customer's home. The domain
   * refuses to put them in an error message (`ContextoDeFirma.validarGeo`) and
   * this schema must not undo that on the way in.
   */
  it("never echoes a coordinate in the rejection message", () => {
    const resultado = EsquemaFirmarContrato.safeParse({
      ...cuerpoDeFirma(),
      geo: { latitud: -27.783412345, longitud: 999.5 },
    });

    expect(resultado.success).toBe(false);
    if (resultado.success) {
      return;
    }
    const mensajes = resultado.error.issues.map((issue) => issue.message).join(" ");
    expect(mensajes).not.toContain("999.5");
    expect(mensajes).not.toContain("-27.783412345");
  });

  /**
   * `ContextoDeFirma` stores the technician as forensic evidence of who was
   * holding the tablet. A client-supplied answer to that question is worth
   * nothing, so the schema does not even have a field for it.
   */
  it("has no field for the technician, the IP or the user agent", () => {
    const analizado = EsquemaFirmarContrato.parse({
      ...cuerpoDeFirma(),
      tecnicoId: "usuario-jefe",
      ip: "8.8.8.8",
      userAgent: "curl/8.0",
    });

    expect(analizado).not.toHaveProperty("tecnicoId");
    expect(analizado).not.toHaveProperty("ip");
    expect(analizado).not.toHaveProperty("userAgent");
  });
});
