import { beforeEach, describe, expect, it } from "vitest";

import { FirmanteComodante } from "../../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../../plantillas/domain/PlantillaContrato";
import { ConflictoDeConcurrencia } from "../../shared/domain/ConflictoDeConcurrencia";
import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { DomainError } from "../../shared/domain/DomainError";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "../domain/Comodatario";
import { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Contrato } from "../domain/Contrato";
import type { DocumentoContrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { FirmarContrato } from "./FirmarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";
import type {
  EntradaGeneracion,
  GeneradorDeDocumentos,
} from "./ports/GeneradorDeDocumentos";

const ID = "11111111-1111-4111-8111-111111111111";

// 21:30 in Argentina is already the next day in UTC.
const INSTANTE_FIRMA = new Date("2026-08-04T21:30:00-03:00");

const trazo = () =>
  Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [trazo()],
  });

const contexto = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "tecnico-07",
    dispositivoId: "tablet-lenovo-03",
    capturadoEn: INSTANTE_FIRMA,
  });

const nuevoBorrador = (): Contrato =>
  Contrato.crearBorrador({
    id: ID,
    comodatario: Comodatario.crear({
      nombreCompleto: "Juan Carlos Pérez",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC Gen2",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
  });

const PLANTILLA = PlantillaContrato.crear({
  id: "plantilla-2026-01",
  version: "2026-01",
  condicionesGeneralesHtml: "<h1>CONDICIONES GENERALES DE USO</h1>",
  comodatoHtml: "<h1>CONTRATO DE COMODATO</h1>",
  vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
});

const FIRMANTE = FirmanteComodante.crear({
  id: "firmante-sieira-v1",
  version: "v1",
  nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
  dni: "27.582.030",
  imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
});

class ContratosEnMemoria implements ContratoRepository {
  guardados: Contrato[] = [];
  /** Stands in for another request having written this contract first. */
  perderLaCarrera = false;
  private proximoNumero = 1042;

  constructor(private readonly almacenados: Map<string, Contrato> = new Map()) {}

  agregar(contrato: Contrato): void {
    this.almacenados.set(contrato.id, contrato);
  }

  porId(id: string): Promise<Contrato | null> {
    return Promise.resolve(this.almacenados.get(id) ?? null);
  }

  guardar(contrato: Contrato): Promise<void> {
    if (this.perderLaCarrera) {
      return Promise.reject(
        new ConflictoDeConcurrencia("Otra persona guardó este contrato."),
      );
    }
    this.guardados.push(contrato);
    this.almacenados.set(contrato.id, contrato);
    return Promise.resolve();
  }

  siguienteNumero(): Promise<number> {
    return Promise.resolve(this.proximoNumero++);
  }
}

class GeneradorFalso implements GeneradorDeDocumentos {
  recibido: EntradaGeneracion | null = null;
  fallar = false;

  generar(entrada: EntradaGeneracion): Promise<readonly DocumentoContrato[]> {
    if (this.fallar) {
      return Promise.reject(new Error("Chromium se quedó sin memoria"));
    }
    this.recibido = entrada;

    return Promise.resolve([
      {
        documento: "condiciones_generales",
        ruta: `contratos/${entrada.numero}/condiciones.pdf`,
        sha256: "a".repeat(64),
      },
      {
        documento: "comodato",
        ruta: `contratos/${entrada.numero}/comodato.pdf`,
        sha256: "b".repeat(64),
      },
    ]);
  }
}

describe("FirmarContrato", () => {
  let contratos: ContratosEnMemoria;
  let generador: GeneradorFalso;
  let firmar: FirmarContrato;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    generador = new GeneradorFalso();
    firmar = new FirmarContrato(
      contratos,
      { vigente: () => Promise.resolve(PLANTILLA) },
      { activo: () => Promise.resolve(FIRMANTE) },
      generador,
      { ahora: () => INSTANTE_FIRMA },
    );
  });

  const ejecutar = () =>
    firmar.ejecutar({
      contratoId: ID,
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contexto(),
    });

  describe("the happy path", () => {
    beforeEach(() => {
      contratos.agregar(nuevoBorrador());
    });

    it("puts the contract in force", async () => {
      const contrato = await ejecutar();

      expect(contrato.estado).toBe("vigente");
    });

    it("takes the next number from the server, never from the tablet", async () => {
      const contrato = await ejecutar();

      expect(contrato.numero).toBe(1042);
    });

    it("dates the contract in Argentine time, not UTC", async () => {
      const contrato = await ejecutar();

      // The same instant is already 2026-08-05 in UTC.
      expect(contrato.fechaFirma?.iso).toBe("2026-08-04");
      expect(INSTANTE_FIRMA.toISOString().slice(0, 10)).toBe("2026-08-05");
    });

    it("derives the ten-year expiry from that date", async () => {
      const contrato = await ejecutar();

      expect(contrato.plazo?.fechaVencimiento.iso).toBe("2036-08-04");
    });

    it("snapshots the template in force, so the text can never drift", async () => {
      const contrato = await ejecutar();

      expect(contrato.plantillaVersionId).toBe("plantilla-2026-01");
    });

    it("snapshots the signatory whose signature was stamped", async () => {
      const contrato = await ejecutar();

      expect(contrato.firmanteId).toBe("firmante-sieira-v1");
    });

    it("renders from the sealed values, never from the aggregate itself", async () => {
      await ejecutar();

      expect(generador.recibido?.numero).toBe(1042);
      expect(generador.recibido?.fechaFirma.iso).toBe("2026-08-04");
      expect(generador.recibido?.plazo.fechaVencimiento.iso).toBe("2036-08-04");
      expect(generador.recibido?.comodatario.dni.formateado).toBe("30.123.456");
      expect(generador.recibido?.equipos.antenaMac.valor).toBe(
        "AC:8B:A9:12:34:56",
      );
      expect(generador.recibido?.firmas).toHaveLength(2);
      expect(generador.recibido?.plantilla.id).toBe("plantilla-2026-01");
      expect(generador.recibido?.firmante.id).toBe("firmante-sieira-v1");
    });

    it("seals the rendered PDFs with their hashes", async () => {
      const contrato = await ejecutar();

      expect(contrato.documentos).toHaveLength(2);
      expect(contrato.documentos[0]?.sha256).toHaveLength(64);
    });

    it("persists the contract once", async () => {
      await ejecutar();

      expect(contratos.guardados).toHaveLength(1);
      expect(contratos.guardados[0]?.estado).toBe("vigente");
    });
  });

  describe("when it cannot proceed", () => {
    it("fails when the contract does not exist", async () => {
      await expect(ejecutar()).rejects.toThrow(DomainError);
    });

    /**
     * A contract id that names nothing is not a bad field: 404, so the tablet
     * shows "that contract no longer exists" instead of asking the technician
     * to correct a form that is already correct.
     */
    it("reports a contract that does not exist as not found", async () => {
      await expect(ejecutar()).rejects.toThrow(RecursoNoEncontrado);
    });

    it("fails when the contract was already signed", async () => {
      contratos.agregar(nuevoBorrador());
      await ejecutar();

      await expect(ejecutar()).rejects.toThrow(DomainError);
    });

    /**
     * Retry safety. The tablet is on a field connection: a `POST /firmar`
     * that times out *after* the server sealed the contract will be sent
     * again, and the second attempt has to be refused as a state conflict —
     * 409, "someone already did this" — not as bad input the technician could
     * fix by retyping.
     *
     * `ConflictoDeEstado` is what carries that to the HTTP layer, and the
     * aggregate already throws it from `firmar()`. This use case guards
     * earlier, before spending a contract number and a PDF render on a
     * request it is going to refuse, so it has to speak the same language.
     */
    it("refuses a retried signature as a state conflict, not as bad input", async () => {
      contratos.agregar(nuevoBorrador());
      await ejecutar();

      await expect(ejecutar()).rejects.toThrow(ConflictoDeEstado);
    });

    it("neither double-signs nor burns a second number on a retry", async () => {
      contratos.agregar(nuevoBorrador());
      const primero = await ejecutar();

      await expect(ejecutar()).rejects.toThrow(ConflictoDeEstado);

      const almacenado = await contratos.porId(ID);
      expect(almacenado?.numero).toBe(primero.numero);
      expect(almacenado?.firmas).toHaveLength(2);
      expect(almacenado?.documentos).toHaveLength(2);
      // One save, and the sequence never advanced a second time.
      expect(contratos.guardados).toHaveLength(1);
      expect(await contratos.siguienteNumero()).toBe(1043);
    });

    it("fails when a signature is missing", async () => {
      contratos.agregar(nuevoBorrador());

      await expect(
        firmar.ejecutar({
          contratoId: ID,
          firmas: [firmaDe("comodato")],
          contexto: contexto(),
        }),
      ).rejects.toThrow(DomainError);
    });

    it("persists nothing when rendering the PDF fails", async () => {
      contratos.agregar(nuevoBorrador());
      generador.fallar = true;

      await expect(ejecutar()).rejects.toThrow();
      expect(contratos.guardados).toHaveLength(0);
    });

    it("leaves the stored contract untouched when rendering fails", async () => {
      contratos.agregar(nuevoBorrador());
      generador.fallar = true;

      await expect(ejecutar()).rejects.toThrow();

      const almacenado = await contratos.porId(ID);
      expect(almacenado?.documentos).toHaveLength(0);
    });

    it("leaves the contract a draft when rendering fails, not half signed", async () => {
      contratos.agregar(nuevoBorrador());
      generador.fallar = true;

      await expect(ejecutar()).rejects.toThrow();

      const almacenado = await contratos.porId(ID);
      expect(almacenado?.estado).toBe("borrador");
      expect(almacenado?.numero).toBeNull();
      expect(almacenado?.firmas).toHaveLength(0);
    });

    /**
     * The repository is the only thing that can tell two simultaneous signers
     * apart, and it does so by refusing the second save. This use case must
     * let that refusal through exactly as it is: rewrapping it as a state
     * conflict would tell whoever reads the logs that somebody tried to sign
     * an already-signed contract, which is a different — and much less
     * alarming — fact than two requests colliding.
     */
    it("passes a lost race through untouched, as a concurrency conflict", async () => {
      contratos.agregar(nuevoBorrador());
      contratos.perderLaCarrera = true;

      const error: unknown = await ejecutar().catch((causa: unknown) => causa);

      expect(error).toBeInstanceOf(ConflictoDeConcurrencia);
      expect(error).not.toBeInstanceOf(ConflictoDeEstado);
    });

    it("lets the technician retry once rendering recovers", async () => {
      contratos.agregar(nuevoBorrador());

      // Chromium runs out of memory on the VPS — the failure DESIGN.md §7
      // calls the single biggest resource risk of the system.
      generador.fallar = true;
      await expect(ejecutar()).rejects.toThrow();

      generador.fallar = false;
      const contrato = await ejecutar();

      expect(contrato.estado).toBe("vigente");
      expect(contrato.documentos).toHaveLength(2);
    });
  });
});
