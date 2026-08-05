import "reflect-metadata";

import { Controller, Get, Module } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ConfiguracionModule } from "../../config/ConfiguracionModule";
import { SaludModule } from "../../http/SaludController";
import { FiltroDeExcepciones } from "../../http/FiltroDeExcepciones";
import { PrismaModule } from "../../persistencia/PrismaModule";
import { crearClienteDeIntegracion } from "../../shared/infrastructure/persistence/testDb";
import { HashDeContrasenaArgon2 } from "../infrastructure/HashDeContrasenaArgon2";
import { limpiarTablasDeIdentidad } from "../infrastructure/identidadTestDb";
import { PrismaUsuarioRepository } from "../infrastructure/PrismaUsuarioRepository";
import { Usuario } from "../domain/Usuario";
import type { RolUsuario } from "../domain/Usuario";
import { IdentidadModule } from "../IdentidadModule";
import { Roles } from "./decorators/Roles";
import { UsuarioActual } from "./decorators/UsuarioActual";
import type { UsuarioAutenticado } from "./decorators/UsuarioActual";

/**
 * The identity module over real HTTP, against the real Postgres.
 *
 * Lives in the integration config, not the unit one: it opens a database
 * connection and boots a Nest application. The unit suite stays free of both.
 *
 * The two controllers below are the point of this file. They stand in for the
 * contract endpoints the next agent will write, and they are declared here
 * *without* importing anything from `identidad` beyond the decorators — which
 * is exactly how a future module will look. If the global guard ever stops
 * being global, `sinDecorar` starts answering 200 and this file fails.
 */

const DATABASE_URL_LOCAL =
  "postgresql://contratos:contratos@localhost:5432/contratos";
const JWT_SECRET = "secreto-de-integracion-de-al-menos-32-caracteres";
const CONTRASENA = "una-contraseña-de-prueba-larga";

@Controller("modulo-futuro")
class ControladorFuturo {
  /** No decorator at all. Must fail closed. */
  @Get("sin-decorar")
  sinDecorar(): { alcanzado: true } {
    return { alcanzado: true };
  }

  @Get("quien-soy")
  quienSoy(@UsuarioActual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Roles("admin")
  @Get("solo-admin")
  soloAdmin(): { alcanzado: true } {
    return { alcanzado: true };
  }

  @Roles("oficina")
  @Get("solo-oficina")
  soloOficina(): { alcanzado: true } {
    return { alcanzado: true };
  }
}

@Module({ controllers: [ControladorFuturo] })
class ModuloFuturo {}

const prisma = crearClienteDeIntegracion();
let app: INestApplication;

function api(): request.Agent {
  return request(app.getHttpServer());
}

async function crearUsuario(
  nombreUsuario: string,
  rol: RolUsuario,
  activo = true,
): Promise<void> {
  await new PrismaUsuarioRepository(prisma).guardar(
    Usuario.crear({
      id: `usuario-${nombreUsuario}`,
      nombreUsuario,
      nombreCompleto: `Prueba ${nombreUsuario}`,
      rol,
      activo,
      hashDeContrasena: await new HashDeContrasenaArgon2().hashear(CONTRASENA),
    }),
  );
}

interface Sesion {
  tokenDeAcceso: string;
  tokenDeRefresco: string;
}

async function login(nombreUsuario: string): Promise<Sesion> {
  const respuesta = await api()
    .post("/auth/login")
    .send({ nombreUsuario, contrasena: CONTRASENA })
    .expect(200);

  return respuesta.body as Sesion;
}

beforeAll(async () => {
  process.env["DATABASE_URL"] ??= DATABASE_URL_LOCAL;
  process.env["JWT_SECRET"] = JWT_SECRET;
  process.env["NODE_ENV"] = "test";
  // High enough that the flow tests below never trip it; there is a dedicated
  // test for the limit itself.
  process.env["LOGIN_INTENTOS_POR_MINUTO"] = "1000";

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      PrismaModule,
      IdentidadModule,
      SaludModule,
      ModuloFuturo,
    ],
  }).compile();

  app = modulo.createNestApplication();
  app.useGlobalFilters(new FiltroDeExcepciones());
  await app.init();
});

