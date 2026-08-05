import { beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { CrearBorrador } from "./CrearBorrador";
import {
  ContratosEnMemoria,
  datosComodatario,
  datosEquipos,
  ID_CONTRATO,
  IdentificadoresFijos,
} from "./dobles.testing";

describe("CrearBorrador", () => {
  let contratos: ContratosEnMemoria;
  let crear: CrearBorrador;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    crear = new CrearBorrador(contratos, new IdentificadoresFijos());
  });

  const ejecutar = () =>
    crear.ejecutar({
      comodatario: datosComodatario(),
      equipos: datosEquipos(),
    });

  it("creates a draft and nothing more", async () => {
    const contrato = await ejecutar();

    expect(contrato.estado).toBe("borrador");
    expect(contrato.numero).toBeNull();
    expect(contrato.fechaFirma).toBeNull();
    expect(contrato.firmas).toHaveLength(0);
    expect(contrato.documentos).toHaveLength(0);
  });

  /**
   * The id comes from the server, like everything else that identifies a
   * contract. DESIGN.md §2 dropped offline-first precisely so nothing on the
   * tablet has to invent identifiers.
   */
  it("takes its identifier from the server", async () => {
    const contrato = await ejecutar();

    expect(contrato.id).toBe(ID_CONTRATO);
  });

  it("normalises the customer's data through the domain", async () => {
    const contrato = await ejecutar();

    expect(contrato.comodatario.dni.valor).toBe("30123456");
    expect(contrato.comodatario.whatsapp.valor).toBe("+5493854123456");
    expect(contrato.comodatario.provincia).toBe("Santiago del Estero");
    expect(contrato.equipos.antenaMac.valor).toBe("AC:8B:A9:12:34:56");
  });

  it("persists it once, with its creation event", async () => {
    await ejecutar();

    expect(contratos.guardados).toHaveLength(1);
    expect(contratos.guardados[0]?.eventos.map((evento) => evento.tipo)).toEqual([
      "creado",
    ]);
  });

  it("is readable back by its id", async () => {
    const contrato = await ejecutar();

    expect((await contratos.porId(contrato.id))?.id).toBe(contrato.id);
  });

  it("refuses invalid customer data before anything is stored", async () => {
    await expect(
      crear.ejecutar({
        comodatario: { ...datosComodatario(), dni: "no-es-un-dni" },
        equipos: datosEquipos(),
      }),
    ).rejects.toThrow(DomainError);

    expect(contratos.guardados).toHaveLength(0);
  });

  it("refuses invalid equipment before anything is stored", async () => {
    await expect(
      crear.ejecutar({
        comodatario: datosComodatario(),
        equipos: { ...datosEquipos(), antenaMac: "no-es-una-mac" },
      }),
    ).rejects.toThrow(DomainError);

    expect(contratos.guardados).toHaveLength(0);
  });
});
