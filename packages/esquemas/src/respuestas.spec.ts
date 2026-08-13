import { describe, expect, it } from "vitest";

import {
  EsquemaContratoDetalle,
  EsquemaContratoResumen,
  EsquemaListaContratos,
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
  eventos: [
    { tipo: "firmado", fecha: "2026-08-04", detalle: "Nº 1042", usuario: null },
  ],
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
      eventos: [{ tipo: "creado", fecha: null, detalle: null, usuario: null }],
    };

    expect(EsquemaContratoDetalle.safeParse(borrador).success).toBe(true);
  });

  /**
   * DESIGN.md §3 promises baja, anulación and restitución record "a reason and
   * an actor". The actor has been stored since the transitions shipped; this
   * is the field that lets a screen answer *who* without the reader opening
   * Postgres.
   */
  it("carries the actor of a transition, by name", () => {
    const anulado = {
      ...detalle(),
      estado: "anulado",
      eventos: [
        { tipo: "creado", fecha: null, detalle: null, usuario: null },
        { tipo: "firmado", fecha: "2026-08-04", detalle: "Nº 1042", usuario: null },
        {
          tipo: "anulado",
          fecha: "2026-08-12",
          detalle: "Error de carga",
          usuario: "oficina",
        },
      ],
    };

    const analizado = EsquemaContratoDetalle.parse(anulado);

    expect(analizado.eventos.map((evento) => evento.usuario)).toEqual([
      null,
      null,
      "oficina",
    ]);
  });

  /**
   * The actor travels as a *name*, never as the `usuario_id` the event row
   * stores. An internal identifier on the wire is a handle onto the identity
   * table that no client has any business holding — and a UUID on screen
   * would be worse than showing nothing at all, which is the whole reason
   * this field is resolved server-side.
   */
  it("never carries the raw user id of an event", () => {
    const analizado = EsquemaContratoDetalle.parse({
      ...detalle(),
      eventos: [
        {
          tipo: "dado_de_baja",
          fecha: "2026-08-12",
          detalle: "Mudanza",
          usuario: "oficina",
          usuarioId: "99999999-9999-4999-8999-999999999999",
        },
      ],
    });

    expect(analizado.eventos[0]).not.toHaveProperty("usuarioId");
    expect(JSON.stringify(analizado)).not.toContain("99999999");
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

/**
 * R-2.9: the office list row is a Ley 25.326 privacy boundary, not a size
 * cut. `safeParse(...).success === true` alone only ever catches a schema
 * that is too STRICT; it is blind to one that is too PERMISSIVE, which is
 * the direction that actually matters here — a widened schema would still
 * report success while letting a forbidden field ride along. `.strict()`
 * (via `z.strictObject`) closes that missing half: an unrecognized key must
 * FAIL parsing, never be silently stripped.
 */
describe("EsquemaContratoResumen", () => {
  const resumen = () => ({
    id: "22222222-2222-4222-8222-222222222222",
    numero: 1042,
    estado: "vigente",
    comodatario: {
      nombreCompleto: "Juan Carlos Pérez",
      dni: "30.123.456",
    },
    fechaFirma: "2026-08-04",
  });

  it("accepts exactly the six allowed fields of a signed contract's row", () => {
    expect(EsquemaContratoResumen.safeParse(resumen()).success).toBe(true);
  });

  it("accepts a draft, with a null numero and a null fechaFirma", () => {
    expect(
      EsquemaContratoResumen.safeParse({
        ...resumen(),
        estado: "borrador",
        numero: null,
        fechaFirma: null,
      }).success,
    ).toBe(true);
  });

  it("REJECTS a payload widened with whatsapp — the missing negative half", () => {
    expect(
      EsquemaContratoResumen.safeParse({ ...resumen(), whatsapp: "+5493854123456" })
        .success,
    ).toBe(false);
  });

  it("REJECTS a payload widened with the comodatario's street address", () => {
    expect(
      EsquemaContratoResumen.safeParse({
        ...resumen(),
        domicilioCalle: "Av. Belgrano 1250",
      }).success,
    ).toBe(false);
  });

  /**
   * `creadoEn` is the read model's ordering key (DESIGN.md D4), not a field
   * any screen asked for — it exists to sort `buscar`'s results server-side
   * and must never reach the wire.
   */
  it("REJECTS a payload carrying creadoEn, the internal ordering key", () => {
    expect(
      EsquemaContratoResumen.safeParse({
        ...resumen(),
        creadoEn: "2026-08-04T15:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("REJECTS widening at the nested comodatario level too, not just the top level", () => {
    expect(
      EsquemaContratoResumen.safeParse({
        ...resumen(),
        comodatario: { ...resumen().comodatario, whatsapp: "+5493854123456" },
      }).success,
    ).toBe(false);
  });
});

describe("EsquemaListaContratos", () => {
  const fila = () => ({
    id: "22222222-2222-4222-8222-222222222222",
    numero: 1042,
    estado: "vigente" as const,
    comodatario: { nombreCompleto: "Juan Carlos Pérez", dni: "30.123.456" },
    fechaFirma: "2026-08-04",
  });

  const lista = () => ({
    elementos: [fila()],
    total: 1,
    pagina: 1,
    tamanoPagina: 20,
  });

  it("accepts the envelope shape R-2.7/R-2.9 describe", () => {
    expect(EsquemaListaContratos.safeParse(lista()).success).toBe(true);
  });

  it("accepts an honest empty result", () => {
    expect(
      EsquemaListaContratos.safeParse({ elementos: [], total: 0, pagina: 1, tamanoPagina: 20 })
        .success,
    ).toBe(true);
  });

  /**
   * The envelope is exactly `{ elementos, total, pagina, tamanoPagina }`
   * (R-2.9's own wording) — the same missing-negative-half gap applies at
   * this level too, so it gets the same fix.
   */
  it("REJECTS an envelope widened with an unexpected top-level field", () => {
    expect(
      EsquemaListaContratos.safeParse({ ...lista(), mensaje: "ok" }).success,
    ).toBe(false);
  });

  it("REJECTS an envelope whose element is widened, by composition", () => {
    expect(
      EsquemaListaContratos.safeParse({
        ...lista(),
        elementos: [{ ...fila(), whatsapp: "+5493854123456" }],
      }).success,
    ).toBe(false);
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
