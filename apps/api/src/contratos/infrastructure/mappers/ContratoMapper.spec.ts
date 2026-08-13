import { describe, expect, it } from "vitest";

import { columnaFechaDesde } from "../../../shared/infrastructure/persistence/columnaFecha";
import { FechaCalendario } from "../../../shared/domain/FechaCalendario";
import { Comodatario } from "../../domain/Comodatario";
import { ContextoDeFirma } from "../../domain/ContextoDeFirma";
import { Contrato } from "../../domain/Contrato";
import { Equipos } from "../../domain/Equipos";
import { FirmaCapturada } from "../../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../../domain/FirmaCapturada";
import type {
  DecimalLegible,
  FilaContratoLeida,
  RelacionesContrato,
} from "./ContratoMapper";
import {
  contratoDesdeFila,
  documentoDesdeFila,
  eventoDesdeFila,
  filaContratoDesde,
  filaDocumentoDesde,
  filaEventoDesde,
  filaFirmaDesde,
  firmaDesdeFila,
} from "./ContratoMapper";

const ID = "11111111-1111-4111-8111-111111111111";
const FIRMA = FechaCalendario.desdeIso("2026-08-04");

const decimal = (valor: number): DecimalLegible => ({
  toNumber: () => valor,
});

const comodatario = (): Comodatario =>
  Comodatario.crear({
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30.123.456",
    domicilioCalle: "Av. Belgrano 1250",
    ciudad: "La Banda",
    whatsapp: "3854123456",
  });

const equipos = (): Equipos =>
  Equipos.crear({
    antenaModelo: "LiteBeam 5AC Gen2",
    antenaMac: "ac8ba9123456",
    poe: true,
    canoMetros: 6.5,
  });

const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [
      Array.from({ length: 14 }, (_, i) => ({
        x: i,
        y: i % 4,
        t: i * 16,
        ...(i === 3 ? { presion: 0.42 } : {}),
      })),
    ],
  });

const contexto = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "tecnico-07",
    dispositivoId: "tablet-lenovo-03",
    capturadoEn: new Date("2026-08-04T18:00:00.123-03:00"),
    ip: "192.168.0.10",
    userAgent: "Mozilla/5.0",
    geo: { latitud: -27.78, longitud: -64.26 },
  });

const DOCUMENTOS = [
  {
    documento: "condiciones_generales" as const,
    ruta: "contratos/1042/condiciones.pdf",
    sha256: "a".repeat(64),
  },
  {
    documento: "comodato" as const,
    ruta: "contratos/1042/comodato.pdf",
    sha256: "b".repeat(64),
  },
];

const unBorrador = (): Contrato =>
  Contrato.crearBorrador({ id: ID, comodatario: comodatario(), equipos: equipos() });

const unFirmado = (): Contrato => {
  const contrato = unBorrador();
  contrato.firmar({
    numero: 1042,
    plantillaVersionId: "plantilla-2026-01",
    firmanteId: "firmante-sieira-v1",
    fechaFirma: FIRMA,
    firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
    contexto: contexto(),
  });
  contrato.registrarDocumentos(DOCUMENTOS);
  return contrato;
};

/**
 * Rebuilds the `contratos` row a repository read would hand back, from a real
 * aggregate: the write shape plus the two columns only a read produces — the
 * `Decimal` instance Prisma returns for `equipo_cano_metros`, and the row's
 * version counter, which the write shape deliberately does not carry.
 */
const filaLeidaDesde = (contrato: Contrato, version = 1): FilaContratoLeida => ({
  ...filaContratoDesde(contrato),
  equipoCanoMetros: decimal(contrato.equipos.canoMetros.valor),
  version,
});

/** Rebuilds the `RelacionesContrato` a repository read would produce, from a real aggregate. */
const relacionesLeidasDesde = (contrato: Contrato): RelacionesContrato => ({
  firmas: contrato.firmas.map((firma) => {
    const escrita = filaFirmaDesde(contrato.id, firma);
    return {
      documento: escrita.documento,
      imagenPng: escrita.imagenPng,
      // Simulates the actual jsonb round trip through Postgres.
      trazos: JSON.parse(JSON.stringify(escrita.trazos)) as unknown,
    };
  }),
  documentos: contrato.documentos.map((documento) => {
    const escrita = filaDocumentoDesde(contrato.id, documento);
    return { documento: escrita.documento, ruta: escrita.ruta, sha256: escrita.sha256 };
  }),
  eventos: contrato.eventos.map((evento) => ({
    usuarioId: evento.usuarioId,
    tipo: evento.tipo,
    fecha: evento.fecha === null ? null : columnaFechaDesde(evento.fecha),
    detalle: evento.detalle,
  })),
});

