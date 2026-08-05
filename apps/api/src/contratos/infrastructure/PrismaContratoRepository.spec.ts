import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../../generated/prisma/client";
import { ConflictoDeConcurrencia } from "../../shared/domain/ConflictoDeConcurrencia";
import type { Reloj } from "../application/ports/Reloj";
import { Comodatario } from "../domain/Comodatario";
import { Contrato } from "../domain/Contrato";
import type { EstadoPersistido } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { PrismaContratoRepository } from "./PrismaContratoRepository";

/**
 * What `guardar` does to the *contratos row itself*, with the database stood
 * in for.
 *
 * This suite proves one thing only: that the repository issues a
 * compare-and-set instead of an unconditional write, and refuses rather than
 * continues when it matches nothing. It cannot prove that two real
 * transactions serialise — a fake that answers `{ count: 0 }` on demand is
 * just this test agreeing with itself. That claim is
 * `PrismaContratoRepository.integration.spec.ts`'s job, against real Postgres,
 * with two saves genuinely in flight at once.
 */

interface LlamadaActualizar {
  readonly where: { id: string; version: number };
  readonly data: { version: number };
}

/**
 * The narrow slice of the Prisma client `guardar` touches. Every method
 * records what it was asked to do; `filasActualizadas` is the one knob a test
 * turns, because it is the answer that decides whether the save won or lost.
 */
class PrismaFalso {
  readonly creados: Array<{ id: string; version: number }> = [];
  readonly actualizaciones: LlamadaActualizar[] = [];
  readonly eventosInsertados: unknown[] = [];
  filasActualizadas = 1;
  eventosYaGuardados = 0;

  private readonly tx = {
    contrato: {
      create: (args: { data: { id: string; version: number } }) => {
        this.creados.push({ id: args.data.id, version: args.data.version });
        return Promise.resolve(args.data);
      },
      updateMany: (args: LlamadaActualizar) => {
        this.actualizaciones.push(args);
        return Promise.resolve({ count: this.filasActualizadas });
      },
    },
    firmaCapturada: { upsert: () => Promise.resolve({}) },
    documentoContrato: { upsert: () => Promise.resolve({}) },
    eventoContrato: {
      count: () => Promise.resolve(this.eventosYaGuardados),
      findFirst: () => Promise.resolve(null),
      createMany: (args: { data: unknown[] }) => {
        this.eventosInsertados.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      },
    },
  };

  $transaction<T>(trabajo: (tx: unknown) => Promise<T>): Promise<T> {
    return trabajo(this.tx);
  }

  comoPrisma(): PrismaClient {
    return this as unknown as PrismaClient;
  }
}

const relojFijo: Reloj = { ahora: () => new Date("2026-08-04T15:00:00.000Z") };

const ID = "11111111-1111-4111-8111-111111111111";

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

const nuevoBorrador = (): Contrato =>
  Contrato.crearBorrador({ id: ID, comodatario: comodatario(), equipos: equipos() });

/** A draft as it comes back from storage, at whatever version the test needs. */
const borradorCargado = (version: number): Contrato => {
  const estado: EstadoPersistido = {
    id: ID,
    estado: "borrador",
    version,
    comodatario: comodatario(),
    equipos: equipos(),
    reemplazaA: null,
    numero: null,
    plazo: null,
    fechaFirma: null,
    plantillaVersionId: null,
    firmanteId: null,
    firmas: [],
    contexto: null,
    documentos: [],
    motivoBaja: null,
    fechaBaja: null,
    motivoAnulacion: null,
    fechaAnulacion: null,
    fechaRestitucion: null,
    eventos: [{ tipo: "creado", fecha: null, detalle: null }],
  };

  return Contrato.rehidratar(estado);
};

describe("PrismaContratoRepository.guardar (conditional write)", () => {
  it("inserts a contract that has never been stored, at the first version", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);

    await repo.guardar(nuevoBorrador());

    expect(prisma.creados).toEqual([{ id: ID, version: 1 }]);
    expect(prisma.actualizaciones).toHaveLength(0);
  });

  it("updates only the row still at the version this aggregate was read from, and moves it on", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    prisma.eventosYaGuardados = 1;

    await repo.guardar(borradorCargado(4));

    expect(prisma.creados).toHaveLength(0);
    expect(prisma.actualizaciones).toHaveLength(1);
    expect(prisma.actualizaciones[0]?.where).toEqual({ id: ID, version: 4 });
    expect(prisma.actualizaciones[0]?.data.version).toBe(5);
  });

  /**
   * The whole point. Zero rows matched means the stored contract moved on
   * between the read and this write — somebody else got there first — and the
   * save has to fail loudly rather than quietly write nothing and report
   * success to a technician whose signature was thrown away.
   */
  it("refuses when the update matched no row", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    prisma.filasActualizadas = 0;

    await expect(repo.guardar(borradorCargado(4))).rejects.toThrow(
      ConflictoDeConcurrencia,
    );
  });

  it("says so in words a technician can act on, without naming rows or versions", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    prisma.filasActualizadas = 0;

    await expect(repo.guardar(borradorCargado(4))).rejects.toThrow(
      /pantalla|recarg/i,
    );
    await expect(repo.guardar(borradorCargado(4))).rejects.not.toThrow(
      /versión|version|fila|transacc/i,
    );
  });

  /**
   * A lost race must not leave a trace in the append-only log. The refusal has
   * to come before the event tail is appended, so the transaction that rolls
   * back has nothing to roll back.
   */
  it("appends no event when the update matched no row", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    prisma.filasActualizadas = 0;

    await expect(repo.guardar(borradorCargado(4))).rejects.toThrow();
    expect(prisma.eventosInsertados).toHaveLength(0);
  });

  /**
   * After a save commits, the aggregate in memory is at the version the row
   * now holds. Without this, re-saving an unchanged contract — which `guardar`
   * supports on purpose — would compare against a version its own previous
   * save had already replaced.
   */
  it("leaves the aggregate at the version it just wrote, so the same instance can be saved again", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    const contrato = borradorCargado(4);

    await repo.guardar(contrato);
    expect(contrato.versionAlmacenada).toBe(5);

    prisma.eventosYaGuardados = 1;
    await repo.guardar(contrato);

    expect(prisma.actualizaciones[1]?.where).toEqual({ id: ID, version: 5 });
    expect(prisma.actualizaciones[1]?.data.version).toBe(6);
  });

  it("does not move the aggregate's version when the save was refused", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    const contrato = borradorCargado(4);
    prisma.filasActualizadas = 0;

    await expect(repo.guardar(contrato)).rejects.toThrow(
      ConflictoDeConcurrencia,
    );

    expect(contrato.versionAlmacenada).toBe(4);
  });

  it("still writes the contract's own columns, not just the version", async () => {
    const prisma = new PrismaFalso();
    const repo = new PrismaContratoRepository(prisma.comoPrisma(), relojFijo);
    const contrato = borradorCargado(1);
    contrato.actualizarEquipos(
      Equipos.crear({
        antenaModelo: "PowerBeam 5AC",
        antenaMac: "ac8ba9999999",
        poe: false,
        canoMetros: 3,
      }),
    );

    await repo.guardar(contrato);

    const datos = prisma.actualizaciones[0]?.data as unknown as {
      equipoAntenaModelo: string;
      estado: string;
      fechaFirma: Date | null;
    };
    expect(datos.equipoAntenaModelo).toBe("PowerBeam 5AC");
    expect(datos.estado).toBe("borrador");
    expect(datos.fechaFirma).toBeNull();
  });
});
