import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "./Comodatario";
import { ContextoDeFirma } from "./ContextoDeFirma";
import { Contrato } from "./Contrato";
import type { EstadoPersistido } from "./Contrato";
import { Equipos } from "./Equipos";
import { FirmaCapturada } from "./FirmaCapturada";
import type { TipoDocumentoFirmado } from "./FirmaCapturada";
import { Plazo } from "./Plazo";

const ID = "11111111-1111-4111-8111-111111111111";
const FIRMA = FechaCalendario.desdeIso("2026-08-04");

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
    canoMetros: 6,
  });

const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }))],
  });

const contexto = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "tecnico-07",
    dispositivoId: "tablet-lenovo-03",
    capturadoEn: new Date("2026-08-04T18:00:00-03:00"),
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

const borradorPersistido = (): EstadoPersistido => ({
  id: ID,
  estado: "borrador",
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
});

const vigentePersistido = (): EstadoPersistido => ({
  ...borradorPersistido(),
  estado: "vigente",
  numero: 1042,
  plazo: Plazo.estandarDesde(FIRMA),
  fechaFirma: FIRMA,
  plantillaVersionId: "plantilla-2026-01",
  firmanteId: "firmante-sieira-v1",
  firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
  contexto: contexto(),
  documentos: DOCUMENTOS,
  eventos: [
    { tipo: "creado", fecha: null, detalle: null },
    { tipo: "firmado", fecha: FIRMA, detalle: "Nº 1042" },
  ],
});