describe("filaContratoDesde", () => {
  it("maps a draft with every signing field null", () => {
    const fila = filaContratoDesde(unBorrador());

    expect(fila.estado).toBe("borrador");
    expect(fila.numero).toBeNull();
    expect(fila.plazoMeses).toBeNull();
    expect(fila.plazoFechaInicio).toBeNull();
    expect(fila.fechaFirma).toBeNull();
    expect(fila.plantillaVersionId).toBeNull();
    expect(fila.contextoTecnicoId).toBeNull();
    expect(fila.contextoGeoLatitud).toBeNull();
    expect(fila.equipoCanoMetros).toBe(6.5);
  });

  it("maps a signed contract's dates as UTC-midnight columns", () => {
    const fila = filaContratoDesde(unFirmado());

    expect(fila.estado).toBe("vigente");
    expect(fila.numero).toBe(1042);
    expect(fila.plazoMeses).toBe(120);
    expect(fila.plazoFechaInicio?.toISOString()).toBe(
      "2026-08-04T00:00:00.000Z",
    );
    expect(fila.plazoFechaVencimiento?.toISOString()).toBe(
      "2036-08-04T00:00:00.000Z",
    );
    expect(fila.fechaFirma?.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("maps the signing context, including geolocation", () => {
    const fila = filaContratoDesde(unFirmado());

    expect(fila.contextoTecnicoId).toBe("tecnico-07");
    expect(fila.contextoDispositivoId).toBe("tablet-lenovo-03");
    expect(fila.contextoIp).toBe("192.168.0.10");
    expect(fila.contextoGeoLatitud).toBe(-27.78);
    expect(fila.contextoGeoLongitud).toBe(-64.26);
    // The one real instant in the whole row: passed through unchanged.
    expect(fila.contextoCapturadoEn?.toISOString()).toBe(
      contexto().capturadoEn.toISOString(),
    );
  });

  it("normalises the comodatario value objects to their stored form", () => {
    const fila = filaContratoDesde(unBorrador());

    expect(fila.comodatarioDni).toBe("30123456");
    expect(fila.comodatarioWhatsapp).toBe("+5493854123456");
    expect(fila.equipoAntenaMac).toBe("AC:8B:A9:12:34:56");
  });

  /**
   * DESIGN.md D2: the search column is a required property of the row
   * type, computed inside `filaContratoDesde` — the only function that
   * builds a `contratos` row — so forgetting it is a compile error, not a
   * runtime gap. Must be the SAME `normalizarTexto` the search path runs,
   * or the write path and the search path would disagree on the same name.
   */
  describe("comodatarioNombreBusqueda (D2)", () => {
    it("is normalizarTexto(comodatario.nombreCompleto)", () => {
      const conAcentos = Contrato.crearBorrador({
        id: ID,
        comodatario: Comodatario.crear({
          nombreCompleto: "Juan Carlos Pérez",
          dni: "30.123.456",
          domicilioCalle: "Av. Belgrano 1250",
          ciudad: "La Banda",
          whatsapp: "3854123456",
        }),
        equipos: equipos(),
      });

      expect(filaContratoDesde(conAcentos).comodatarioNombreBusqueda).toBe(
        "juan carlos perez",
      );
    });

    /** The case the whole feature exists to protect: ñ survives, á does not. */
    it("preserves ñ while folding every other accent", () => {
      const conNy = Contrato.crearBorrador({
        id: ID,
        comodatario: Comodatario.crear({
          nombreCompleto: "Peña",
          dni: "30.123.456",
          domicilioCalle: "Av. Belgrano 1250",
          ciudad: "La Banda",
          whatsapp: "3854123456",
        }),
        equipos: equipos(),
      });

      expect(filaContratoDesde(conNy).comodatarioNombreBusqueda).toBe("peña");
    });

    it("recomputes from whatever the aggregate currently holds, not a stale value", () => {
      const contrato = unBorrador();
      contrato.actualizarComodatario(
        Comodatario.crear({
          nombreCompleto: "Núñez",
          dni: "30.123.456",
          domicilioCalle: "Av. Belgrano 1250",
          ciudad: "La Banda",
          whatsapp: "3854123456",
        }),
      );

      expect(filaContratoDesde(contrato).comodatarioNombreBusqueda).toBe(
        "nuñez",
      );
    });
  });
});

describe("filaFirmaDesde / firmaDesdeFila", () => {
  it("round-trips the raw stroke data, timestamps included, through a simulated jsonb trip", () => {
    const firma = firmaDe("comodato");
    const escrita = filaFirmaDesde(ID, firma);
    const leida = JSON.parse(JSON.stringify(escrita.trazos)) as unknown;

    const reconstruida = firmaDesdeFila({
      documento: escrita.documento,
      imagenPng: escrita.imagenPng,
      trazos: leida,
    });

    expect(reconstruida.trazos).toEqual(firma.trazos);
    expect(reconstruida.cantidadPuntos).toBe(firma.cantidadPuntos);
    expect(reconstruida.duracionMs).toBe(firma.duracionMs);
  });
});

describe("filaEventoDesde", () => {
  it("uses the registradoEn instant it is given, never a derived one", () => {
    const anclaje = new Date("2026-08-04T12:00:00.007Z");
    const fila = filaEventoDesde(ID, { tipo: "creado", fecha: null, detalle: null, usuarioId: null }, anclaje);

    expect(fila.registradoEn).toBe(anclaje);
  });

  it("maps a null business date through as null", () => {
    const fila = filaEventoDesde(
      ID,
      { tipo: "creado", fecha: null, detalle: null, usuarioId: null },
      new Date(),
    );

    expect(fila.fecha).toBeNull();
  });
});

describe("contratoDesdeFila", () => {
  it("rebuilds a draft", () => {
    const original = unBorrador();

    const rehidratado = contratoDesdeFila(
      filaLeidaDesde(original),
      relacionesLeidasDesde(original),
    );

    expect(rehidratado.estado).toBe("borrador");
    expect(rehidratado.comodatario.dni.formateado).toBe("30.123.456");
    expect(rehidratado.equipos.canoMetros.valor).toBe(6.5);
  });

  it("rebuilds a signed contract with everything it carries, byte for byte", () => {
    const original = unFirmado();

    const rehidratado = contratoDesdeFila(
      filaLeidaDesde(original),
      relacionesLeidasDesde(original),
    );

    expect(rehidratado.estado).toBe(original.estado);
    expect(rehidratado.numero).toBe(original.numero);
    expect(rehidratado.fechaFirma?.iso).toBe(original.fechaFirma?.iso);
    expect(rehidratado.plazo?.fechaVencimiento.iso).toBe(
      original.plazo?.fechaVencimiento.iso,
    );
    expect(rehidratado.plantillaVersionId).toBe(original.plantillaVersionId);
    expect(rehidratado.firmanteId).toBe(original.firmanteId);
    expect(rehidratado.firmas).toHaveLength(2);
    expect(rehidratado.documentos).toHaveLength(2);
    expect(rehidratado.documentos[0]?.sha256).toBe(original.documentos[0]?.sha256);
    expect(rehidratado.eventos.map((e) => e.tipo)).toEqual(
      original.eventos.map((e) => e.tipo),
    );
    expect(rehidratado.contexto?.capturadoEn.toISOString()).toBe(
      original.contexto?.capturadoEn.toISOString(),
    );
    expect(rehidratado.contexto?.geo).toEqual(original.contexto?.geo);
    expect(rehidratado.contexto?.ip).toBe(original.contexto?.ip);
  });

  it("rebuilds a terminated contract", () => {
    const original = unFirmado();
    original.darDeBaja({
      motivo: "Deuda",
      fecha: FechaCalendario.desdeIso("2027-03-10"), usuarioId: "usuario-oficina-prueba" });

    const rehidratado = contratoDesdeFila(
      filaLeidaDesde(original),
      relacionesLeidasDesde(original),
    );

    expect(rehidratado.estado).toBe("dado_de_baja");
    expect(rehidratado.motivoBaja).toBe("Deuda");
    expect(rehidratado.fechaBaja?.iso).toBe("2027-03-10");
    expect(rehidratado.equiposPendientesDeRestitucion).toBe(true);
  });

  /**
   * The version column is the only thing on the row that the aggregate does
   * not treat as business data, and it still has to survive the trip: the
   * repository compares against it on the very next write.
   */
  it("carries the row's version onto the aggregate, untouched", () => {
    const original = unFirmado();

    const rehidratado = contratoDesdeFila(
      filaLeidaDesde(original, 7),
      relacionesLeidasDesde(original),
    );

    expect(rehidratado.versionAlmacenada).toBe(7);
  });
});

describe("documentoDesdeFila", () => {
  it("maps a stored document back to the plain DocumentoContrato shape", () => {
    const documento = documentoDesdeFila({
      documento: "comodato",
      ruta: "contratos/1042/comodato.pdf",
      sha256: "b".repeat(64),
    });

    expect(documento).toEqual({
      documento: "comodato",
      ruta: "contratos/1042/comodato.pdf",
      sha256: "b".repeat(64),
    });
  });
});

describe("eventoDesdeFila", () => {
  it("maps a business date column back to a FechaCalendario", () => {
    const evento = eventoDesdeFila({
      usuarioId: null,
      tipo: "firmado",
      fecha: columnaFechaDesde(FIRMA),
      detalle: "Nº 1042",
    });

    expect(evento.fecha?.iso).toBe("2026-08-04");
    expect(evento.detalle).toBe("Nº 1042");
  });
});
