import { describe, expect, it } from "vitest";

import type { Contrato } from "../domain/Contrato";
import { BuscarContratos } from "./BuscarContratos";
import { ContratosEnMemoria } from "./dobles.testing";
import {
  contratoDesdeSemilla,
  ESCENARIOS_DE_BUSQUEDA,
  SEMILLAS_DE_BUSQUEDA,
} from "./escenariosDeBusqueda.testing";
import type {
  ContratoRepository,
  CriteriosDeBusqueda,
  ResultadoDeBusqueda,
} from "./ports/ContratoRepository";

/**
 * The scenario table (DESIGN.md D8) driven straight against
 * `ContratosEnMemoria.buscar` — no database. The exact same table drives
 * `PrismaContratoRepository.integration.spec.ts` against real Postgres, so a
 * behavioural difference between the two adapters fails both suites.
 */
describe("ContratosEnMemoria.buscar — R-2.2 through R-2.7", () => {
  const contratos = new ContratosEnMemoria();
  for (const semilla of SEMILLAS_DE_BUSQUEDA) {
    contratos.agregar(contratoDesdeSemilla(semilla), semilla.creadoEn);
  }

  it.each(ESCENARIOS_DE_BUSQUEDA)("$nombre", async (escenario) => {
    const resultado = await contratos.buscar(escenario.criterios);

    expect(resultado.resumenes.map((r) => r.id)).toEqual(escenario.idsEsperados);
    expect(resultado.total).toBe(escenario.totalEsperado);
  });

  it("carries the read-model fields R-2.1 requires, including creadoEn", async () => {
    const resultado = await contratos.buscar({
      termino: null,
      estados: ["vigente"],
      pagina: 1,
      tamanoPagina: 20,
    });

    const fila = resultado.resumenes.find((r) => r.id === "escenario-pena");
    expect(fila).toBeDefined();
    expect(fila?.numero).not.toBeNull();
    expect(fila?.estado).toBe("vigente");
    expect(fila?.comodatarioNombreCompleto).toBe("Peña");
    expect(fila?.comodatarioDni).toBe("30345678");
    expect(fila?.fechaFirma).not.toBeNull();
    expect(fila?.creadoEn).toBeInstanceOf(Date);
  });

  it("a draft reports a null numero", async () => {
    const resultado = await contratos.buscar({
      termino: null,
      estados: ["borrador"],
      pagina: 1,
      tamanoPagina: 20,
    });

    expect(resultado.resumenes).toHaveLength(1);
    expect(resultado.resumenes[0]?.numero).toBeNull();
  });
});

/** Stands in for another draft the office has not searched for yet. */
const otroBorrador = (id: string): Contrato =>
  contratoDesdeSemilla({
    id,
    nombreCompleto: "Otro Comodatario",
    dni: "20999999",
    estado: "borrador",
    creadoEn: new Date("2026-05-01T00:00:00.000Z"),
  });

/** Records exactly what it was asked, and answers with a fixed result. */
class RepositorioEspia implements ContratoRepository {
  recibido: CriteriosDeBusqueda | null = null;
  respuesta: ResultadoDeBusqueda = { resumenes: [], total: 0 };

  porId(): Promise<Contrato | null> {
    throw new Error("no usado en esta suite");
  }

  guardar(): Promise<void> {
    throw new Error("no usado en esta suite");
  }

  siguienteNumero(): Promise<number> {
    throw new Error("no usado en esta suite");
  }

  buscar(criterios: CriteriosDeBusqueda): Promise<ResultadoDeBusqueda> {
    this.recibido = criterios;
    return Promise.resolve(this.respuesta);
  }
}

/**
 * `BuscarContratos` itself: a thin delegate that interprets the raw term
 * exactly once (DESIGN.md D4) and otherwise passes criteria straight
 * through — never a second decision about what the operator typed.
 */
describe("BuscarContratos", () => {
  it("interprets the raw term and hands the interpreted form to the repository", async () => {
    const espia = new RepositorioEspia();
    const buscar = new BuscarContratos(espia);

    await buscar.ejecutar({
      termino: "Pérez",
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    });

    expect(espia.recibido?.termino).toEqual({
      tipo: "nombre",
      normalizado: "perez",
    });
  });

  it("passes a blank term through as no filter at all", async () => {
    const espia = new RepositorioEspia();
    const buscar = new BuscarContratos(espia);

    await buscar.ejecutar({ termino: "", estados: [], pagina: 1, tamanoPagina: 20 });

    expect(espia.recibido?.termino).toBeNull();
  });

  it("treats a missing term the same as a blank one", async () => {
    const espia = new RepositorioEspia();
    const buscar = new BuscarContratos(espia);

    await buscar.ejecutar({ estados: [], pagina: 1, tamanoPagina: 20 });

    expect(espia.recibido?.termino).toBeNull();
  });

  it("passes estados, pagina and tamanoPagina straight through", async () => {
    const espia = new RepositorioEspia();
    const buscar = new BuscarContratos(espia);

    await buscar.ejecutar({
      termino: "30123456",
      estados: ["vigente", "borrador"],
      pagina: 3,
      tamanoPagina: 50,
    });

    expect(espia.recibido).toEqual({
      termino: { tipo: "dni", digitos: "30123456" },
      estados: ["vigente", "borrador"],
      pagina: 3,
      tamanoPagina: 50,
    });
  });

  it("returns exactly what the repository answers, with no reshaping", async () => {
    const espia = new RepositorioEspia();
    const contrato = otroBorrador("11111111-1111-4111-8111-111111111199");
    espia.respuesta = {
      resumenes: [
        {
          id: contrato.id,
          numero: contrato.numero,
          estado: contrato.estado,
          comodatarioNombreCompleto: contrato.comodatario.nombreCompleto,
          comodatarioDni: contrato.comodatario.dni.valor,
          fechaFirma: contrato.fechaFirma,
          creadoEn: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      total: 1,
    };
    const buscar = new BuscarContratos(espia);

    const resultado = await buscar.ejecutar({
      estados: [],
      pagina: 1,
      tamanoPagina: 20,
    });

    expect(resultado).toBe(espia.respuesta);
  });
});
