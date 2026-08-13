import { beforeEach, describe, expect, it } from "vitest";

import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { DomainError } from "../../shared/domain/DomainError";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "../domain/Comodatario";
import { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Contrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada, type TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { AnularContrato } from "./AnularContrato";
import { DarDeBajaContrato } from "./DarDeBajaContrato";
import { ContratosEnMemoria } from "./dobles.testing";
import { RegistrarRestitucion } from "./RegistrarRestitucion";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");
const OFICINA = "usuario-oficina-1";

const trazo = () => Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: "data:image/png;base64,iVBORw0KGgo=",
    trazos: [trazo()],
  });

function contratoFirmado(id = "c1"): Contrato {
  const contrato = Contrato.crearBorrador({
    id,
    comodatario: Comodatario.crear({
      nombreCompleto: "Juan Carlos Pérez",
      dni: "30.123.456",
      domicilioCalle: "Av. Belgrano 1250",
      ciudad: "La Banda",
      whatsapp: "3854123456",
    }),
    equipos: Equipos.crear({
      antenaModelo: "LiteBeam 5AC",
      antenaMac: "ac8ba9123456",
      poe: true,
      canoMetros: 6,
    }),
  });
  contrato.firmar({
    numero: 1042,
    plantillaVersionId: "plantilla-2026-01",
    firmanteId: "firmante-v1",
    fechaFirma: FIRMA,
    firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
    contexto: ContextoDeFirma.crear({
      tecnicoId: "tecnico-07",
      dispositivoId: "tablet-03",
      capturadoEn: new Date("2026-08-04T18:00:00-03:00"),
    }),
  });
  return contrato;
}

/**
 * The three post-signature transitions (DESIGN.md §3), driven against the
 * in-memory repository so every case here runs with no database.
 *
 * What these use cases add over the aggregate is small and deliberate: they
 * find the contract (or answer 404), stamp the actor from the caller, and
 * save. Every RULE stays in the domain — which is why the conflict cases
 * below assert the domain's own error types rather than re-checking states
 * the aggregate already guards.
 */
