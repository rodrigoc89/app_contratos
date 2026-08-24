import { describe, expect, it } from "vitest";

import { ContratosEnMemoria } from "../contratos/application/dobles.testing";
import type { EstadoContrato } from "../contratos/domain/Contrato";
import { CONTRATOS_DEMO, seedContratosDemo } from "./seedContratosDemo";

const PLANTILLA_ID = "plantilla-contrato-v1";
const FIRMANTE_ID = "firmante-comodante-v1";

/** The page size the office list always requests (`TAMANO_PAGINA_LISTA_CONTRATOS`). */
const TAMANO_PAGINA_LISTA = 10;

async function sembrar(
  contratos: ContratosEnMemoria,
  nodeEnv: string | undefined = "development",
) {
  return await seedContratosDemo({
    contratos,
    plantillaVersionId: PLANTILLA_ID,
    firmanteId: FIRMANTE_ID,
    nodeEnv,
  });
}

async function todosLosResumenes(contratos: ContratosEnMemoria) {
  const { resumenes, total } = await contratos.buscar({
    termino: null,
    estados: [],
    pagina: 1,
    tamanoPagina: 100,
  });
  return { resumenes, total };
}

/**
 * PR20 review — the dev database held 4 contracts, so pagination (page size
 * 10) was never really exercised. The demo block seeds enough contracts to
 * produce several real pages, with every estado represented and varied
 * names/DNIs so the search and the estado filters return non-trivial
 * subsets. Pure port-driven seeding: this spec runs with no database.
 */
describe("seedContratosDemo", () => {
  it("defines more than two full pages of the office list", () => {
    expect(CONTRATOS_DEMO.length).toBeGreaterThanOrEqual(
      Math.ceil(TAMANO_PAGINA_LISTA * 2.5),
    );
  });

  it("seeds every demo contract with the four estados spread for the filters", async () => {
    const contratos = new ContratosEnMemoria();

    const reporte = await sembrar(contratos);

    const { resumenes, total } = await todosLosResumenes(contratos);
    expect(total).toBe(CONTRATOS_DEMO.length);
    expect(reporte).toEqual({
      action: "created",
      creados: CONTRATOS_DEMO.length,
      existentes: 0,
    });

    const porEstado = new Map<EstadoContrato, number>();
    for (const resumen of resumenes) {
      porEstado.set(resumen.estado, (porEstado.get(resumen.estado) ?? 0) + 1);
    }
    expect(porEstado.get("borrador")).toBe(6);
    expect(porEstado.get("vigente")).toBe(12);
    expect(porEstado.get("dado_de_baja")).toBe(6);
    expect(porEstado.get("anulado")).toBe(4);
  });

  it("gives every demo contract a distinct comodatario name and a distinct DNI, so search filtering is testable", async () => {
    const contratos = new ContratosEnMemoria();

    await sembrar(contratos);

    const { resumenes } = await todosLosResumenes(contratos);
    const nombres = new Set(resumenes.map((r) => r.comodatarioNombreCompleto));
    const dnis = new Set(resumenes.map((r) => r.comodatarioDni));
    expect(nombres.size).toBe(CONTRATOS_DEMO.length);
    expect(dnis.size).toBe(CONTRATOS_DEMO.length);
  });

  it("signs the non-draft contracts against the installed plantilla and firmante, with a server-assigned numero", async () => {
    const contratos = new ContratosEnMemoria();

    await sembrar(contratos);

    const { resumenes } = await todosLosResumenes(contratos);
    const firmados = resumenes.filter((r) => r.estado !== "borrador");
    expect(firmados.length).toBeGreaterThan(0);
    for (const resumen of firmados) {
      const contrato = await contratos.porId(resumen.id);
      expect(contrato?.numero).not.toBeNull();
      expect(contrato?.plantillaVersionId).toBe(PLANTILLA_ID);
      expect(contrato?.firmanteId).toBe(FIRMANTE_ID);
      expect(contrato?.fechaFirma).not.toBeNull();
    }
  });

  it("leaves some bajas with the equipment already returned and some still pending, so that report has both cases", async () => {
    const contratos = new ContratosEnMemoria();

    await sembrar(contratos);

    const { resumenes } = await todosLosResumenes(contratos);
    const bajas = await Promise.all(
      resumenes
        .filter((r) => r.estado === "dado_de_baja")
        .map((r) => contratos.porId(r.id)),
    );
    expect(bajas.some((c) => c?.fechaRestitucion !== null)).toBe(true);
    expect(bajas.some((c) => c?.fechaRestitucion === null)).toBe(true);
  });

  it("is idempotent: a second run creates nothing and duplicates nothing", async () => {
    const contratos = new ContratosEnMemoria();

    await sembrar(contratos);
    const segundo = await sembrar(contratos);

    const { total } = await todosLosResumenes(contratos);
    expect(total).toBe(CONTRATOS_DEMO.length);
    expect(segundo).toEqual({
      action: "already-present",
      creados: 0,
      existentes: CONTRATOS_DEMO.length,
    });
  });

  it("refuses to seed demo contracts into production — fake people must never sit beside real contracts", async () => {
    const contratos = new ContratosEnMemoria();

    const reporte = await sembrar(contratos, "production");

    const { total } = await todosLosResumenes(contratos);
    expect(total).toBe(0);
    expect(reporte).toEqual({ action: "omitido", creados: 0, existentes: 0 });
  });
});
