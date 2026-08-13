import {
  EsquemaContratoDetalle,
  EsquemaContratoResumen,
  EsquemaFirmarContrato,
  EsquemaListaContratos,
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
import type { ResumenDeContrato } from "../../application/ports/ContratoRepository";
import { FechaCalendario } from "../../../shared/domain/FechaCalendario";
import type { AutoresDeEventos } from "./vistas";
import {
  contextoDeFirmaDesde,
  firmasDesde,
  LARGO_MAXIMO_USER_AGENT,
  vistaDeContrato,
  vistaDeContratoCreado,
  vistaDeListaContratos,
  vistaDeResumen,
  vistaDePrevisualizacion,
} from "./vistas";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

/**
 * Drafts and freshly signed contracts have no actor to resolve: `creado` and
 * `firmado` carry none. Named rather than inlined so a `new Map()` in these
 * tests always means "this contract has no authors", never "I forgot to pass
 * them" — the two look identical at a call site otherwise.
 */
const SIN_AUTORES: AutoresDeEventos = new Map();

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
        EsquemaContratoDetalle.safeParse(vistaDeContrato(contrato as Contrato, SIN_AUTORES))
          .success,
      ).toBe(true);
    });

    it("presents the customer's data the way the contract prints it", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato, SIN_AUTORES);

      expect(vista.comodatario.dni).toBe("30.123.456");
      expect(vista.comodatario.whatsapp).toBe("+5493854123456");
      expect(vista.comodatario.provincia).toBe("Santiago del Estero");
      expect(vista.equipos.antenaMac).toBe("AC:8B:A9:12:34:56");
      expect(vista.equipos.canoMetros).toBe(6);
    });

    it("has no number, no term and no documents yet", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato, SIN_AUTORES);

      expect(vista.numero).toBeNull();
      expect(vista.plazo).toBeNull();
      expect(vista.fechaFirma).toBeNull();
      expect(vista.plantillaVersionId).toBeNull();
      expect(vista.documentos).toEqual([]);
    });

    it("carries the creation event", async () => {
      const vista = vistaDeContrato((await contratos.porId(ID_CONTRATO)) as Contrato, SIN_AUTORES);

      expect(vista.eventos).toEqual([
        { tipo: "creado", fecha: null, detalle: null, usuario: null },
      ]);
    });
  });

  describe("a signed contract", () => {
    it("matches the shape the client parses", async () => {
      const contrato = await firmarlo();

      expect(EsquemaContratoDetalle.safeParse(vistaDeContrato(contrato, SIN_AUTORES)).success).toBe(
        true,
      );
    });

    it("carries the number, the signing date and the derived expiry", async () => {
      const vista = vistaDeContrato(await firmarlo(), SIN_AUTORES);

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
      const vista = vistaDeContrato(await firmarlo(), SIN_AUTORES);

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
      const serializado = JSON.stringify(vistaDeContrato(await firmarlo(), SIN_AUTORES));

      expect(serializado).not.toContain("imagenPng");
      expect(serializado).not.toContain("trazos");
      expect(serializado).not.toContain("tablet-lenovo-03");
      expect(serializado).not.toContain("usuario-tecnico1");
      expect(serializado).not.toContain("latitud");
    });

    it("lists the events in the order they happened", async () => {
      const vista = vistaDeContrato(await firmarlo(), SIN_AUTORES);

      expect(vista.eventos.map((evento) => evento.tipo)).toEqual([
        "creado",
        "firmado",
      ]);
    });
  });

  /**
   * DESIGN.md §3 — ending someone else's agreement records a reason *and* an
   * actor. The aggregate stores the actor's id; this is where it becomes a
   * name, because a UUID on screen answers nobody's question.
   */
  describe("the actor of a transition", () => {
    const ID_OFICINA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

    const contratoDadoDeBaja = async (): Promise<Contrato> => {
      const contrato = await firmarlo();
      contrato.darDeBaja({
        motivo: "El cliente se mudó de la zona de cobertura",
        fecha: FechaCalendario.desdeIso("2026-08-12"),
        usuarioId: ID_OFICINA,
      });

      return contrato;
    };

    it("names the actor, resolved from the id the event stores", async () => {
      const vista = vistaDeContrato(
        await contratoDadoDeBaja(),
        new Map([[ID_OFICINA, "oficina"]]),
      );

      expect(vista.eventos.map((evento) => [evento.tipo, evento.usuario])).toEqual([
        ["creado", null],
        ["firmado", null],
        ["dado_de_baja", "oficina"],
      ]);
    });

    /**
     * The id is the audit record and it stays in the database. What travels
     * to a browser is the name, so an unresolvable id degrades to "no name",
     * never to a leaked identifier.
     */
    it("emits no name — and no id — when the id resolves to nothing", async () => {
      const vista = vistaDeContrato(await contratoDadoDeBaja(), new Map());

      expect(vista.eventos.at(-1)?.usuario).toBeNull();
      expect(JSON.stringify(vista)).not.toContain(ID_OFICINA);
    });

    it("still matches the shape the client parses", async () => {
      const vista = vistaDeContrato(
        await contratoDadoDeBaja(),
        new Map([[ID_OFICINA, "oficina"]]),
      );

      expect(EsquemaContratoDetalle.safeParse(vista).success).toBe(true);
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

/**
 * R-2.9: the list row is a privacy boundary, not a size cut. Every key at
 * every depth of the emitted object must be exactly the allowed set, and no
 * forbidden field — address, equipment, documents, events, signing context,
 * or the internal normalized search column — may appear anywhere.
 */
describe("vistaDeResumen", () => {
  const resumenDePrueba = (
    overrides: Partial<ResumenDeContrato> = {},
  ): ResumenDeContrato => ({
    id: "22222222-2222-4222-8222-222222222222",
    numero: 1042,
    estado: "vigente",
    comodatarioNombreCompleto: "Juan Carlos Pérez",
    comodatarioDni: "30123456",
    fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
    creadoEn: new Date("2026-08-04T15:00:00.000Z"),
    ...overrides,
  });

  it("matches the shape the client parses", () => {
    expect(
      EsquemaContratoResumen.safeParse(vistaDeResumen(resumenDePrueba())).success,
    ).toBe(true);
  });

  /**
   * The missing negative half (W-5/S-1 from the verify report): a schema
   * asserted only by `success === true` catches a schema that is too
   * strict, never one that has been widened to leak a forbidden field. This
   * proves `EsquemaContratoResumen` actually rejects the wire shape it
   * exists to forbid, on the real `vistaDeResumen` output, not a
   * hand-written stand-in.
   */
  it("REJECTS the real view widened with whatsapp or the street address (R-2.9)", () => {
    const vista = vistaDeResumen(resumenDePrueba());

    expect(
      EsquemaContratoResumen.safeParse({ ...vista, whatsapp: "+5493854123456" })
        .success,
    ).toBe(false);
    expect(
      EsquemaContratoResumen.safeParse({
        ...vista,
        domicilioCalle: "Av. Belgrano 1250",
      }).success,
    ).toBe(false);
  });

  it("walking every key at every depth yields exactly the six allowed fields", () => {
    const vista = vistaDeResumen(resumenDePrueba());

    expect(Object.keys(vista).sort()).toEqual(
      ["comodatario", "estado", "fechaFirma", "id", "numero"].sort(),
    );
    expect(Object.keys(vista.comodatario).sort()).toEqual(["dni", "nombreCompleto"]);
  });

  it("contains no forbidden field anywhere in the serialized body", () => {
    const serializado = JSON.stringify(vistaDeResumen(resumenDePrueba()));

    for (const prohibido of [
      "domicilioCalle",
      "ciudad",
      "provincia",
      "whatsapp",
      "antenaMac",
      "antenaModelo",
      "poe",
      "canoMetros",
      "plazo",
      "plantillaVersionId",
      "documentos",
      "sha256",
      "ruta",
      "eventos",
      "firmanteId",
      "imagenPng",
      "trazos",
      "tecnicoId",
      "dispositivoId",
      "ip",
      "userAgent",
      "latitud",
      "longitud",
      "creadoEn",
      "comodatarioNombreBusqueda",
      "nombreBusqueda",
    ]) {
      expect(serializado).not.toContain(prohibido);
    }
  });

  it("a draft reports a null numero and a null fechaFirma", () => {
    const vista = vistaDeResumen(
      resumenDePrueba({ estado: "borrador", numero: null, fechaFirma: null }),
    );

    expect(vista.numero).toBeNull();
    expect(vista.fechaFirma).toBeNull();
  });

  it("dots the DNI for display, reusing Dni.formateado", () => {
    const vista = vistaDeResumen(resumenDePrueba({ comodatarioDni: "30123456" }));

    expect(vista.comodatario.dni).toBe("30.123.456");
  });

  it("passes the display name through untouched — casing and accents intact", () => {
    const vista = vistaDeResumen(
      resumenDePrueba({ comodatarioNombreCompleto: "Peña" }),
    );

    expect(vista.comodatario.nombreCompleto).toBe("Peña");
  });
});

describe("vistaDeListaContratos", () => {
  const resumen = (id: string): ResumenDeContrato => ({
    id,
    numero: 1042,
    estado: "vigente",
    comodatarioNombreCompleto: "Juan Carlos Pérez",
    comodatarioDni: "30123456",
    fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
    creadoEn: new Date("2026-08-04T15:00:00.000Z"),
  });

  it("matches the shape the client parses", () => {
    const vista = vistaDeListaContratos(
      { resumenes: [resumen("a"), resumen("b")], total: 7 },
      2,
      20,
    );

    expect(EsquemaListaContratos.safeParse(vista).success).toBe(true);
  });

  it("carries the untruncated total separately from elementos.length", () => {
    const vista = vistaDeListaContratos(
      { resumenes: [resumen("a")], total: 25 },
      1,
      20,
    );

    expect(vista.elementos).toHaveLength(1);
    expect(vista.total).toBe(25);
  });

  it("echoes pagina and tamanoPagina, since the repository result does not carry them", () => {
    const vista = vistaDeListaContratos({ resumenes: [], total: 0 }, 3, 10);

    expect(vista.pagina).toBe(3);
    expect(vista.tamanoPagina).toBe(10);
  });

  it("an empty result is still a well-formed list, never omitted fields", () => {
    const vista = vistaDeListaContratos({ resumenes: [], total: 0 }, 1, 20);

    expect(vista).toEqual({ elementos: [], total: 0, pagina: 1, tamanoPagina: 20 });
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