describe("post-signature transitions", () => {
  let contratos: ContratosEnMemoria;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
  });

  describe("DarDeBajaContrato", () => {
    it("terminates an in-force contract and records the reason, the date and the actor", async () => {
      const contrato = contratoFirmado();
      contratos.agregar(contrato);

      const resultado = await new DarDeBajaContrato(contratos).ejecutar({
        contratoId: "c1",
        motivo: "Baja solicitada por el abonado",
        fecha: "2027-03-10",
        usuarioId: OFICINA,
      });

      expect(resultado.estado).toBe("dado_de_baja");
      expect(resultado.motivoBaja).toBe("Baja solicitada por el abonado");
      expect(resultado.fechaBaja?.iso).toBe("2027-03-10");
      expect(resultado.eventos.at(-1)?.usuarioId).toBe(OFICINA);
    });

    it("persists the change rather than only mutating the instance it returned", async () => {
      contratos.agregar(contratoFirmado());

      await new DarDeBajaContrato(contratos).ejecutar({
        contratoId: "c1",
        motivo: "Deuda",
        fecha: "2027-03-10",
        usuarioId: OFICINA,
      });

      expect((await contratos.porId("c1"))?.estado).toBe("dado_de_baja");
    });

    it("answers not-found for a contract that does not exist", async () => {
      await expect(
        new DarDeBajaContrato(contratos).ejecutar({
          contratoId: "no-existe",
          motivo: "Deuda",
          fecha: "2027-03-10",
          usuarioId: OFICINA,
        }),
      ).rejects.toThrow(RecursoNoEncontrado);
    });

    /** The aggregate owns this rule; the use case must not soften it. */
    it("refuses to terminate a contract that is not in force", async () => {
      const contrato = contratoFirmado();
      contrato.darDeBaja({ motivo: "Ya dado de baja", fecha: FIRMA, usuarioId: OFICINA });
      contratos.agregar(contrato);

      await expect(
        new DarDeBajaContrato(contratos).ejecutar({
          contratoId: "c1",
          motivo: "Otra vez",
          fecha: "2027-03-10",
          usuarioId: OFICINA,
        }),
      ).rejects.toThrow(ConflictoDeEstado);
    });

    it("refuses a termination dated before the signature", async () => {
      contratos.agregar(contratoFirmado());

      await expect(
        new DarDeBajaContrato(contratos).ejecutar({
          contratoId: "c1",
          motivo: "Deuda",
          fecha: "2026-08-03",
          usuarioId: OFICINA,
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("AnularContrato", () => {
    it("annuls an in-force contract, recording the reason and the actor", async () => {
      contratos.agregar(contratoFirmado());

      const resultado = await new AnularContrato(contratos).ejecutar({
        contratoId: "c1",
        motivo: "DNI mal cargado",
        fecha: "2026-08-20",
        usuarioId: OFICINA,
      });

      expect(resultado.estado).toBe("anulado");
      expect(resultado.motivoAnulacion).toBe("DNI mal cargado");
      expect(resultado.eventos.at(-1)?.usuarioId).toBe(OFICINA);
    });

    /**
     * An annulled contract was replaced by a new one covering the very same
     * equipment, which never left the customer's roof — so it must never
     * appear in the outstanding-equipment report (DESIGN.md §3).
     */
    it("leaves no equipment pending, unlike a termination", async () => {
      contratos.agregar(contratoFirmado());

      const resultado = await new AnularContrato(contratos).ejecutar({
        contratoId: "c1",
        motivo: "MAC equivocada",
        fecha: "2026-08-20",
        usuarioId: OFICINA,
      });

      expect(resultado.equiposPendientesDeRestitucion).toBe(false);
    });
  });

  describe("RegistrarRestitucion", () => {
    async function terminado(): Promise<void> {
      const contrato = contratoFirmado();
      contrato.darDeBaja({
        motivo: "Deuda",
        fecha: FechaCalendario.desdeIso("2027-03-10"),
        usuarioId: OFICINA,
      });
      contratos.agregar(contrato);
    }

    it("records the equipment coming back, with its date and its actor", async () => {
      await terminado();

      const resultado = await new RegistrarRestitucion(contratos).ejecutar({
        contratoId: "c1",
        fecha: "2027-04-01",
        usuarioId: "usuario-oficina-2",
      });

      expect(resultado.fechaRestitucion?.iso).toBe("2027-04-01");
      expect(resultado.equiposPendientesDeRestitucion).toBe(false);
      expect(resultado.eventos.at(-1)?.usuarioId).toBe("usuario-oficina-2");
    });

    it("refuses to record it twice", async () => {
      await terminado();
      const uso = new RegistrarRestitucion(contratos);
      await uso.ejecutar({ contratoId: "c1", fecha: "2027-04-01", usuarioId: OFICINA });

      await expect(
        uso.ejecutar({ contratoId: "c1", fecha: "2027-04-02", usuarioId: OFICINA }),
      ).rejects.toThrow(ConflictoDeEstado);
    });

    it("refuses to record it for a contract that is still in force", async () => {
      contratos.agregar(contratoFirmado());

      await expect(
        new RegistrarRestitucion(contratos).ejecutar({
          contratoId: "c1",
          fecha: "2027-04-01",
          usuarioId: OFICINA,
        }),
      ).rejects.toThrow(ConflictoDeEstado);
    });

    /**
     * A date before the termination is a bad FIELD, not a bad state — the
     * contract is in exactly the right state to take a restitution, and a
     * different date works. The domain answers `DomainError` (400) rather
     * than `ConflictoDeEstado` (409) for precisely that reason, and this
     * asserts the distinction survives the use case.
     */
    it("refuses a restitution dated before the termination, as bad input rather than a conflict", async () => {
      await terminado();

      const fallo = new RegistrarRestitucion(contratos).ejecutar({
        contratoId: "c1",
        fecha: "2027-03-09",
        usuarioId: OFICINA,
      });

      await expect(fallo).rejects.toThrow(DomainError);
      await expect(fallo).rejects.not.toThrow(ConflictoDeEstado);
    });
  });
});
