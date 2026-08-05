import { beforeEach, describe, expect, it } from "vitest";

import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { DomainError } from "../../shared/domain/DomainError";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import { ActualizarBorrador } from "./ActualizarBorrador";
import {
  contextoDePrueba,
  ContratosEnMemoria,
  datosComodatario,
  datosEquipos,
  firmaDe,
  firmantesFijos,
  GeneradorFalso,
  ID_CONTRATO,
  nuevoBorrador,
  plantillasFijas,
  relojFijo,
} from "./dobles.testing";
import { FirmarContrato } from "./FirmarContrato";

describe("ActualizarBorrador", () => {
  let contratos: ContratosEnMemoria;
  let actualizar: ActualizarBorrador;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    contratos.agregar(nuevoBorrador());
    actualizar = new ActualizarBorrador(contratos);
  });

  const firmarlo = async (): Promise<void> => {
    await new FirmarContrato(
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
  };

  it("replaces the customer's data", async () => {
    const contrato = await actualizar.ejecutar({
      contratoId: ID_CONTRATO,
      comodatario: { ...datosComodatario(), ciudad: "Termas de Río Hondo" },
    });

    expect(contrato.comodatario.ciudad).toBe("Termas de Río Hondo");
    expect(contrato.equipos.antenaModelo).toBe("LiteBeam 5AC Gen2");
  });

  it("replaces the equipment", async () => {
    const contrato = await actualizar.ejecutar({
      contratoId: ID_CONTRATO,
      equipos: { ...datosEquipos(), poe: false, canoMetros: "9,5" },
    });

    expect(contrato.equipos.poeImpreso).toBe("NO");
    expect(contrato.equipos.canoMetros.valor).toBe(9.5);
    expect(contrato.comodatario.nombreCompleto).toBe("Juan Carlos Pérez");
  });

  it("replaces both halves in one call", async () => {
    const contrato = await actualizar.ejecutar({
      contratoId: ID_CONTRATO,
      comodatario: { ...datosComodatario(), nombreCompleto: "Ana Gómez" },
      equipos: { ...datosEquipos(), antenaModelo: "NanoStation 5AC" },
    });

    expect(contrato.comodatario.nombreCompleto).toBe("Ana Gómez");
    expect(contrato.equipos.antenaModelo).toBe("NanoStation 5AC");
  });

  it("persists the change", async () => {
    await actualizar.ejecutar({
      contratoId: ID_CONTRATO,
      equipos: { ...datosEquipos(), canoMetros: 12 },
    });

    expect(contratos.guardados).toHaveLength(1);
    expect((await contratos.porId(ID_CONTRATO))?.equipos.canoMetros.valor).toBe(
      12,
    );
  });

  it("reports a contract that does not exist as not found", async () => {
    await expect(
      actualizar.ejecutar({
        contratoId: "22222222-2222-4222-8222-222222222222",
        equipos: datosEquipos(),
      }),
    ).rejects.toThrow(RecursoNoEncontrado);
  });

  /**
   * The rule the whole product rests on: a signed contract is never edited.
   * A mistyped DNI means annulling it and signing a new one, at the cost of a
   * second visit — and that cost is the price of the signature meaning
   * anything (DESIGN.md §3).
   *
   * The aggregate enforces it and says so with `ConflictoDeEstado`, which the
   * HTTP layer turns into 409.
   */
  it("refuses to edit a signed contract, as a state conflict", async () => {
    await firmarlo();

    await expect(
      actualizar.ejecutar({
        contratoId: ID_CONTRATO,
        comodatario: { ...datosComodatario(), dni: "20111222" },
      }),
    ).rejects.toThrow(ConflictoDeEstado);
  });

  it("leaves a signed contract byte-for-byte untouched after a refused edit", async () => {
    await firmarlo();
    const antes = await contratos.porId(ID_CONTRATO);
    const guardadosAntes = contratos.guardados.length;

    await expect(
      actualizar.ejecutar({
        contratoId: ID_CONTRATO,
        comodatario: { ...datosComodatario(), dni: "20111222" },
        equipos: { ...datosEquipos(), antenaMac: "aaaaaaaaaaaa" },
      }),
    ).rejects.toThrow(ConflictoDeEstado);

    const despues = await contratos.porId(ID_CONTRATO);
    expect(despues?.comodatario.dni.valor).toBe(antes?.comodatario.dni.valor);
    expect(despues?.equipos.antenaMac.valor).toBe(antes?.equipos.antenaMac.valor);
    expect(contratos.guardados).toHaveLength(guardadosAntes);
  });

  it("refuses invalid data without storing anything", async () => {
    await expect(
      actualizar.ejecutar({
        contratoId: ID_CONTRATO,
        equipos: { ...datosEquipos(), canoMetros: 500 },
      }),
    ).rejects.toThrow(DomainError);

    expect(contratos.guardados).toHaveLength(0);
  });

  /**
   * Both value objects are built before either is applied, so a valid
   * customer plus an invalid antenna cannot leave a half-updated aggregate
   * behind for the next read to pick up.
   */
  it("applies nothing when only one half is invalid", async () => {
    await expect(
      actualizar.ejecutar({
        contratoId: ID_CONTRATO,
        comodatario: { ...datosComodatario(), nombreCompleto: "Ana Gómez" },
        equipos: { ...datosEquipos(), antenaMac: "no-es-una-mac" },
      }),
    ).rejects.toThrow(DomainError);

    const almacenado = await contratos.porId(ID_CONTRATO);
    expect(almacenado?.comodatario.nombreCompleto).toBe("Juan Carlos Pérez");
  });

  it("refuses a call that changes nothing", async () => {
    await expect(
      actualizar.ejecutar({ contratoId: ID_CONTRATO }),
    ).rejects.toThrow(DomainError);
  });
});
