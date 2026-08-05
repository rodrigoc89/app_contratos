import { beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "./Comodatario";
import { ContextoDeFirma } from "./ContextoDeFirma";
import { Contrato } from "./Contrato";
import { Equipos } from "./Equipos";
import { FirmaCapturada } from "./FirmaCapturada";
import type { TipoDocumentoFirmado } from "./FirmaCapturada";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");

const trazo = () =>
  Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [trazo()],
  });

const ambasFirmas = (): FirmaCapturada[] => [
  firmaDe("condiciones_generales"),
  firmaDe("comodato"),
];

const contextoDeFirma = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "tecnico-07",
    dispositivoId: "tablet-lenovo-03",
    capturadoEn: new Date("2026-08-04T18:00:00-03:00"),
  });

const comodatario = (): Comodatario =>
  Comodatario.crear({
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30.123.456",
    domicilioCalle: "Av. Belgrano 1250",
    ciudad: "La Banda",
    whatsapp: "3854123456",
  });

const otroComodatario = (): Comodatario =>
  Comodatario.crear({
    nombreCompleto: "María Elena Gómez",
    dni: "28.999.111",
    domicilioCalle: "Rivadavia 45",
    ciudad: "Santiago del Estero",
    whatsapp: "3855550000",
  });

const equipos = (): Equipos =>
  Equipos.crear({
    antenaModelo: "LiteBeam 5AC Gen2",
    antenaMac: "ac8ba9123456",
    poe: true,
    canoMetros: 6,
  });

const borrador = (): Contrato =>
  Contrato.crearBorrador({
    id: "11111111-1111-4111-8111-111111111111",
    comodatario: comodatario(),
    equipos: equipos(),
  });

const DATOS_FIRMA = {
  numero: 1042,
  plantillaVersionId: "plantilla-2026-01",
  firmanteId: "firmante-sieira-v1",
  fechaFirma: FIRMA,
  firmas: ambasFirmas(),
  contexto: contextoDeFirma(),
};

const firmado = (): Contrato => {
  const contrato = borrador();
  contrato.firmar(DATOS_FIRMA);
  return contrato;
};

const tipos = (contrato: Contrato): string[] =>
  contrato.eventos.map((evento) => evento.tipo);

