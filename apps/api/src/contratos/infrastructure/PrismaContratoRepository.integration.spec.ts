import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../../shared/infrastructure/persistence/testDb";
import type { Reloj } from "../application/ports/Reloj";
import { Comodatario } from "../domain/Comodatario";
import { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Contrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { PrismaContratoRepository } from "./PrismaContratoRepository";

/** A clock a test controls, advancing 1ms per call so repeated saves within one test never tie. */
class RelojFijo implements Reloj {
  private instanteMs: number;

  constructor(instante: Date) {
    this.instanteMs = instante.getTime();
  }

  ahora(): Date {
    const valor = new Date(this.instanteMs);
    this.instanteMs += 1;
    return valor;
  }
}

/** A clock that never advances at all — the adversarial case for event ordering. */
class RelojCongelado implements Reloj {
  constructor(private readonly instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
}

const prisma = crearClienteDeIntegracion();

beforeEach(async () => {
  await limpiarBaseDeDatos(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
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

const firmaDe = (
  documento: TipoDocumentoFirmado,
  indicePresion?: number,
): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [
      Array.from({ length: 14 }, (_, i) => ({
        x: i,
        y: i % 4,
        t: i * 16 + 7,
        ...(indicePresion === i ? { presion: 0.37 } : {}),
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

async function crearPlantillaYFirmanteActivos(): Promise<{
  plantillaId: string;
  firmanteId: string;
}> {
  const plantilla = await prisma.plantillaContrato.create({
    data: {
      id: "plantilla-2026-01",
      version: "2026-01",
      contenidoHtml: "<html>contrato</html>",
      vigenteDesde: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const firmante = await prisma.firmanteComodante.create({
    data: {
      id: "firmante-sieira-v1",
      version: "v1",
      nombreCompleto: "Sieira Guillermo Federico",
      dni: "27582030",
      imagenFirmaPng: "data:image/png;base64,firmante",
      activo: true,
    },
  });

  return { plantillaId: plantilla.id, firmanteId: firmante.id };
}

describe("PrismaContratoRepository (integration)", () => {
  it("round-trips a draft", async () => {
    const repo = new PrismaContratoRepository(prisma, new RelojFijo(new Date()));
    const original = Contrato.crearBorrador({
      id: "11111111-1111-4111-8111-111111111111",
      comodatario: comodatario(),
      equipos: equipos(),
    });

    await repo.guardar(original);
    const leido = await repo.porId(original.id);

    expect(leido).not.toBeNull();
    expect(leido?.estado).toBe("borrador");
    expect(leido?.numero).toBeNull();
    expect(leido?.comodatario.dni.formateado).toBe("30.123.456");
    expect(leido?.equipos.canoMetros.valor).toBe(6.5);
    expect(leido?.eventos.map((e) => e.tipo)).toEqual(["creado"]);
  });

  it("returns null for a contract that does not exist", async () => {
    const repo = new PrismaContratoRepository(prisma, new RelojFijo(new Date()));

    expect(await repo.porId("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("round-trips a signed contract with both signatures and both sealed documents", async () => {
    const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
    );

    const contrato = Contrato.crearBorrador({
      id: "22222222-2222-4222-8222-222222222222",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    await repo.guardar(contrato);

    const numero = await repo.siguienteNumero();
    contrato.firmar({
      numero,
      plantillaVersionId: plantillaId,
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);
    await repo.guardar(contrato);

    const leido = await repo.porId(contrato.id);

    expect(leido?.estado).toBe("vigente");
    expect(leido?.numero).toBe(numero);
    expect(leido?.plantillaVersionId).toBe(plantillaId);
    expect(leido?.firmanteId).toBe(firmanteId);
    expect(leido?.plazo?.fechaVencimiento.iso).toBe("2036-08-04");
    expect(leido?.firmas).toHaveLength(2);
    expect(leido?.documentos).toHaveLength(2);
    expect(leido?.documentos.map((d) => d.documento).sort()).toEqual([
      "comodato",
      "condiciones_generales",
    ]);
    expect(leido?.documentos.find((d) => d.documento === "comodato")?.sha256).toBe(
      "b".repeat(64),
    );
    expect(leido?.eventos.map((e) => e.tipo)).toEqual(["creado", "firmado"]);
    expect(leido?.contexto?.geo).toEqual({ latitud: -27.78, longitud: -64.26 });
    expect(leido?.contexto?.capturadoEn.toISOString()).toBe(
      contexto().capturadoEn.toISOString(),
    );
  });

  it("round-trips a terminated contract", async () => {
    const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
    );

    const contrato = Contrato.crearBorrador({
      id: "33333333-3333-4333-8333-333333333333",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    contrato.firmar({
      numero: await repo.siguienteNumero(),
      plantillaVersionId: plantillaId,
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);
    await repo.guardar(contrato);

    contrato.darDeBaja({
      motivo: "Deuda",
      fecha: FechaCalendario.desdeIso("2027-03-10"),
    });
    await repo.guardar(contrato);

    const leido = await repo.porId(contrato.id);

    expect(leido?.estado).toBe("dado_de_baja");
    expect(leido?.motivoBaja).toBe("Deuda");
    expect(leido?.fechaBaja?.iso).toBe("2027-03-10");
    expect(leido?.equiposPendientesDeRestitucion).toBe(true);
    expect(leido?.eventos.map((e) => e.tipo)).toEqual([
      "creado",
      "firmado",
      "dado_de_baja",
    ]);
  });

  it("keeps signature stroke timestamps intact through the jsonb round trip", async () => {
    const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
    );

    const firmaComodato = firmaDe("comodato", 5);
    const contrato = Contrato.crearBorrador({
      id: "44444444-4444-4444-8444-444444444444",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    contrato.firmar({
      numero: await repo.siguienteNumero(),
      plantillaVersionId: plantillaId,
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaComodato],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);
    await repo.guardar(contrato);

    const leido = await repo.porId(contrato.id);
    const firmaLeida = leido?.firmas.find((f) => f.documento === "comodato");

    expect(firmaLeida?.trazos).toEqual(firmaComodato.trazos);
    expect(firmaLeida?.duracionMs).toBe(firmaComodato.duracionMs);
    expect(firmaLeida?.cantidadPuntos).toBe(firmaComodato.cantidadPuntos);
  });

  it("does not attempt to rewrite earlier events when saving the same contract twice", async () => {
    const repo = new PrismaContratoRepository(prisma, new RelojFijo(new Date()));
    const contrato = Contrato.crearBorrador({
      id: "55555555-5555-4555-8555-555555555555",
      comodatario: comodatario(),
      equipos: equipos(),
    });

    await repo.guardar(contrato);
    const primeraLectura = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
    });
    expect(primeraLectura).toHaveLength(1);
    const idOriginal = primeraLectura[0]?.id;

    await repo.guardar(contrato);
    const segundaLectura = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
    });

    expect(segundaLectura).toHaveLength(1);
    expect(segundaLectura[0]?.id).toBe(idOriginal);
  });

  it("only inserts the new tail of events across real state transitions, never re-touching earlier rows", async () => {
    const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
    );

    const contrato = Contrato.crearBorrador({
      id: "66666666-6666-4666-8666-666666666666",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    await repo.guardar(contrato);

    contrato.firmar({
      numero: await repo.siguienteNumero(),
      plantillaVersionId: plantillaId,
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);
    await repo.guardar(contrato);

    const filasTrasFirmar = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
      orderBy: { registradoEn: "asc" },
    });
    expect(filasTrasFirmar.map((f) => f.tipo)).toEqual(["creado", "firmado"]);

    contrato.darDeBaja({
      motivo: "Baja solicitada",
      fecha: FechaCalendario.desdeIso("2027-01-15"),
    });
    await repo.guardar(contrato);

    const filasFinales = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
      orderBy: { registradoEn: "asc" },
    });
    expect(filasFinales.map((f) => f.tipo)).toEqual([
      "creado",
      "firmado",
      "dado_de_baja",
    ]);
    // The first two rows kept their original ids: never rewritten.
    expect(filasFinales.slice(0, 2).map((f) => f.id)).toEqual(
      filasTrasFirmar.map((f) => f.id),
    );

    const leido = await repo.porId(contrato.id);
    expect(leido?.eventos.map((e) => e.tipo)).toEqual([
      "creado",
      "firmado",
      "dado_de_baja",
    ]);
  });

  it("keeps events in order across separate saves even when the clock never advances", async () => {
    // Regression test: the anchor timestamp for a new batch must never be
    // allowed to collide with the previous batch's last timestamp. A clock
    // that returns the exact same instant on every call is the worst case —
    // relying on "now" alone would tie or invert the order here.
    const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojCongelado(new Date("2026-08-04T15:00:00.000Z")),
    );

    const contrato = Contrato.crearBorrador({
      id: "12121212-1212-4212-8212-121212121212",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    await repo.guardar(contrato); // +1: creado

    contrato.firmar({
      numero: await repo.siguienteNumero(),
      plantillaVersionId: plantillaId,
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);
    await repo.guardar(contrato); // +1: firmado

    contrato.darDeBaja({
      motivo: "Baja solicitada",
      fecha: FechaCalendario.desdeIso("2027-01-15"),
    });
    await repo.guardar(contrato); // +1: dado_de_baja

    const leido = await repo.porId(contrato.id);

    expect(leido?.eventos.map((e) => e.tipo)).toEqual([
      "creado",
      "firmado",
      "dado_de_baja",
    ]);
  });

  it("the database itself forbids ever mutating a stored event (append-only trigger)", async () => {
    const repo = new PrismaContratoRepository(prisma, new RelojFijo(new Date()));
    const contrato = Contrato.crearBorrador({
      id: "99999999-9999-4999-8999-999999999999",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    await repo.guardar(contrato);

    const [evento] = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
    });
    if (evento === undefined) {
      throw new Error("guardar() should have written the 'creado' event.");
    }

    await expect(
      prisma.eventoContrato.update({
        where: { id: evento.id },
        data: { detalle: "manipulado" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.eventoContrato.delete({ where: { id: evento.id } }),
    ).rejects.toThrow();
  });

  it("commits contract, signatures, documents and events together, or not at all", async () => {
    const { firmanteId } = await crearPlantillaYFirmanteActivos();
    const repo = new PrismaContratoRepository(
      prisma,
      new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
    );

    const contrato = Contrato.crearBorrador({
      id: "77777777-7777-4777-8777-777777777777",
      comodatario: comodatario(),
      equipos: equipos(),
    });
    contrato.firmar({
      numero: await repo.siguienteNumero(),
      plantillaVersionId: "plantilla-2026-01",
      firmanteId,
      fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });
    contrato.registrarDocumentos(DOCUMENTOS);

    // Force a mid-transaction failure: the contract now points at a
    // firmante that no longer exists in the database, so the foreign key on
    // contratos.firmante_id trips partway through guardar()'s transaction.
    await prisma.firmanteComodante.delete({ where: { id: firmanteId } });

    await expect(repo.guardar(contrato)).rejects.toThrow();

    const filaContrato = await prisma.contrato.findUnique({
      where: { id: contrato.id },
    });
    const firmas = await prisma.firmaCapturada.findMany({
      where: { contratoId: contrato.id },
    });
    const documentos = await prisma.documentoContrato.findMany({
      where: { contratoId: contrato.id },
    });
    const eventos = await prisma.eventoContrato.findMany({
      where: { contratoId: contrato.id },
    });

    expect(filaContrato).toBeNull();
    expect(firmas).toHaveLength(0);
    expect(documentos).toHaveLength(0);
    expect(eventos).toHaveLength(0);
  });

  it("siguienteNumero: concurrent calls never return the same number", async () => {
    const repo = new PrismaContratoRepository(prisma, new RelojFijo(new Date()));

    const numeros = await Promise.all(
      Array.from({ length: 10 }, () => repo.siguienteNumero()),
    );

    expect(new Set(numeros).size).toBe(numeros.length);
  });

  describe("outstanding-equipment query", () => {
    it("finds terminated contracts with no restitution recorded, and excludes everything else", async () => {
      const { plantillaId, firmanteId } = await crearPlantillaYFirmanteActivos();
      const repo = new PrismaContratoRepository(
        prisma,
        new RelojFijo(new Date("2026-08-04T15:00:00.000Z")),
      );

      const firmarYGuardar = async (id: string): Promise<Contrato> => {
        const contrato = Contrato.crearBorrador({
          id,
          comodatario: comodatario(),
          equipos: equipos(),
        });
        contrato.firmar({
          numero: await repo.siguienteNumero(),
          plantillaVersionId: plantillaId,
          firmanteId,
          fechaFirma: FechaCalendario.desdeIso("2026-08-04"),
          firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
          contexto: contexto(),
        });
        contrato.registrarDocumentos(DOCUMENTOS);
        await repo.guardar(contrato);
        return contrato;
      };

      const pendiente = await firmarYGuardar("88888888-8888-4888-8888-888888888881");
      pendiente.darDeBaja({
        motivo: "Baja",
        fecha: FechaCalendario.desdeIso("2027-01-10"),
      });
      await repo.guardar(pendiente);

      const restituido = await firmarYGuardar("88888888-8888-4888-8888-888888888882");
      restituido.darDeBaja({
        motivo: "Baja",
        fecha: FechaCalendario.desdeIso("2027-01-10"),
      });
      restituido.registrarRestitucion({
        fecha: FechaCalendario.desdeIso("2027-01-20"),
      });
      await repo.guardar(restituido);

      await firmarYGuardar("88888888-8888-4888-8888-888888888883"); // still vigente

      const pendientes = await prisma.contrato.findMany({
        where: { estado: "dado_de_baja", fechaRestitucion: null },
        select: { id: true },
      });

      expect(pendientes.map((c) => c.id)).toEqual([pendiente.id]);

      const leidoPendiente = await repo.porId(pendiente.id);
      expect(leidoPendiente?.equiposPendientesDeRestitucion).toBe(true);

      const leidoRestituido = await repo.porId(restituido.id);
      expect(leidoRestituido?.equiposPendientesDeRestitucion).toBe(false);
    });
  });
});
