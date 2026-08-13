import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EmisorFalso } from "../../identidad/application/dobles.testing";
import { EMISOR_DE_TOKEN_DE_ACCESO } from "../../identidad/application/ports/puertos";
import { AutenticacionGuard } from "../../identidad/interface/guards/AutenticacionGuard";
import { RolesGuard } from "../../identidad/interface/guards/RolesGuard";
import { FiltroDeExcepciones } from "../../http/FiltroDeExcepciones";
import type { BuscarContratos, DatosBusqueda } from "../application/BuscarContratos";
import type { ResultadoDeBusqueda } from "../application/ports/ContratoRepository";
import {
  ACTUALIZAR_BORRADOR,
  ANULAR_CONTRATO,
  BUSCAR_CONTRATOS,
  DAR_DE_BAJA_CONTRATO,
  DIRECTORIO_DE_AUTORES,
  REGISTRAR_RESTITUCION,
  CONSULTAR_CONTRATO,
  CREAR_BORRADOR,
  DESCARGAR_DOCUMENTO,
  FIRMAR_CONTRATO,
  PREVISUALIZAR_CONTRATO,
  RELOJ_CONTRATOS,
} from "../ContratosModule.tokens";
import { ContratosController } from "./ContratosController";

/**
 * `GET /contratos`, over real HTTP through a minimal test module — real
 * `AutenticacionGuard` and `RolesGuard`, but no database (DESIGN.md D17's
 * Interface layer row: "tecnico → 403, tamanoPagina=101 → 400, ... | no DB |
 * no browser"). Every other controller endpoint runs against real Postgres
 * in `ContratosController.integration.spec.ts`; this file exists
 * specifically so the new route's validation and authorization can be
 * proven with none.
 */

class BuscarContratosFalso {
  llamados: DatosBusqueda[] = [];
  respuesta: ResultadoDeBusqueda = { resumenes: [], total: 0 };

  ejecutar(datos: DatosBusqueda): Promise<ResultadoDeBusqueda> {
    this.llamados.push(datos);
    return Promise.resolve(this.respuesta);
  }
}

/** No test here calls any use case besides `buscar` — every other one throws if reached. */
const noUsadoEnEstaSuite = { ejecutar: () => Promise.reject(new Error("no usado en esta suite")) };

let app: INestApplication;
let emisor: EmisorFalso;
let buscarContratos: BuscarContratosFalso;

