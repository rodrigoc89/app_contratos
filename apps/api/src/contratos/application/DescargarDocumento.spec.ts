import { beforeEach, describe, expect, it } from "vitest";

import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import { DescargarDocumento } from "./DescargarDocumento";
import {
  AlmacenEnMemoria,
  contextoDePrueba,
  ContratosEnMemoria,
  firmaDe,
  firmantesFijos,
  GeneradorFalso,
  ID_CONTRATO,
  nuevoBorrador,
  plantillasFijas,
  relojFijo,
} from "./dobles.testing";
import { FirmarContrato } from "./FirmarContrato";

describe("DescargarDocumento", () => {
  let contratos: ContratosEnMemoria;
  let almacen: AlmacenEnMemoria;
  let descargar: DescargarDocumento;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    contratos.agregar(nuevoBorrador());
    almacen = new AlmacenEnMemoria();
    descargar = new DescargarDocumento(contratos, almacen);
  });

  const firmarlo = () =>
    new FirmarContrato(
      contratos,
      plantillasFijas(),
      firmantesFijos(),
      new GeneradorFalso(almacen),
      relojFijo(),
    ).ejecutar({
      contratoId: ID_CONTRATO,
      firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
      contexto: contextoDePrueba(),
    });

  it("returns the exact bytes that were sealed", async () => {
    await firmarlo();

    const descarga = await descargar.ejecutar({
      contratoId: ID_CONTRATO,
      documento: "comodato",
    });

    expect(new TextDecoder().decode(descarga.contenido)).toBe(
      "%PDF-1.7 comodato",
    );
  });

  it("returns each document separately", async () => {
    await firmarlo();

    const condiciones = await descargar.ejecutar({
      contratoId: ID_CONTRATO,
      documento: "condiciones_generales",
    });

    expect(new TextDecoder().decode(condiciones.contenido)).toBe(
      "%PDF-1.7 condiciones_generales",
    );
  });

  /**
   * The filename is what the office ends up with in a downloads folder, so it
   * carries the contract number and the document — and nothing about the
   * customer, since a filename is the part of a download most likely to be
   * seen by someone who should not see the customer's name.
   */
  it("names the file after the contract number and the document", async () => {
    await firmarlo();

    const descarga = await descargar.ejecutar({
      contratoId: ID_CONTRATO,
      documento: "comodato",
    });

    expect(descarga.nombreArchivo).toBe("contrato-1042-comodato.pdf");
    expect(descarga.nombreArchivo).not.toContain("Pérez");
  });

  it("carries the stored hash, so a caller can verify the bytes", async () => {
    await firmarlo();

    const descarga = await descargar.ejecutar({
      contratoId: ID_CONTRATO,
      documento: "comodato",
    });

    expect(descarga.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports a contract that does not exist as not found", async () => {
    await expect(
      descargar.ejecutar({
        contratoId: "22222222-2222-4222-8222-222222222222",
        documento: "comodato",
      }),
    ).rejects.toThrow(RecursoNoEncontrado);
  });

  it("refuses to download from a draft, which has no sealed document yet", async () => {
    await expect(
      descargar.ejecutar({ contratoId: ID_CONTRATO, documento: "comodato" }),
    ).rejects.toThrow(ConflictoDeEstado);
  });

  /**
   * The path handed to the store comes off the aggregate, never off the
   * request: the document type is matched against what the contract actually
   * carries, so a crafted type finds nothing rather than becoming a path.
   */
  it("never turns the requested type into a path", async () => {
    await firmarlo();

    await expect(
      descargar.ejecutar({
        contratoId: ID_CONTRATO,
        documento: "../../../etc/passwd" as never,
      }),
    ).rejects.toThrow(RecursoNoEncontrado);
  });

  it("reports a sealed document whose bytes are missing as an error, not as an empty file", async () => {
    await firmarlo();
    almacen.guardados.clear();

    await expect(
      descargar.ejecutar({ contratoId: ID_CONTRATO, documento: "comodato" }),
    ).rejects.toThrow();
  });
});