/** Builds a contract through the real business flow, for round-trip checks. */
const firmadoDeVerdad = (): Contrato => {
  const contrato = Contrato.crearBorrador({
    id: ID,
    comodatario: comodatario(),
    equipos: equipos(),
  });
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

describe("Contrato.rehidratar", () => {
  describe("restores what was stored", () => {
    it("restores a draft", () => {
      const contrato = Contrato.rehidratar(borradorPersistido());

      expect(contrato.id).toBe(ID);
      expect(contrato.estado).toBe("borrador");
      expect(contrato.numero).toBeNull();
      expect(contrato.comodatario.dni.formateado).toBe("30.123.456");
    });

    it("restores a signed contract with everything it carries", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());

      expect(contrato.estado).toBe("vigente");
      expect(contrato.numero).toBe(1042);
      expect(contrato.fechaFirma?.iso).toBe("2026-08-04");
      expect(contrato.plazo?.fechaVencimiento.iso).toBe("2036-08-04");
      expect(contrato.plantillaVersionId).toBe("plantilla-2026-01");
      expect(contrato.firmas).toHaveLength(2);
      expect(contrato.documentos).toHaveLength(2);
      expect(contrato.contexto?.tecnicoId).toBe("tecnico-07");
    });

    it("restores a terminated contract", () => {
      const contrato = Contrato.rehidratar({
        ...vigentePersistido(),
        estado: "dado_de_baja",
        motivoBaja: "Deuda",
        fechaBaja: FechaCalendario.desdeIso("2027-03-10"),
      });

      expect(contrato.estado).toBe("dado_de_baja");
      expect(contrato.motivoBaja).toBe("Deuda");
      expect(contrato.equiposPendientesDeRestitucion).toBe(true);
    });

    it("restores an annulled contract and the one it replaces", () => {
      const contrato = Contrato.rehidratar({
        ...vigentePersistido(),
        estado: "anulado",
        motivoAnulacion: "DNI equivocado",
        fechaAnulacion: FIRMA,
        reemplazaA: "otro-contrato",
      });

      expect(contrato.estado).toBe("anulado");
      expect(contrato.reemplazaA).toBe("otro-contrato");
    });

    it("restores the event log without inventing new events", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());

      expect(contrato.eventos.map((e) => e.tipo)).toEqual([
        "creado",
        "firmado",
      ]);
    });
  });

  describe("refuses corrupt stored state", () => {
    it("rejects a signed contract with no number", () => {
      expect(() =>
        Contrato.rehidratar({ ...vigentePersistido(), numero: null }),
      ).toThrow(DomainError);
    });

    it("rejects a signed contract with no term", () => {
      expect(() =>
        Contrato.rehidratar({ ...vigentePersistido(), plazo: null }),
      ).toThrow(DomainError);
    });

    it("rejects a signed contract with no signature date", () => {
      expect(() =>
        Contrato.rehidratar({ ...vigentePersistido(), fechaFirma: null }),
      ).toThrow(DomainError);
    });

    it("rejects a signed contract with no template version", () => {
      expect(() =>
        Contrato.rehidratar({
          ...vigentePersistido(),
          plantillaVersionId: null,
        }),
      ).toThrow(DomainError);
    });

    it("rejects a signed contract missing a signature", () => {
      expect(() =>
        Contrato.rehidratar({
          ...vigentePersistido(),
          firmas: [firmaDe("comodato")],
        }),
      ).toThrow(DomainError);
    });

    it("rejects a draft that somehow carries a contract number", () => {
      expect(() =>
        Contrato.rehidratar({ ...borradorPersistido(), numero: 1042 }),
      ).toThrow(DomainError);
    });

    it("rejects a draft that somehow carries signatures", () => {
      expect(() =>
        Contrato.rehidratar({
          ...borradorPersistido(),
          firmas: [firmaDe("comodato"), firmaDe("condiciones_generales")],
        }),
      ).toThrow(DomainError);
    });

    it("rejects a terminated contract with no reason", () => {
      expect(() =>
        Contrato.rehidratar({
          ...vigentePersistido(),
          estado: "dado_de_baja",
          motivoBaja: null,
          fechaBaja: FIRMA,
        }),
      ).toThrow(DomainError);
    });

    it("rejects an annulled contract with no date", () => {
      expect(() =>
        Contrato.rehidratar({
          ...vigentePersistido(),
          estado: "anulado",
          motivoAnulacion: "Error",
          fechaAnulacion: null,
        }),
      ).toThrow(DomainError);
    });

    it("says the stored contract is inconsistent, not that the input is invalid", () => {
      expect(() =>
        Contrato.rehidratar({ ...vigentePersistido(), numero: null }),
      ).toThrow(/inconsistente|almacenad/i);
    });
  });

  describe("a rehydrated contract is a real contract", () => {
    it("still refuses to be edited once signed", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());

      expect(() => contrato.actualizarEquipos(equipos())).toThrow(DomainError);
    });

    it("still refuses to be signed twice", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());

      expect(() =>
        contrato.firmar({
          numero: 9999,
          plantillaVersionId: "x",
          firmanteId: "y",
          fechaFirma: FIRMA,
          firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
          contexto: contexto(),
        }),
      ).toThrow(DomainError);
    });

    it("still refuses to have its documents replaced", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());

      expect(() => contrato.registrarDocumentos(DOCUMENTOS)).toThrow(
        DomainError,
      );
    });

    it("can continue its life: a rehydrated contract can be terminated", () => {
      const contrato = Contrato.rehidratar(vigentePersistido());
      contrato.darDeBaja({
        motivo: "Baja solicitada",
        fecha: FechaCalendario.desdeIso("2027-01-15"),
      });

      expect(contrato.estado).toBe("dado_de_baja");
      expect(contrato.eventos.map((e) => e.tipo)).toEqual([
        "creado",
        "firmado",
        "dado_de_baja",
      ]);
    });
  });

  describe("round trip", () => {
    it("survives being written out and read back unchanged", () => {
      const original = firmadoDeVerdad();

      // Exactly what a repository mapper would read off the aggregate.
      const rehidratado = Contrato.rehidratar({
        id: original.id,
        estado: original.estado,
        comodatario: original.comodatario,
        equipos: original.equipos,
        reemplazaA: original.reemplazaA,
        numero: original.numero,
        plazo: original.plazo,
        fechaFirma: original.fechaFirma,
        plantillaVersionId: original.plantillaVersionId,
        firmanteId: original.firmanteId,
        firmas: original.firmas,
        contexto: original.contexto,
        documentos: original.documentos,
        motivoBaja: original.motivoBaja,
        fechaBaja: original.fechaBaja,
        motivoAnulacion: original.motivoAnulacion,
        fechaAnulacion: original.fechaAnulacion,
        fechaRestitucion: original.fechaRestitucion,
        eventos: original.eventos,
      });

      expect(rehidratado.estado).toBe(original.estado);
      expect(rehidratado.numero).toBe(original.numero);
      expect(rehidratado.fechaFirma?.iso).toBe(original.fechaFirma?.iso);
      expect(rehidratado.plazo?.fechaVencimiento.iso).toBe(
        original.plazo?.fechaVencimiento.iso,
      );
      expect(rehidratado.firmas).toHaveLength(original.firmas.length);
      expect(rehidratado.documentos[0]?.sha256).toBe(
        original.documentos[0]?.sha256,
      );
      expect(rehidratado.eventos.map((e) => e.tipo)).toEqual(
        original.eventos.map((e) => e.tipo),
      );
      expect(rehidratado.contexto?.capturadoEn.toISOString()).toBe(
        original.contexto?.capturadoEn.toISOString(),
      );
    });
  });
});