beforeEach(async () => {
  await limpiarTablasDeIdentidad(prisma);
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe("identidad over HTTP (integration)", () => {
  describe("default deny", () => {
    it("refuses an undecorated endpoint of a module that knows nothing about auth", async () => {
      await api().get("/modulo-futuro/sin-decorar").expect(401);
    });

    it("lets the same endpoint through once a session exists", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      await api()
        .get("/modulo-futuro/sin-decorar")
        .set("Authorization", `Bearer ${sesion.tokenDeAcceso}`)
        .expect(200, { alcanzado: true });
    });

    it("keeps /salud public", async () => {
      const respuesta = await api().get("/salud").expect(200);

      expect(respuesta.body).toMatchObject({ estado: "ok", baseDeDatos: "ok" });
    });
  });

  describe("login", () => {
    it("issues a session for the right password", async () => {
      await crearUsuario("tecnico1", "tecnico");

      const respuesta = await api()
        .post("/auth/login")
        .send({ nombreUsuario: "tecnico1", contrasena: CONTRASENA })
        .expect(200);

      expect(respuesta.body).toMatchObject({
        expiraEnSegundos: 900,
        usuario: { nombreUsuario: "tecnico1", rol: "tecnico", activo: true },
      });
    });

    it("never puts the password hash on the wire", async () => {
      await crearUsuario("tecnico1", "tecnico");

      const respuesta = await api()
        .post("/auth/login")
        .send({ nombreUsuario: "tecnico1", contrasena: CONTRASENA })
        .expect(200);

      expect(JSON.stringify(respuesta.body)).not.toContain("argon2");
      expect(JSON.stringify(respuesta.body)).not.toContain(CONTRASENA);
    });

    it("answers an unknown user and a wrong password identically", async () => {
      await crearUsuario("tecnico1", "tecnico");

      const malaClave = await api()
        .post("/auth/login")
        .send({ nombreUsuario: "tecnico1", contrasena: "mala" })
        .expect(401);
      const sinUsuario = await api()
        .post("/auth/login")
        .send({ nombreUsuario: "fantasma", contrasena: "mala" })
        .expect(401);

      expect(sinUsuario.body).toEqual(malaClave.body);
    });

    it("refuses a deactivated user with the same answer", async () => {
      await crearUsuario("suspendido", "tecnico", false);

      const respuesta = await api()
        .post("/auth/login")
        .send({ nombreUsuario: "suspendido", contrasena: CONTRASENA })
        .expect(401);

      expect(respuesta.body.error.codigo).toBe("credenciales_invalidas");
    });

    it("rejects a malformed body through the Zod pipe, naming the fields", async () => {
      const respuesta = await api().post("/auth/login").send({}).expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(Object.keys(respuesta.body.error.campos).sort()).toEqual([
        "contrasena",
        "nombreUsuario",
      ]);
    });
  });

  describe("the authenticated identity", () => {
    // The technician id that ends up in ContextoDeFirma as forensic evidence
    // must come from the token. This is the test that says so.
    it("comes from the verified token, not from anything the client sent", async () => {
      await crearUsuario("tecnico1", "tecnico");
      await crearUsuario("jefe", "admin");
      const sesion = await login("tecnico1");

      const respuesta = await api()
        .get("/modulo-futuro/quien-soy")
        .set("Authorization", `Bearer ${sesion.tokenDeAcceso}`)
        .query({ usuarioId: "usuario-jefe", rol: "admin" })
        .expect(200);

      expect(respuesta.body).toEqual({
        usuarioId: "usuario-tecnico1",
        rol: "tecnico",
      });
    });
  });

  describe("roles", () => {
    it("lets the listed role in and keeps the others out", async () => {
      await crearUsuario("jefe", "admin");
      await crearUsuario("tecnico1", "tecnico");
      const admin = await login("jefe");
      const tecnico = await login("tecnico1");

      await api()
        .get("/modulo-futuro/solo-admin")
        .set("Authorization", `Bearer ${admin.tokenDeAcceso}`)
        .expect(200);

      await api()
        .get("/modulo-futuro/solo-admin")
        .set("Authorization", `Bearer ${tecnico.tokenDeAcceso}`)
        .expect(403);
    });

    it("answers 401, not 403, when there is no session at all", async () => {
      await api().get("/modulo-futuro/solo-oficina").expect(401);
    });

    it("does not name the roles it wanted", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      const respuesta = await api()
        .get("/modulo-futuro/solo-oficina")
        .set("Authorization", `Bearer ${sesion.tokenDeAcceso}`)
        .expect(403);

      expect(JSON.stringify(respuesta.body)).not.toContain("oficina");
    });
  });

  describe("refresh and logout", () => {
    it("rotates the refresh token and keeps the session alive", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      const renovada = await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(200);

      expect(renovada.body.tokenDeRefresco).not.toBe(sesion.tokenDeRefresco);

      await api()
        .get("/modulo-futuro/sin-decorar")
        .set("Authorization", `Bearer ${renovada.body.tokenDeAcceso}`)
        .expect(200);
    });

    it("treats a reused refresh token as theft and kills the whole family", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");
      const renovada = await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(200);

      await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(401);

      await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: renovada.body.tokenDeRefresco })
        .expect(401);
    });

    it("revokes on logout, and the token is dead afterwards", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      await api()
        .post("/auth/logout")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(204);

      await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(401);
    });

    it("answers 204 for a token it never issued, giving away nothing", async () => {
      await api()
        .post("/auth/logout")
        .send({ tokenDeRefresco: "jamas-emitido" })
        .expect(204);
    });

    it("stops refreshing for a user deactivated mid-session", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      await prisma.usuario.update({
        where: { id: "usuario-tecnico1" },
        data: { activo: false },
      });

      await api()
        .post("/auth/refresh")
        .send({ tokenDeRefresco: sesion.tokenDeRefresco })
        .expect(401);
    });

    it("stores only digests — the issued token is nowhere in the table", async () => {
      await crearUsuario("tecnico1", "tecnico");
      const sesion = await login("tecnico1");

      const filas = await prisma.tokenDeRefresco.findMany();

      expect(filas).toHaveLength(1);
      expect(filas[0]?.tokenHash).not.toBe(sesion.tokenDeRefresco);
      expect(JSON.stringify(filas)).not.toContain(sesion.tokenDeRefresco);
    });
  });
});
