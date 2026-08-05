import {
  EsquemaContratoDetalle,
  EsquemaFirmarContrato,
  EsquemaPrevisualizacion,
} from "@contratos/esquemas";
import { beforeEach, describe, expect, it } from "vitest";

import {
  contextoDePrueba,
  ContratosEnMemoria,
  firmaDe,
  firmantesFijos,
  GeneradorFalso,
  ID_CONTRATO,
  nuevoBorrador,
  plantillasFijas,
  relojFijo,
} from "../../application/dobles.testing";
import { FirmarContrato } from "../../application/FirmarContrato";
import { PrevisualizarContrato } from "../../application/PrevisualizarContrato";
import type { Contrato } from "../../domain/Contrato";
import {
  contextoDeFirmaDesde,
  firmasDesde,
  LARGO_MAXIMO_USER_AGENT,
  vistaDeContrato,
  vistaDeContratoCreado,
  vistaDePrevisualizacion,
} from "./vistas";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const trazo = (puntos = 14) =>
  Array.from({ length: puntos }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const cuerpoDeFirma = () =>
  EsquemaFirmarContrato.parse({
    firmas: [
      { documento: "condiciones_generales", imagenPng: PNG, trazos: [trazo()] },
      {
        documento: "comodato",
        imagenPng: PNG,
        trazos: [trazo().map((punto) => ({ ...punto, presion: 0.5 }))],
      },
    ],
    dispositivoId: "tablet-lenovo-03",
    geo: { latitud: -27.7834, longitud: -64.2642 },
  });

describe("vistaDeContrato", () => {
  let contratos: ContratosEnMemoria;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    contratos.agregar(nuevoBorrador());
  });

  const firmarlo = (): Promise<Contrato> =>
    new FirmarContrato(
      contratos,
      plantillasFijas(),
      firmantesFijos(),
      new GeneradorFalso(),
      relojFijo(),
    ).ejecutar({
      contratoId: ID_CONTRATO,
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contextoDePrueba(),
    });

  describe("a draft", () => {
    it("matches the shape the client parses", async () => {
      const contrato = await contratos.porId(ID_CONTRATO);

      expect(
        EsquemaContratoDetalle.safeParse(vistaDeContrato(contrato as Contrato))
          .success,
      ).toBe(true);
    });

    it("presents the customer's data the way the contract prints it", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato);

      expect(vista.comodatario.dni).toBe("30.123.456");
      expect(vista.comodatario.whatsapp).toBe("+5493854123456");
      expect(vista.comodatario.provincia).toBe("Santiago del Estero");
      expect(vista.equipos.antenaMac).toBe("AC:8B:A9:12:34:56");
      expect(vista.equipos.canoMetros).toBe(6);
    });

    it("has no number, no term and no documents yet", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato);

      expect(vista.numero).toBeNull();
      expect(vista.plazo).toBeNull();
      expect(vista.fechaFirma).toBeNull();
      expect(vista.plantillaVersionId).toBeNull();
      expect(vista.documentos).toEqual([]);
    });

    it("carries the creation event", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato);

      expect(vista.eventos).toEqual([
        { tipo: "creado", fecha: null, detalle: null },
      ]);
    });
  });

  describe("a signed contract", () => {
    it("matches the shape the client parses", async () => {
      const contrato = await firmarlo();

      expect(EsquemaContratoDetalle.safeParse(vistaDeContrato(contrato)).success).toBe(
        true,
      );
    });

    it("carries the number, the signing date and the derived expiry", async () => {
      const vista = vistaDeContrato(await firmarlo());

      expect(vista.estado).toBe("vigente");
      expect(vista.numero).toBe(1042);
      expect(vista.fechaFirma).toBe("2026-08-04");
      expect(vista.plazo).toEqual({
        meses: 120,
        fechaInicio: "2026-08-04",
        fechaVencimiento: "2036-08-04",
      });
    });

    /**
     * A download link, a hash — and no path. Where the PDF sits on disk is a
     * map of the server, and there is no reason for a browser to have one.
     */
    it("offers a download link and a hash, never a stored path", async () => {
      const vista = vistaDeContrato(await firmarlo());

      expect(vista.documentos).toHaveLength(2);
      expect(vista.documentos[0]?.enlace).toBe(
        `/contratos/${ID_CONTRATO}/documentos/condiciones_generales`,
      );
      expect(vista.documentos[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(vista)).not.toContain(".pdf");
    });

    /**
     * The signature images and the raw stroke points are evidence, kept
     * server-side. The signing context — technician, device, IP, user agent,
     * GPS — is evidence too, and the GPS is the customer's home address by
     * another name.
     */
    it("carries no signature image, no stroke data and no signing context", async () => {
      const serializado = JSON.stringify(vistaDeContrato(await firmarlo()));

      expect(serializado).not.toContain("imagenPng");
      expect(serializado).not.toContain("trazos");
      expect(serializado).not.toContain("tablet-lenovo-03");
      expect(serializado).not.toContain("usuario-tecnico1");
      expect(serializado).not.toContain("latitud");
    });

    it("lists the events in the order they happened", async () => {
      const vista = vistaDeContrato(await firmarlo());

      expect(vista.eventos.map((evento) => evento.tipo)).toEqual([
        "creado",
        "firmado",
      ]);
    });
  });

  describe("vistaDeContratoCreado", () => {
    it("answers the id and nothing else the client did not need", async () => {
      const vista = vistaDeContratoCreado(
        (await contratos.porId(ID_CONTRATO)) as Contrato,
      );

      expect(vista).toEqual({ id: ID_CONTRATO, estado: "borrador" });
    });
  });
});