describe("Contrato", () => {
  describe("draft", () => {
    let contrato: Contrato;

    beforeEach(() => {
      contrato = borrador();
    });

    it("starts as a draft with no legal value", () => {
      expect(contrato.estado).toBe("borrador");
      expect(contrato.estaFirmado).toBe(false);
    });

    it("has no number until the server assigns one at signing", () => {
      expect(contrato.numero).toBeNull();
    });

    it("has no term until it is signed, because the term starts at signature", () => {
      expect(contrato.plazo).toBeNull();
    });

    it("records its creation", () => {
      expect(tipos(contrato)).toEqual(["creado"]);
    });

    it("can still be corrected while it is a draft", () => {
      contrato.actualizarComodatario(otroComodatario());
      contrato.actualizarEquipos(
        Equipos.crear({
          antenaModelo: "NanoStation",
          antenaMac: "AABBCCDDEEFF",
          poe: false,
          canoMetros: 3,
        }),
      );

      expect(contrato.comodatario.nombreCompleto).toBe("María Elena Gómez");
      expect(contrato.equipos.antenaModelo).toBe("NanoStation");
    });

    it("can point at the contract it replaces", () => {
      const reemplazo = Contrato.crearBorrador({
        id: "22222222-2222-4222-8222-222222222222",
        comodatario: comodatario(),
        equipos: equipos(),
        reemplazaA: "11111111-1111-4111-8111-111111111111",
      });

      expect(reemplazo.reemplazaA).toBe("11111111-1111-4111-8111-111111111111");
    });
  });

  describe("signing", () => {
    it("becomes in force", () => {
      expect(firmado().estado).toBe("vigente");
      expect(firmado().estaFirmado).toBe(true);
    });

    it("takes the number assigned by the server", () => {
      expect(firmado().numero).toBe(1042);
    });

    it("derives the ten-year term from the signature date", () => {
      const plazo = firmado().plazo;

      expect(plazo?.fechaInicio.iso).toBe("2026-08-04");
      expect(plazo?.meses).toBe(120);
      expect(plazo?.fechaVencimiento.iso).toBe("2036-08-04");
    });

    it("snapshots the template version, so the text can never drift", () => {
      expect(firmado().plantillaVersionId).toBe("plantilla-2026-01");
    });

    it("snapshots the comodante signatory that was stamped on it", () => {
      expect(firmado().firmanteId).toBe("firmante-sieira-v1");
    });

    it("records the signature", () => {
      expect(tipos(firmado())).toEqual(["creado", "firmado"]);
    });

    it("refuses to be signed twice", () => {
      const contrato = firmado();

      expect(() => contrato.firmar({ ...DATOS_FIRMA, numero: 1043 })).toThrow(
        DomainError,
      );
    });

    describe("rejects an incomplete signature", () => {
      it("rejects a non-positive contract number", () => {
        expect(() => borrador().firmar({ ...DATOS_FIRMA, numero: 0 })).toThrow(
          DomainError,
        );
      });

      it("rejects a fractional contract number", () => {
        expect(() => borrador().firmar({ ...DATOS_FIRMA, numero: 1.5 })).toThrow(
          DomainError,
        );
      });

      it("rejects a missing template version", () => {
        expect(() =>
          borrador().firmar({ ...DATOS_FIRMA, plantillaVersionId: "" }),
        ).toThrow(DomainError);
      });

      it("rejects a missing signatory", () => {
        expect(() =>
          borrador().firmar({ ...DATOS_FIRMA, firmanteId: "  " }),
        ).toThrow(DomainError);
      });
    });

    describe("both documents must actually be signed", () => {
      it("keeps the two signatures the customer gave", () => {
        const contrato = firmado();

        expect(contrato.firmas.map((f) => f.documento).sort()).toEqual([
          "comodato",
          "condiciones_generales",
        ]);
      });

      it("keeps the context the signature was captured in", () => {
        expect(firmado().contexto?.tecnicoId).toBe("tecnico-07");
      });

      it("refuses to sign with no signatures at all", () => {
        expect(() =>
          borrador().firmar({ ...DATOS_FIRMA, firmas: [] }),
        ).toThrow(DomainError);
      });

      it("refuses to sign the comodato without the general conditions", () => {
        expect(() =>
          borrador().firmar({
            ...DATOS_FIRMA,
            firmas: [firmaDe("comodato")],
          }),
        ).toThrow(DomainError);
      });

      it("refuses to sign the general conditions without the comodato", () => {
        expect(() =>
          borrador().firmar({
            ...DATOS_FIRMA,
            firmas: [firmaDe("condiciones_generales")],
          }),
        ).toThrow(DomainError);
      });

      it("refuses to take the same document signed twice", () => {
        expect(() =>
          borrador().firmar({
            ...DATOS_FIRMA,
            firmas: [firmaDe("comodato"), firmaDe("comodato")],
          }),
        ).toThrow(DomainError);
      });

      it("names the missing document so the flow can go back to it", () => {
        expect(() =>
          borrador().firmar({
            ...DATOS_FIRMA,
            firmas: [firmaDe("comodato")],
          }),
        ).toThrow(/condiciones/i);
      });
    });
  });

  describe("sealing the rendered documents", () => {
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

    it("stores the rendered PDFs with their hashes", () => {
      const contrato = firmado();
      contrato.registrarDocumentos(DOCUMENTOS);

      expect(contrato.documentos).toHaveLength(2);
      expect(contrato.documentos[0]?.sha256).toBe("a".repeat(64));
    });

    it("refuses to seal a draft", () => {
      expect(() => borrador().registrarDocumentos(DOCUMENTOS)).toThrow(
        DomainError,
      );
    });

    it("refuses to re-seal, which would replace the evidence", () => {
      const contrato = firmado();
      contrato.registrarDocumentos(DOCUMENTOS);

      expect(() => contrato.registrarDocumentos(DOCUMENTOS)).toThrow(
        DomainError,
      );
    });

    it("refuses to seal without both documents", () => {
      const contrato = firmado();

      expect(() =>
        contrato.registrarDocumentos([DOCUMENTOS[0] as (typeof DOCUMENTOS)[0]]),
      ).toThrow(DomainError);
    });

    it("refuses a path that escapes the document store", () => {
      const contrato = firmado();

      expect(() =>
        contrato.registrarDocumentos([
          DOCUMENTOS[0] as (typeof DOCUMENTOS)[0],
          {
            ...(DOCUMENTOS[1] as (typeof DOCUMENTOS)[1]),
            ruta: "../../etc/passwd",
          },
        ]),
      ).toThrow(DomainError);
    });

    it("refuses an absolute path", () => {
      const contrato = firmado();

      expect(() =>
        contrato.registrarDocumentos([
          DOCUMENTOS[0] as (typeof DOCUMENTOS)[0],
          {
            ...(DOCUMENTOS[1] as (typeof DOCUMENTOS)[1]),
            ruta: "/var/lib/contratos/x.pdf",
          },
        ]),
      ).toThrow(DomainError);
    });

    it("refuses a hash that is not a SHA-256", () => {
      const contrato = firmado();

      expect(() =>
        contrato.registrarDocumentos([
          DOCUMENTOS[0] as (typeof DOCUMENTOS)[0],
          { ...(DOCUMENTOS[1] as (typeof DOCUMENTOS)[1]), sha256: "corto" },
        ]),
      ).toThrow(DomainError);
    });
  });

  describe("signing is all-or-nothing", () => {
    it("leaves the draft completely untouched when the term is invalid", () => {
      const contrato = borrador();

      expect(() => contrato.firmar({ ...DATOS_FIRMA, plazoMeses: 0 })).toThrow(
        DomainError,
      );

      // Anything that read `numero` or `firmas` as a signedness proxy would
      // otherwise see a contract that looks signed while its state says draft.
      expect(contrato.estado).toBe("borrador");
      expect(contrato.numero).toBeNull();
      expect(contrato.firmas).toHaveLength(0);
      expect(contrato.contexto).toBeNull();
      expect(contrato.plantillaVersionId).toBeNull();
      expect(contrato.fechaFirma).toBeNull();
    });

    it("leaves the draft untouched when a signature is missing", () => {
      const contrato = borrador();

      expect(() =>
        contrato.firmar({ ...DATOS_FIRMA, firmas: [firmaDe("comodato")] }),
      ).toThrow(DomainError);

      expect(contrato.numero).toBeNull();
      expect(contrato.firmas).toHaveLength(0);
    });

    it("does not let the captured instant be moved after signing", () => {
      const contrato = firmado();

      contrato.contexto?.capturadoEn.setFullYear(1999);

      expect(contrato.contexto?.capturadoEn.getFullYear()).toBe(2026);
    });
  });

  describe("immutability once signed", () => {
    it("refuses to change the customer", () => {
      const contrato = firmado();

      expect(() => contrato.actualizarComodatario(otroComodatario())).toThrow(
        DomainError,
      );
    });

    it("refuses to change the equipment", () => {
      const contrato = firmado();

      expect(() => contrato.actualizarEquipos(equipos())).toThrow(DomainError);
    });

    it("explains that a signed contract is annulled and re-signed, never edited", () => {
      const contrato = firmado();

      expect(() => contrato.actualizarComodatario(otroComodatario())).toThrow(
        /anul/i,
      );
    });
  });

  describe("termination", () => {
    it("moves an in-force contract out of force", () => {
      const contrato = firmado();
      contrato.darDeBaja({
        motivo: "Baja solicitada por el abonado",
        fecha: FechaCalendario.desdeIso("2027-03-10"),
      });

      expect(contrato.estado).toBe("dado_de_baja");
      expect(contrato.motivoBaja).toBe("Baja solicitada por el abonado");
      expect(contrato.fechaBaja?.iso).toBe("2027-03-10");
    });

    it("records the termination", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });

      expect(tipos(contrato)).toEqual(["creado", "firmado", "dado_de_baja"]);
    });

    it("leaves the signed data untouched", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });

      expect(contrato.numero).toBe(1042);
      expect(contrato.comodatario.dni.formateado).toBe("30.123.456");
      expect(contrato.plazo?.fechaVencimiento.iso).toBe("2036-08-04");
    });

    it("refuses to terminate a draft, which was never in force", () => {
      expect(() =>
        borrador().darDeBaja({ motivo: "Deuda", fecha: FIRMA }),
      ).toThrow(DomainError);
    });

    it("refuses to terminate twice", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });

      expect(() => contrato.darDeBaja({ motivo: "Otra", fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("requires a reason", () => {
      const contrato = firmado();

      expect(() => contrato.darDeBaja({ motivo: "  ", fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses a date before the contract was signed", () => {
      const contrato = firmado();

      expect(() =>
        contrato.darDeBaja({
          motivo: "Deuda",
          fecha: FechaCalendario.desdeIso("2026-08-03"),
        }),
      ).toThrow(DomainError);
    });
  });

  describe("annulment", () => {
    it("voids a contract signed with wrong data", () => {
      const contrato = firmado();
      contrato.anular({
        motivo: "DNI cargado incorrectamente",
        fecha: FechaCalendario.desdeIso("2026-08-05"),
      });

      expect(contrato.estado).toBe("anulado");
      expect(contrato.motivoAnulacion).toBe("DNI cargado incorrectamente");
      expect(contrato.fechaAnulacion?.iso).toBe("2026-08-05");
    });

    it("records the annulment", () => {
      const contrato = firmado();
      contrato.anular({ motivo: "MAC equivocada", fecha: FIRMA });

      expect(tipos(contrato)).toEqual(["creado", "firmado", "anulado"]);
    });

    it("refuses to annul a draft, which can simply be discarded", () => {
      expect(() => borrador().anular({ motivo: "Error", fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses to annul a contract already out of force", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });

      expect(() => contrato.anular({ motivo: "Error", fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("requires a reason", () => {
      const contrato = firmado();

      expect(() => contrato.anular({ motivo: "", fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses a date before the contract was signed", () => {
      const contrato = firmado();

      expect(() =>
        contrato.anular({
          motivo: "DNI equivocado",
          fecha: FechaCalendario.desdeIso("2026-08-03"),
        }),
      ).toThrow(DomainError);
    });
  });

  describe("equipment restitution", () => {
    it("records the return of the equipment", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });
      contrato.registrarRestitucion({
        fecha: FechaCalendario.desdeIso("2027-04-01"),
      });

      expect(contrato.fechaRestitucion?.iso).toBe("2027-04-01");
      expect(tipos(contrato)).toContain("equipos_restituidos");
    });

    it("refuses to record a return for a draft, since nothing was handed over", () => {
      expect(() =>
        borrador().registrarRestitucion({ fecha: FIRMA }),
      ).toThrow(DomainError);
    });

    it("refuses to record a return twice", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });
      contrato.registrarRestitucion({ fecha: FIRMA });

      expect(() => contrato.registrarRestitucion({ fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses a return while the contract is still in force, where the equipment belongs", () => {
      expect(() => firmado().registrarRestitucion({ fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses a return on an annulled contract, whose replacement covers the equipment", () => {
      const contrato = firmado();
      contrato.anular({ motivo: "DNI equivocado", fecha: FIRMA });

      expect(() => contrato.registrarRestitucion({ fecha: FIRMA })).toThrow(
        DomainError,
      );
    });

    it("refuses a return dated before the termination", () => {
      const contrato = firmado();
      contrato.darDeBaja({
        motivo: "Deuda",
        fecha: FechaCalendario.desdeIso("2027-03-10"),
      });

      expect(() =>
        contrato.registrarRestitucion({
          fecha: FechaCalendario.desdeIso("2027-03-09"),
        }),
      ).toThrow(DomainError);
    });
  });

  describe("outstanding equipment — the report that recovers hardware", () => {
    it("is not outstanding while the contract is in force", () => {
      expect(firmado().equiposPendientesDeRestitucion).toBe(false);
    });

    it("is outstanding once terminated with nothing returned", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });

      expect(contrato.equiposPendientesDeRestitucion).toBe(true);
    });

    it("is settled once the equipment comes back", () => {
      const contrato = firmado();
      contrato.darDeBaja({ motivo: "Deuda", fecha: FIRMA });
      contrato.registrarRestitucion({ fecha: FIRMA });

      expect(contrato.equiposPendientesDeRestitucion).toBe(false);
    });

    it("is not outstanding for an annulled contract, because a replacement covers the same equipment", () => {
      const contrato = firmado();
      contrato.anular({ motivo: "DNI equivocado", fecha: FIRMA });

      expect(contrato.equiposPendientesDeRestitucion).toBe(false);
    });
  });

  describe("expiry awareness", () => {
    it("a draft is never expired", () => {
      expect(borrador().estaVencidoAl(FechaCalendario.desdeIso("2099-01-01"))).toBe(
        false,
      );
    });

    it("a signed contract is not expired before its expiry date", () => {
      expect(firmado().estaVencidoAl(FechaCalendario.desdeIso("2036-08-04"))).toBe(
        false,
      );
    });

    it("a signed contract is expired the day after its expiry date", () => {
      expect(firmado().estaVencidoAl(FechaCalendario.desdeIso("2036-08-05"))).toBe(
        true,
      );
    });
  });
});