beforeEach(async () => {
  emisor = new EmisorFalso();
  buscarContratos = new BuscarContratosFalso();

  const modulo = await Test.createTestingModule({
    controllers: [ContratosController],
    providers: [
      { provide: CREAR_BORRADOR, useValue: noUsadoEnEstaSuite },
      { provide: ACTUALIZAR_BORRADOR, useValue: noUsadoEnEstaSuite },
      { provide: PREVISUALIZAR_CONTRATO, useValue: noUsadoEnEstaSuite },
      { provide: FIRMAR_CONTRATO, useValue: noUsadoEnEstaSuite },
      { provide: CONSULTAR_CONTRATO, useValue: noUsadoEnEstaSuite },
      { provide: DESCARGAR_DOCUMENTO, useValue: noUsadoEnEstaSuite },
      { provide: RELOJ_CONTRATOS, useValue: { ahora: () => new Date() } },
      { provide: BUSCAR_CONTRATOS, useValue: buscarContratos as unknown as BuscarContratos },
      { provide: DAR_DE_BAJA_CONTRATO, useValue: noUsadoEnEstaSuite },
      { provide: ANULAR_CONTRATO, useValue: noUsadoEnEstaSuite },
      { provide: REGISTRAR_RESTITUCION, useValue: noUsadoEnEstaSuite },
      // This suite only exercises `GET /contratos`, which answers list rows
      // and never a detail — so the directory is never asked anything.
      { provide: DIRECTORIO_DE_AUTORES, useValue: noUsadoEnEstaSuite },
      { provide: EMISOR_DE_TOKEN_DE_ACCESO, useValue: emisor },
      Reflector,
      { provide: APP_GUARD, useClass: AutenticacionGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  app = modulo.createNestApplication();
  app.useGlobalFilters(new FiltroDeExcepciones());
  await app.init();
});

afterEach(async () => {
  await app.close();
});

function api(): request.Agent {
  return request(app.getHttpServer());
}

async function tokenPara(rol: "tecnico" | "oficina" | "admin"): Promise<string> {
  return await emisor.emitir({ usuarioId: "usuario-1", rol });
}

describe("GET /contratos", () => {
  describe("authorization (R-2.8)", () => {
    it("answers 401 with no bearer token", async () => {
      const respuesta = await api().get("/contratos").expect(401);

      expect(respuesta.body.error.codigo).toBe("no_autenticado");
      expect(respuesta.body.error.mensaje).toBe(
        "Esta operación necesita una sesión iniciada.",
      );
    });

    it("refuses tecnico with 403, naming no roles", async () => {
      const respuesta = await api()
        .get("/contratos")
        .set("Authorization", `Bearer ${await tokenPara("tecnico")}`)
        .expect(403);

      expect(respuesta.body.error.codigo).toBe("sin_permiso");
      expect(respuesta.body.error.mensaje).toBe(
        "Su usuario no tiene permiso para esta operación.",
      );
      expect(JSON.stringify(respuesta.body)).not.toContain("oficina");
      expect(JSON.stringify(respuesta.body)).not.toContain("admin");
    });

    it("allows oficina", async () => {
      await api()
        .get("/contratos")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);
    });

    it("allows admin", async () => {
      await api()
        .get("/contratos")
        .set("Authorization", `Bearer ${await tokenPara("admin")}`)
        .expect(200);
    });
  });

  describe("query validation (R-2.3, R-2.6)", () => {
    it("rejects tamanoPagina over 100, naming the field, never clamping it", async () => {
      const respuesta = await api()
        .get("/contratos?tamanoPagina=101")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(Object.keys(respuesta.body.error.campos)).toContain("tamanoPagina");
    });

    it("accepts tamanoPagina=100", async () => {
      await api()
        .get("/contratos?tamanoPagina=100")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);
    });

    it.each(["0", "-1", "abc"])("rejects pagina=%s with 400", async (pagina) => {
      const respuesta = await api()
        .get(`/contratos?pagina=${pagina}`)
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
    });

    it("rejects an unknown estado with 400, naming estados (W-1)", async () => {
      const respuesta = await api()
        .get("/contratos?estados=pendiente")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(Object.keys(respuesta.body.error.campos)).toContain("estados");
    });

    it("defaults pagina and tamanoPagina when absent", async () => {
      await api()
        .get("/contratos")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(buscarContratos.llamados[0]).toMatchObject({ pagina: 1, tamanoPagina: 20 });
    });

    it("parses a comma-separated estados list — two-state multi-select", async () => {
      await api()
        .get("/contratos?estados=vigente,anulado")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(buscarContratos.llamados[0]?.estados).toEqual(["vigente", "anulado"]);
    });

    it("treats an empty estados parameter as no filter — every state", async () => {
      await api()
        .get("/contratos?estados=")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(buscarContratos.llamados[0]?.estados).toEqual([]);
    });

    it("tolerates whitespace after the comma in estados", async () => {
      await api()
        .get("/contratos")
        .query({ estados: "vigente, anulado" })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(buscarContratos.llamados[0]?.estados).toEqual(["vigente", "anulado"]);
    });

    it("passes the raw termino through to the use case untouched", async () => {
      await api()
        .get("/contratos?termino=Pérez")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(buscarContratos.llamados[0]?.termino).toBe("Pérez");
    });
  });

  describe("unrecognized query parameters are rejected, never dropped (R-2.12)", () => {
    it("refuses the singular near-miss `estado`, never falling back to a silent all-states 200", async () => {
      const respuesta = await api()
        .get("/contratos")
        .query({ estado: "vigente" })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
    });

    it("refuses a misspelled parameter", async () => {
      const respuesta = await api()
        .get("/contratos")
        .query({ estdos: "vigente" })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
    });

    it("refuses a wholly foreign parameter", async () => {
      const respuesta = await api()
        .get("/contratos")
        .query({ ordenar: "numero" })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
    });

    it("accepts every recognized parameter together", async () => {
      await api()
        .get("/contratos")
        .query({ termino: "perez", estados: "vigente", pagina: 1, tamanoPagina: 20 })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);
    });

    it("does not echo the rejected value — a DNI is personal data (Ley 25.326)", async () => {
      const respuesta = await api()
        .get("/contratos")
        .query({ dni: "30123456" })
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(JSON.stringify(respuesta.body)).not.toContain("30123456");
    });
  });

  describe("R-2.10 — no personal data ever leaks through an error body", () => {
    it("a rejected request does not echo a DNI-shaped search term", async () => {
      const respuesta = await api()
        .get("/contratos?termino=30123456&tamanoPagina=500")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(Object.keys(respuesta.body.error.campos)).toContain("tamanoPagina");
      expect(JSON.stringify(respuesta.body)).not.toContain("30123456");
    });
  });

  describe("the response envelope", () => {
    it("wraps whatever the use case returns as elementos/total/pagina/tamanoPagina", async () => {
      buscarContratos.respuesta = {
        resumenes: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            numero: 1042,
            estado: "vigente",
            comodatarioNombreCompleto: "Juan Carlos Pérez",
            comodatarioDni: "30123456",
            fechaFirma: null,
            creadoEn: new Date("2026-08-04T15:00:00.000Z"),
          },
        ],
        total: 7,
      };

      const respuesta = await api()
        .get("/contratos?pagina=2&tamanoPagina=1")
        .set("Authorization", `Bearer ${await tokenPara("oficina")}`)
        .expect(200);

      expect(respuesta.body.total).toBe(7);
      expect(respuesta.body.pagina).toBe(2);
      expect(respuesta.body.tamanoPagina).toBe(1);
      expect(respuesta.body.elementos).toHaveLength(1);
      expect(respuesta.body.elementos[0].comodatario.dni).toBe("30.123.456");
      // creadoEn never reaches the wire — see vistas.ts.
      expect(JSON.stringify(respuesta.body)).not.toContain("creadoEn");
    });
  });
});