describe("vistaDePrevisualizacion", () => {
  it("matches the shape the client parses", async () => {
    const contratos = new ContratosEnMemoria();
    contratos.agregar(nuevoBorrador());

    const previsualizada = await new PrevisualizarContrato(
      contratos,
      plantillasFijas(),
      firmantesFijos(),
      relojFijo(),
    ).ejecutar({ contratoId: ID_CONTRATO });

    const vista = vistaDePrevisualizacion(previsualizada);

    expect(EsquemaPrevisualizacion.safeParse(vista).success).toBe(true);
    expect(vista.fechaPrevistaDeFirma).toBe("2026-08-04");
    expect(vista.fechaPrevistaDeVencimiento).toBe("2036-08-04");
    expect(vista.documentos).toHaveLength(2);
  });
});

describe("firmasDesde", () => {
  it("builds one domain signature per document", () => {
    const firmas = firmasDesde(cuerpoDeFirma());

    expect(firmas.map((firma) => firma.documento)).toEqual([
      "condiciones_generales",
      "comodato",
    ]);
  });

  it("keeps the stroke timings, which are the forensic evidence", () => {
    const [primera] = firmasDesde(cuerpoDeFirma());

    expect(primera?.cantidadPuntos).toBe(14);
    expect(primera?.duracionMs).toBe(13 * 16);
  });

  it("carries pen pressure through when the tablet reported it", () => {
    const firmas = firmasDesde(cuerpoDeFirma());

    expect(firmas[1]?.trazos[0]?.[0]?.presion).toBe(0.5);
  });

  /**
   * With `exactOptionalPropertyTypes`, a point built as `{ presion: undefined }`
   * is not the same as a point without the key — and the second is what gets
   * stored as evidence. This is the test that keeps the mapper writing the key
   * only when there is a value for it.
   */
  it("omits pressure entirely when the tablet did not report it", () => {
    const [primera] = firmasDesde(cuerpoDeFirma());

    expect(Object.keys(primera?.trazos[0]?.[0] ?? {})).toEqual(["x", "y", "t"]);
  });
});

describe("contextoDeFirmaDesde", () => {
  const capturadoEn = new Date("2026-08-04T21:30:00-03:00");

  /**
   * The technician is taken from the verified token and never from the body:
   * `ContextoDeFirma` stores it as evidence of who was holding the tablet,
   * and a client-supplied answer to that is worth nothing.
   */
  it("takes the technician from the caller, not from the request body", () => {
    const contexto = contextoDeFirmaDesde(
      { ...cuerpoDeFirma(), tecnicoId: "usuario-jefe" } as never,
      {
        tecnicoId: "usuario-tecnico1",
        ip: "192.0.2.10",
        userAgent: "Mozilla/5.0",
        capturadoEn,
      },
    );

    expect(contexto.tecnicoId).toBe("usuario-tecnico1");
  });

  it("takes the IP and the user agent from the request, not from the body", () => {
    const contexto = contextoDeFirmaDesde(
      { ...cuerpoDeFirma(), ip: "8.8.8.8", userAgent: "curl/8.0" } as never,
      {
        tecnicoId: "usuario-tecnico1",
        ip: "192.0.2.10",
        userAgent: "Mozilla/5.0",
        capturadoEn,
      },
    );

    expect(contexto.ip).toBe("192.0.2.10");
    expect(contexto.userAgent).toBe("Mozilla/5.0");
  });

  it("takes the device and the location from the client, which is the only place they exist", () => {
    const contexto = contextoDeFirmaDesde(cuerpoDeFirma(), {
      tecnicoId: "usuario-tecnico1",
      ip: null,
      userAgent: null,
      capturadoEn,
    });

    expect(contexto.dispositivoId).toBe("tablet-lenovo-03");
    expect(contexto.geo).toEqual({ latitud: -27.7834, longitud: -64.2642 });
  });

  it("accepts a signing with no location at all", () => {
    const { geo: _sinUbicacion, ...sinGeo } = cuerpoDeFirma();

    const contexto = contextoDeFirmaDesde(sinGeo as never, {
      tecnicoId: "usuario-tecnico1",
      ip: null,
      userAgent: null,
      capturadoEn,
    });

    expect(contexto.geo).toBeNull();
  });

  /**
   * A `User-Agent` header can be kilobytes long, and it is stored verbatim
   * next to a signature. It is evidence, not free storage.
   */
  it("truncates an absurd user agent instead of storing it whole", () => {
    const contexto = contextoDeFirmaDesde(cuerpoDeFirma(), {
      tecnicoId: "usuario-tecnico1",
      ip: null,
      userAgent: "M".repeat(9000),
      capturadoEn,
    });

    expect(contexto.userAgent).toHaveLength(LARGO_MAXIMO_USER_AGENT);
  });

  it("uses the server clock as the captured instant", () => {
    const contexto = contextoDeFirmaDesde(cuerpoDeFirma(), {
      tecnicoId: "usuario-tecnico1",
      ip: null,
      userAgent: null,
      capturadoEn,
    });

    expect(contexto.capturadoEn.toISOString()).toBe(capturadoEn.toISOString());
  });
});
