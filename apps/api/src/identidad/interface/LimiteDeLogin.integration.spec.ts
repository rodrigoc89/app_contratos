import "reflect-metadata";

import { Controller, Get, Module } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConfiguracionModule } from "../../config/ConfiguracionModule";
import { FiltroDeExcepciones } from "../../http/FiltroDeExcepciones";
import { SaludModule } from "../../http/SaludController";
import { PrismaModule } from "../../persistencia/PrismaModule";
import { crearClienteDeIntegracion } from "../../shared/infrastructure/persistence/testDb";
import { limpiarTablasDeIdentidad } from "../infrastructure/identidadTestDb";
import { IdentidadModule } from "../IdentidadModule";
import { Publico } from "./decorators/Publico";

/**
 * The login rate limit, end to end.
 *
 * Its own file because the limit is read from the environment once, when the
 * module is built, so it needs an application configured with a small number —
 * and because a test that deliberately exhausts a bucket must not share that
 * bucket with the flow tests next door.
 *
 * This exists because the first wiring of this was silently wrong: named
 * throttlers apply to every route, and the decorator that looked like it was
 * *applying* the limit was in fact *overriding it away*. Every hand-written
 * assertion about rate limiting passed; only counting real HTTP responses
 * caught it.
 */

const LIMITE = 3;

@Controller("otra-cosa")
class ControladorComun {
  @Publico()
  @Get()
  responder(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ControladorComun] })
class ModuloComun {}

const prisma = crearClienteDeIntegracion();
let app: INestApplication;

function api(): request.Agent {
  return request(app.getHttpServer());
}

async function intentarLogin(): Promise<number> {
  const respuesta = await api()
    .post("/auth/login")
    .send({ nombreUsuario: "fantasma", contrasena: "no-existe-igual" });

  return respuesta.status;
}

beforeAll(async () => {
  process.env["DATABASE_URL"] ??=
    "postgresql://contratos:contratos@localhost:5432/contratos";
  process.env["JWT_SECRET"] = "secreto-de-integracion-de-al-menos-32-caracteres";
  process.env["NODE_ENV"] = "test";
  process.env["LOGIN_INTENTOS_POR_MINUTO"] = String(LIMITE);

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      PrismaModule,
      IdentidadModule,
      SaludModule,
      ModuloComun,
    ],
  }).compile();

  app = modulo.createNestApplication();
  app.useGlobalFilters(new FiltroDeExcepciones());
  await app.init();

  await limpiarTablasDeIdentidad(prisma);
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe("the login rate limit (integration)", () => {
  it("lets the configured number of attempts through, then answers 429", async () => {
    const estados: number[] = [];
    for (let intento = 0; intento < LIMITE + 2; intento += 1) {
      estados.push(await intentarLogin());
    }

    expect(estados.slice(0, LIMITE)).toEqual(Array(LIMITE).fill(401));
    expect(estados.slice(LIMITE)).toEqual([429, 429]);
  });

  // The bug this file was written for: a strict named throttler applies to
  // every route unless told otherwise, so getting this wrong in the other
  // direction would cap the whole API — office searches, PDF downloads — at
  // the credential-guessing limit.
  it("does not spend the login budget on ordinary endpoints", async () => {
    for (let peticion = 0; peticion < LIMITE + 5; peticion += 1) {
      await api().get("/otra-cosa").expect(200);
    }

    await api().get("/salud").expect(200);
  });
});
