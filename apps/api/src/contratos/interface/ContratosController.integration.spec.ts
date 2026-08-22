import "reflect-metadata";

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatosContratoDetalle } from "@contratos/esquemas";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { PrismaFirmanteRepository } from "../../firmantes/infrastructure/PrismaFirmanteRepository";
import {
  configurarHttp,
  LIMITE_CUERPO_BYTES,
} from "../../http/configuracionHttp";
import { Usuario } from "../../identidad/domain/Usuario";
import type { RolUsuario } from "../../identidad/domain/Usuario";
import { HashDeContrasenaArgon2 } from "../../identidad/infrastructure/HashDeContrasenaArgon2";
import { limpiarTablasDeIdentidad } from "../../identidad/infrastructure/identidadTestDb";
import { PrismaUsuarioRepository } from "../../identidad/infrastructure/PrismaUsuarioRepository";
import { PrismaPlantillaRepository } from "../../plantillas/infrastructure/PrismaPlantillaRepository";
import { buildSeedContent } from "../../seed/seedContent";
import type { SeedContent } from "../../seed/seedContent";
import {
  crearClienteDeIntegracion,
  limpiarBaseDeDatos,
} from "../../shared/infrastructure/persistence/testDb";
import type { DocumentoContrato } from "../domain/Contrato";
import { RelojDelSistema } from "../infrastructure/RelojDelSistema";
import type {
  EntradaGeneracion,
  GeneradorDeDocumentos,
} from "../application/ports/GeneradorDeDocumentos";
import type { AlmacenDeDocumentos } from "../application/ports/AlmacenDeDocumentos";
import { GENERADOR_DE_DOCUMENTOS } from "../ContratosModule.tokens";
import { GeneradorDeDocumentosPuppeteer } from "../infrastructure/GeneradorDeDocumentosPuppeteer";
import { AlmacenDeDocumentosEnDisco } from "../infrastructure/AlmacenDeDocumentosEnDisco";

/**
 * The contract endpoints over real HTTP, against the real Postgres and — for
 * one test — a real headless Chromium.
 *
 * It boots `AppModule` itself and applies `configurarHttp`, which is the same
 * pair of calls `main.ts` makes. That matters more here than anywhere else in
 * this codebase: the body-size limit lives in `configurarHttp`, and a limit
 * the tests do not exercise is a limit that gets discovered by a technician
 * standing in a customer's kitchen with a signed screen and a 413.
 */

const DATABASE_URL_LOCAL =
  "postgresql://contratos:contratos@localhost:5432/contratos";
const JWT_SECRET = "secreto-de-integracion-de-al-menos-32-caracteres";
const CONTRASENA = "una-contraseña-de-prueba-larga";

/** A real, decodable 1x1 PNG — Chromium must be able to paint it. */
const FIRMA_PNG_REAL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * A signature payload the size a real tablet produces: two PNGs of roughly
 * 110 kB each once base64 is undone, plus four seconds of 60 Hz stroke data.
 * Deliberately far past Express's 100 kB default.
 */
const LARGO_PNG_REALISTA = 150_000;
const PUNTOS_POR_TRAZO_REALISTA = 240;
const TRAZOS_REALISTAS = 4;

/** What `express.json()` accepts when nobody tells it otherwise. */
const LIMITE_POR_DEFECTO_DE_EXPRESS = 100 * 1024;

const prisma = crearClienteDeIntegracion();
let app: INestApplication;
let raizDeDocumentos: string;
let contenido: SeedContent;

/**
 * Wraps the real PDF generator so a single test can make rendering fail
 * without replacing it everywhere.
 *
 * `modoRapido` is the default because a real Chromium render of the real
 * eight-kilobyte contract template costs seconds, and only one test in this
 * file is actually about the PDF. It still writes bytes into the real store,
 * so the download path is exercised end to end either way.
 */
class GeneradorConmutable implements GeneradorDeDocumentos {
  modo: "real" | "rapido" | "falla" = "rapido";

  constructor(
    private readonly real: GeneradorDeDocumentosPuppeteer,
    private readonly almacen: AlmacenDeDocumentos,
  ) {}

  async generar(
    entrada: EntradaGeneracion,
  ): Promise<readonly DocumentoContrato[]> {
    if (this.modo === "falla") {
      // The failure DESIGN.md §7 calls the single biggest resource risk of
      // the system, on the box it names.
      throw new Error("Chromium se quedó sin memoria");
    }
    if (this.modo === "real") {
      return await this.real.generar(entrada);
    }

    const documentos: DocumentoContrato[] = [
      {
        documento: "condiciones_generales",
        ruta: `${entrada.numero}/condiciones_generales.pdf`,
        sha256: "1".repeat(64),
      },
      { documento: "comodato", ruta: `${entrada.numero}/comodato.pdf`, sha256: "2".repeat(64) },
    ];

    for (const documento of documentos) {
      await this.almacen.guardar(
        documento.ruta,
        new TextEncoder().encode(`%PDF-1.7 fake ${documento.documento}\n%%EOF\n`),
      );
    }

    return documentos;
  }

  async cerrar(): Promise<void> {
    await this.real.cerrar();
  }
}

let generador: GeneradorConmutable;

function api(): request.Agent {
  return request(app.getHttpServer());
}

async function crearUsuario(
  nombreUsuario: string,
  rol: RolUsuario,
): Promise<void> {
  await new PrismaUsuarioRepository(prisma).guardar(
    Usuario.crear({
      id: `usuario-${nombreUsuario}`,
      nombreUsuario,
      nombreCompleto: `Prueba ${nombreUsuario}`,
      rol,
      activo: true,
      hashDeContrasena: await new HashDeContrasenaArgon2().hashear(CONTRASENA),
    }),
  );
}

async function iniciarSesion(nombreUsuario: string): Promise<string> {
  const respuesta = await api()
    .post("/auth/login")
    .send({ nombreUsuario, contrasena: CONTRASENA })
    .expect(200);

  return (respuesta.body as { tokenDeAcceso: string }).tokenDeAcceso;
}

/** Sessions are opened once: every request here shares the 120/min throttler. */
const sesion: Record<"tecnico" | "oficina" | "admin", string> = {
  tecnico: "",
  oficina: "",
  admin: "",
};

const comodatario = () => ({
  nombreCompleto: "Juan Carlos Pérez",
  dni: "30.123.456",
  domicilioCalle: "Av. Belgrano 1250",
  ciudad: "La Banda",
  whatsapp: "385 4123456",
});

const equipos = () => ({
  antenaModelo: "LiteBeam 5AC Gen2",
  antenaMac: "ac8ba9123456",
  poe: true,
  canoMetros: 6,
});

const trazo = (puntos = 14) =>
  Array.from({ length: puntos }, (_, i) => ({ x: i % 200, y: i % 80, t: i * 16 }));

const cuerpoDeFirma = (imagen = FIRMA_PNG_REAL) => ({
  firmas: [
    { documento: "condiciones_generales", imagenPng: imagen, trazos: [trazo()] },
    { documento: "comodato", imagenPng: imagen, trazos: [trazo()] },
  ],
  dispositivoId: "tablet-lenovo-03",
  geo: { latitud: -27.7834, longitud: -64.2642 },
});

async function crearBorrador(): Promise<string> {
  const respuesta = await api()
    .post("/contratos")
    .set("Authorization", `Bearer ${sesion.tecnico}`)
    .send({ comodatario: comodatario(), equipos: equipos() })
    .expect(201);

  return (respuesta.body as { id: string }).id;
}

async function firmar(id: string): Promise<request.Response> {
  return await api()
    .post(`/contratos/${id}/firmar`)
    .set("Authorization", `Bearer ${sesion.tecnico}`)
    .send(cuerpoDeFirma());
}

beforeAll(async () => {
  process.env["DATABASE_URL"] ??= DATABASE_URL_LOCAL;
  process.env["JWT_SECRET"] = JWT_SECRET;
  process.env["NODE_ENV"] = "test";
  process.env["LOGIN_INTENTOS_POR_MINUTO"] = "1000";

  raizDeDocumentos = await mkdtemp(join(tmpdir(), "contratos-http-"));
  process.env["ALMACEN_DOCUMENTOS_RUTA"] = raizDeDocumentos;

  contenido = await buildSeedContent();

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GENERADOR_DE_DOCUMENTOS)
    .useFactory({
      factory: () =>
        new GeneradorConmutable(
          new GeneradorDeDocumentosPuppeteer({
            almacen: new AlmacenDeDocumentosEnDisco(raizDeDocumentos),
          }),
          new AlmacenDeDocumentosEnDisco(raizDeDocumentos),
        ),
    })
    .compile();

  app = modulo.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configurarHttp(app as NestExpressApplication);
  await app.init();

  generador = app.get<GeneradorConmutable>(GENERADOR_DE_DOCUMENTOS);

  await limpiarTablasDeIdentidad(prisma);
  await crearUsuario("tecnico1", "tecnico");
  await crearUsuario("oficina1", "oficina");
  await crearUsuario("jefe", "admin");

  sesion.tecnico = await iniciarSesion("tecnico1");
  sesion.oficina = await iniciarSesion("oficina1");
  sesion.admin = await iniciarSesion("jefe");
}, 60_000);

beforeEach(async () => {
  generador.modo = "rapido";
  await limpiarBaseDeDatos(prisma);
  // The template version and the comodante signatory are the two rows every
  // signing needs; `limpiarBaseDeDatos` truncates them, so they go back.
  await new PrismaPlantillaRepository(prisma, new RelojDelSistema()).publicar(
    contenido.plantilla,
  );
  await new PrismaFirmanteRepository(prisma).instalarComoActivo(
    contenido.firmante,
  );
});

afterAll(async () => {
  await limpiarTablasDeIdentidad(prisma);
  await limpiarBaseDeDatos(prisma);
  await app?.close();
  await prisma.$disconnect();
  await rm(raizDeDocumentos, { recursive: true, force: true });
});

describe("contract endpoints (integration)", () => {
  describe("authentication and roles", () => {
    it("answers 401 without a token, on every route", async () => {
      await api().post("/contratos").send({}).expect(401);
      await api().get("/contratos/cualquiera").expect(401);
      await api().get("/contratos/cualquiera/previsualizacion").expect(401);
      await api().post("/contratos/cualquiera/firmar").send({}).expect(401);
      await api().get("/contratos/cualquiera/documentos/comodato").expect(401);
    });

    it("answers 403 when the office tries to create or sign a contract", async () => {
      await api()
        .post("/contratos")
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .send({ comodatario: comodatario(), equipos: equipos() })
        .expect(403);

      await api()
        .post("/contratos/cualquiera/firmar")
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .send(cuerpoDeFirma())
        .expect(403);
    });

    /**
     * `admin` used to be refused here, on the grounds that it manages users,
     * templates and the signatory and is "deliberately not a role that reads
     * customers' DNIs" (DESIGN.md §9).
     *
     * That stopped being true the moment `GET /contratos` shipped with
     * `@Roles("oficina", "admin")`: the list emits `comodatario.nombreCompleto`
     * and `comodatario.dni` on every row, so an administrator was already
     * reading every customer's DNI ten at a time, through a search box, while
     * being refused the detail on the grounds that it must not. The refusal
     * protected nothing and only made the boundary incoherent.
     *
     * Resolved by the maintainer on 2026-08-13 in favour of full access —
     * `admin` is the owner of a ~1000-customer WISP and does office work too.
     * DESIGN.md §9 was rewritten to say so, rather than left contradicting
     * the code. See the note there for the Ley 25.326 consequence.
     */
    it("lets an administrator read a contract and its documents", async () => {
      const id = await crearBorrador();
      await firmar(id).then((r) => expect(r.status).toBe(200));

      await api()
        .get(`/contratos/${id}`)
        .set("Authorization", `Bearer ${sesion.admin}`)
        .expect(200);

      await api()
        .get(`/contratos/${id}/documentos/comodato`)
        .set("Authorization", `Bearer ${sesion.admin}`)
        .expect(200);
    });

    it("lets the office read a contract and its documents", async () => {
      const id = await crearBorrador();
      await firmar(id).then((r) => expect(r.status).toBe(200));

      await api()
        .get(`/contratos/${id}`)
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .expect(200);

      await api()
        .get(`/contratos/${id}/documentos/comodato`)
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .expect(200);
    });

    it("does not name the roles it wanted in a 403", async () => {
      const respuesta = await api()
        .post("/contratos")
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .send({ comodatario: comodatario(), equipos: equipos() })
        .expect(403);

      expect(JSON.stringify(respuesta.body)).not.toContain("tecnico");
    });
  });

  describe("the whole flow", () => {
    it("goes draft → preview → sign → download, with a real rendered PDF", async () => {
      generador.modo = "real";

      const id = await crearBorrador();

      const previa = await api()
        .get(`/contratos/${id}/previsualizacion`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .expect(200);

      expect(previa.body.documentos).toHaveLength(2);
      expect(previa.body.documentos[0].html).toContain("Juan Carlos Pérez");
      expect(previa.body.documentos[1].html).toContain("AC:8B:A9:12:34:56");
      expect(previa.body.fechaPrevistaDeVencimiento).not.toBe(
        previa.body.fechaPrevistaDeFirma,
      );

      const firmado = await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send(cuerpoDeFirma())
        .expect(200);

      expect(firmado.body.estado).toBe("vigente");
      expect(firmado.body.numero).toBeGreaterThan(0);
      expect(firmado.body.documentos).toHaveLength(2);
      expect(firmado.body.plazo.fechaVencimiento).toBe(
        previa.body.fechaPrevistaDeVencimiento,
      );

      for (const documento of ["condiciones_generales", "comodato"]) {
        const pdf = await api()
          .get(`/contratos/${id}/documentos/${documento}`)
          .set("Authorization", `Bearer ${sesion.tecnico}`)
          .expect(200);

        expect(pdf.headers["content-type"]).toContain("application/pdf");
        expect(pdf.headers["content-disposition"]).toContain(
          `contrato-${firmado.body.numero}-${documento}.pdf`,
        );
        expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pdf.body.length).toBeGreaterThan(5_000);
      }
    }, 90_000);

    it("previews the very template version the signature then seals", async () => {
      const id = await crearBorrador();

      const previa = await api()
        .get(`/contratos/${id}/previsualizacion`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .expect(200);

      const firmado = await firmar(id);

      expect(previa.body.plantillaVersion).toBe(contenido.plantilla.version);
      expect(firmado.body.plantillaVersionId).toBe(contenido.plantilla.id);
      expect(firmado.body.fechaFirma).toBe(previa.body.fechaPrevistaDeFirma);
    });

    /**
     * DESIGN.md §4: the comodante's signature is a real person's handwriting
     * and must never reach the frontend. The preview is HTML sent to a tablet.
     */
    it("never sends the comodante's signature image in a preview", async () => {
      const id = await crearBorrador();

      const previa = await api()
        .get(`/contratos/${id}/previsualizacion`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .expect(200);

      expect(JSON.stringify(previa.body)).not.toContain(
        contenido.firmante.imagenFirmaPng.slice(0, 200),
      );
    });

    it("takes the technician from the token, not from the body", async () => {
      const id = await crearBorrador();

      await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({ ...cuerpoDeFirma(), tecnicoId: "usuario-jefe", ip: "8.8.8.8" })
        .expect(200);

      const fila = await prisma.contrato.findUnique({ where: { id } });
      expect(fila?.contextoTecnicoId).toBe("usuario-tecnico1");
      expect(fila?.contextoIp).not.toBe("8.8.8.8");
    });

    it("stores the raw stroke evidence and the device that captured it", async () => {
      const id = await crearBorrador();
      await firmar(id);

      const firmas = await prisma.firmaCapturada.findMany({
        where: { contratoId: id },
      });
      const fila = await prisma.contrato.findUnique({ where: { id } });

      expect(firmas).toHaveLength(2);
      expect(JSON.stringify(firmas[0]?.trazos)).toContain('"t":');
      expect(fila?.contextoDispositivoId).toBe("tablet-lenovo-03");
    });
  });

  describe("updating a draft", () => {
    it("replaces the customer's data and the equipment", async () => {
      const id = await crearBorrador();

      const respuesta = await api()
        .patch(`/contratos/${id}`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({ equipos: { ...equipos(), poe: false, canoMetros: "9,5" } })
        .expect(200);

      expect(respuesta.body.equipos.poe).toBe(false);
      expect(respuesta.body.equipos.canoMetros).toBe(9.5);
      expect(respuesta.body.comodatario.nombreCompleto).toBe("Juan Carlos Pérez");
    });

    /**
     * The rule the product rests on: a signed contract is never edited
     * (DESIGN.md §3). The aggregate refuses it, so this is 409 rather than a
     * permission answer that a future endpoint could forget to repeat.
     */
    it("answers 409 when the contract is already signed", async () => {
      const id = await crearBorrador();
      await firmar(id);

      const respuesta = await api()
        .patch(`/contratos/${id}`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({ comodatario: { ...comodatario(), dni: "20111222" } })
        .expect(409);

      expect(respuesta.body.error.codigo).toBe("conflicto_de_estado");

      const fila = await prisma.contrato.findUnique({ where: { id } });
      expect(fila?.comodatarioDni).toBe("30123456");
    });

    it("answers 404 for a contract that does not exist", async () => {
      const respuesta = await api()
        .patch("/contratos/no-existe-este-contrato")
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({ equipos: equipos() })
        .expect(404);

      expect(respuesta.body.error.codigo).toBe("no_encontrado");
    });
  });

  describe("retry safety", () => {
    /**
     * The tablet is on a field connection. A `POST /firmar` that times out
     * after the server sealed the contract *will* be retried, and the second
     * attempt must be refused as a state conflict — never double-sign, never
     * burn a second contract number.
     */
    it("answers 409 to a retried signature, without double-signing", async () => {
      const id = await crearBorrador();
      const primero = await firmar(id);
      expect(primero.status).toBe(200);

      const segundo = await firmar(id);

      expect(segundo.status).toBe(409);
      expect(segundo.body.error.codigo).toBe("conflicto_de_estado");

      const fila = await prisma.contrato.findUnique({ where: { id } });
      expect(fila?.numero).toBe(primero.body.numero);

      const eventos = await prisma.eventoContrato.findMany({
        where: { contratoId: id, tipo: "firmado" },
      });
      expect(eventos).toHaveLength(1);

      const documentos = await prisma.documentoContrato.findMany({
        where: { contratoId: id },
      });
      expect(documentos).toHaveLength(2);
    });

    /**
     * The retry above arrives *after* the first request finished. This one
     * does not: both are in flight at the same time, which is what an
     * impatient second tap on a slow render actually produces, and neither
     * request can see the other's work when it loads the draft.
     *
     * Both therefore reach the save believing they are signing a draft. The
     * repository's conditional write is the only thing that settles it, and
     * the loser is answered 409 under its own code — not
     * `conflicto_de_estado`, because nobody asked for anything invalid here.
     */
    it("answers 409 to the loser of two simultaneous signatures, and seals only one", async () => {
      const id = await crearBorrador();

      const [primera, segunda] = await Promise.all([firmar(id), firmar(id)]);

      const estados = [primera.status, segunda.status].sort();
      expect(estados).toEqual([200, 409]);

      const ganadora = primera.status === 200 ? primera : segunda;
      const perdedora = primera.status === 200 ? segunda : primera;
      expect(perdedora.body.error.codigo).toBe("conflicto_de_concurrencia");
      expect(perdedora.body.error.mensaje).toMatch(/recargue/i);

      const fila = await prisma.contrato.findUnique({ where: { id } });
      expect(fila?.estado).toBe("vigente");
      expect(fila?.numero).toBe(ganadora.body.numero);

      // One signing event, carrying the winner's number: the append-only log
      // is the evidence this system exists to produce, and it must describe
      // the contract that was actually sealed.
      const eventos = await prisma.eventoContrato.findMany({
        where: { contratoId: id, tipo: "firmado" },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.detalle).toBe(`Nº ${ganadora.body.numero}`);

      const documentos = await prisma.documentoContrato.findMany({
        where: { contratoId: id },
      });
      expect(documentos).toHaveLength(2);
      expect(
        documentos.every((d) => d.ruta.startsWith(`${ganadora.body.numero}/`)),
      ).toBe(true);
      expect(
        await prisma.firmaCapturada.count({ where: { contratoId: id } }),
      ).toBe(2);
    });

    /**
     * `FirmarContrato` renders before it touches the aggregate for exactly
     * this reason. A Chromium that runs out of memory must leave a draft the
     * technician can retry, not a half-signed record with a consumed number.
     */
    it("leaves the draft retryable when rendering fails", async () => {
      const id = await crearBorrador();

      generador.modo = "falla";
      const fallido = await firmar(id);
      expect(fallido.status).toBe(500);

      const durante = await prisma.contrato.findUnique({ where: { id } });
      expect(durante?.estado).toBe("borrador");
      expect(durante?.numero).toBeNull();
      expect(
        await prisma.firmaCapturada.count({ where: { contratoId: id } }),
      ).toBe(0);

      generador.modo = "rapido";
      const recuperado = await firmar(id);

      expect(recuperado.status).toBe(200);
      expect(recuperado.body.estado).toBe("vigente");
      expect(recuperado.body.documentos).toHaveLength(2);
    });

    it("says nothing about the renderer when it fails", async () => {
      const id = await crearBorrador();
      generador.modo = "falla";

      const respuesta = await firmar(id);

      expect(respuesta.body.error.codigo).toBe("error_interno");
      expect(JSON.stringify(respuesta.body)).not.toContain("Chromium");
      expect(JSON.stringify(respuesta.body)).not.toMatch(/\.ts:|at Object/);
      expect(respuesta.body.error.referencia).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("validation", () => {
    it("rejects a malformed draft naming the fields, never the values", async () => {
      const respuesta = await api()
        .post("/contratos")
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({
          comodatario: { ...comodatario(), dni: "2758203X", whatsapp: "123" },
          equipos: { ...equipos(), antenaMac: "no-es-una-mac" },
        })
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
      expect(Object.keys(respuesta.body.error.campos).sort()).toEqual([
        "comodatario.dni",
        "comodatario.whatsapp",
        "equipos.antenaMac",
      ]);
      const serializado = JSON.stringify(respuesta.body);
      expect(serializado).not.toContain("2758203X");
      expect(serializado).not.toContain("no-es-una-mac");
    });

    it("rejects a signature that is a tap on the screen", async () => {
      const id = await crearBorrador();

      const respuesta = await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({
          ...cuerpoDeFirma(),
          firmas: [
            {
              documento: "condiciones_generales",
              imagenPng: FIRMA_PNG_REAL,
              trazos: [trazo(2)],
            },
            { documento: "comodato", imagenPng: FIRMA_PNG_REAL, trazos: [trazo()] },
          ],
        })
        .expect(400);

      expect(respuesta.body.error.codigo).toBe("validacion");
    });

    it("rejects only one signature: the customer signs twice", async () => {
      const id = await crearBorrador();

      await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({
          ...cuerpoDeFirma(),
          firmas: [
            { documento: "comodato", imagenPng: FIRMA_PNG_REAL, trazos: [trazo()] },
          ],
        })
        .expect(400);
    });

    /**
     * Ley 25.326. `ContextoDeFirma` refuses to put coordinates into its own
     * messages, and the schema that guards the way in must not undo that.
     */
    it("rejects impossible coordinates without echoing them", async () => {
      const id = await crearBorrador();

      const respuesta = await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({ ...cuerpoDeFirma(), geo: { latitud: 91.5, longitud: -64.2642 } })
        .expect(400);

      const serializado = JSON.stringify(respuesta.body);
      expect(serializado).not.toContain("91.5");
      expect(serializado).not.toContain("-64.2642");
    });

    it("signs without any location at all, because a denied permission cannot block an install", async () => {
      const id = await crearBorrador();
      const { geo: _sinUbicacion, ...sinGeo } = cuerpoDeFirma();

      await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send(sinGeo)
        .expect(200);
    });
  });

  describe("request body size", () => {
    const firmaRealista = (documento: string) => ({
      documento,
      imagenPng: `data:image/png;base64,${"iVBORw0KGgo".repeat(1).padEnd(LARGO_PNG_REALISTA, "A")}`,
      trazos: Array.from({ length: TRAZOS_REALISTAS }, (_, t) =>
        Array.from({ length: PUNTOS_POR_TRAZO_REALISTA }, (_, i) => ({
          x: 12.5 + (i % 190),
          y: 40.25 + (i % 70),
          t: t * 900 + i * 16,
          presion: 0.42,
        })),
      ),
    });

    /**
     * The test this whole section exists for. Express's default body limit is
     * 100 kB and a signing request is several times that — so without a
     * raised limit the customer signs, the request dies with 413, and the
     * signature is gone. Nobody should have to discover that in the field.
     */
    it("accepts a realistic two-signature payload", async () => {
      const id = await crearBorrador();
      const cuerpo = {
        firmas: [
          firmaRealista("condiciones_generales"),
          firmaRealista("comodato"),
        ],
        dispositivoId: "tablet-lenovo-03",
        geo: { latitud: -27.7834, longitud: -64.2642 },
      };

      const tamano = Buffer.byteLength(JSON.stringify(cuerpo));
      // ~380 kB: nearly four times what Express would have accepted, and
      // comfortably inside the raised limit. Both bounds are asserted, so the
      // day someone lowers `LIMITE_CUERPO` this fails here instead of in a
      // customer's kitchen.
      expect(tamano).toBeGreaterThan(3 * LIMITE_POR_DEFECTO_DE_EXPRESS);
      expect(tamano).toBeLessThan(LIMITE_CUERPO_BYTES);

      await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send(cuerpo)
        .expect(200);
    }, 30_000);

    /**
     * And when the limit *is* exceeded: a JSON body in Spanish the tablet can
     * show, not the HTML page (with a stack trace, in development) that
     * Express's default error handler produces for a body-parser failure.
     */
    it("answers an oversized body with a Spanish JSON error, not an HTML page", async () => {
      const id = await crearBorrador();

      const respuesta = await api()
        .post(`/contratos/${id}/firmar`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ relleno: "A".repeat(LIMITE_CUERPO_BYTES + 1024) }))
        .expect(413);

      expect(respuesta.headers["content-type"]).toContain("application/json");
      expect(respuesta.text).not.toContain("<html");
      expect(respuesta.body.error.codigo).toBe("cuerpo_demasiado_grande");
      expect(respuesta.body.error.mensaje).toMatch(/demasiado grande/i);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/PayloadTooLarge|at .*\.js/);
    }, 30_000);

    it("answers unparseable JSON with the same shaped error", async () => {
      const respuesta = await api()
        .post("/contratos")
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .set("Content-Type", "application/json")
        .send("{esto no es json")
        .expect(400);

      expect(respuesta.headers["content-type"]).toContain("application/json");
      expect(respuesta.text).not.toContain("<html");
      expect(respuesta.body.error.codigo).toBe("cuerpo_invalido");
    });
  });

  describe("downloading a document", () => {
    it("refuses to escape the document store through a crafted type", async () => {
      const id = await crearBorrador();
      await firmar(id);

      const rutas = [
        "..%2F..%2F..%2Fetc%2Fpasswd",
        "%2Fetc%2Fpasswd",
        "..%5C..%5Cwindows%5Cwin.ini",
        "comodato%2F..%2F..%2F..%2Fetc%2Fpasswd",
        encodeURIComponent("../../../../../../etc/passwd"),
      ];

      for (const ruta of rutas) {
        const respuesta = await api()
          .get(`/contratos/${id}/documentos/${ruta}`)
          .set("Authorization", `Bearer ${sesion.tecnico}`);

        expect(respuesta.status).toBe(400);
        // Named as the parameter it is, and never echoing what was sent.
        expect(Object.keys(respuesta.body.error.campos)).toEqual(["tipo"]);
        expect(respuesta.text).not.toContain("root:");
        expect(respuesta.text).not.toContain("passwd");
        expect(respuesta.text).not.toContain("win.ini");
      }

      // Nothing new appeared in the store, and nothing left it.
      const contenidoDelAlmacen = await readdir(raizDeDocumentos);
      expect(contenidoDelAlmacen.every((entrada) => /^\d+$/.test(entrada))).toBe(
        true,
      );
    });

    it("answers 409 for a draft, which has no sealed document", async () => {
      const id = await crearBorrador();

      const respuesta = await api()
        .get(`/contratos/${id}/documentos/comodato`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .expect(409);

      expect(respuesta.body.error.codigo).toBe("conflicto_de_estado");
    });

    it("answers 404 for a contract that does not exist", async () => {
      await api()
        .get("/contratos/no-existe/documentos/comodato")
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .expect(404);
    });
  });

  describe("what an error body may never carry", () => {
    it("leaks no personal data, no stack trace and no filesystem path", async () => {
      const id = await crearBorrador();
      await firmar(id);

      const respuestas = await Promise.all([
        api()
          .patch(`/contratos/${id}`)
          .set("Authorization", `Bearer ${sesion.tecnico}`)
          .send({ comodatario: { ...comodatario(), dni: "20111222" } }),
        api()
          .post(`/contratos/${id}/firmar`)
          .set("Authorization", `Bearer ${sesion.tecnico}`)
          .send(cuerpoDeFirma()),
        api()
          .get("/contratos/no-existe")
          .set("Authorization", `Bearer ${sesion.tecnico}`),
        api()
          .post("/contratos")
          .set("Authorization", `Bearer ${sesion.tecnico}`)
          .send({ comodatario: { ...comodatario(), dni: "1" }, equipos: equipos() }),
      ]);

      for (const respuesta of respuestas) {
        const cuerpo = JSON.stringify(respuesta.body);

        expect(cuerpo).not.toContain("30123456");
        expect(cuerpo).not.toContain("30.123.456");
        expect(cuerpo).not.toContain("3854123456");
        expect(cuerpo).not.toContain("-27.7834");
        expect(cuerpo).not.toContain(raizDeDocumentos);
        expect(cuerpo).not.toContain(".pdf");
        expect(cuerpo).not.toMatch(/\bat .+\(.*:\d+:\d+\)/);
        expect(cuerpo).not.toContain("postgresql://");
      }
    });

    /**
     * The successful detail response *does* carry the customer's data — that
     * is what it is for. What it must not carry is the evidence kept
     * server-side: signature images, stroke points, and the signing context
     * whose GPS is the customer's home by another name.
     */
    it("keeps signatures, strokes and the signing context out of a successful read", async () => {
      const id = await crearBorrador();
      await firmar(id);

      const respuesta = await api()
        .get(`/contratos/${id}`)
        .set("Authorization", `Bearer ${sesion.oficina}`)
        .expect(200);

      const cuerpo = JSON.stringify(respuesta.body);
      expect(cuerpo).not.toContain("imagenPng");
      expect(cuerpo).not.toContain("trazos");
      expect(cuerpo).not.toContain("tablet-lenovo-03");
      expect(cuerpo).not.toContain("-27.7834");
      expect(cuerpo).not.toContain(".pdf");
      // …but it does carry what the office panel needs.
      expect(respuesta.body.comodatario.dni).toBe("30.123.456");
      expect(respuesta.body.documentos).toHaveLength(2);
    });
  });
});

/**
 * The three post-signature transitions (DESIGN.md §3), end to end against
 * real Postgres — because what they must get right is exactly what a unit
 * test cannot see: the role gate, the status code the domain chose, and the
 * actor arriving from the token rather than the body.
 */
describe("post-signature transitions", () => {
  /**
   * A contract is signed at whatever the wall clock says, and the domain
   * refuses a baja or an anulación dated before that signature. So the date
   * the signature landed on comes back alongside the id, and every date sent
   * below is measured from it. A literal date here is a fuse: it works until
   * the clock walks past it, and then the suite fails on a morning when
   * nobody touched the code.
   */
  async function contratoVigente(): Promise<{ id: string; firma: string }> {
    const id = await crearBorrador();
    const firmado = await firmar(id);
    expect(firmado.status).toBe(200);

    return { id, firma: firmado.body.fechaFirma };
  }

  /**
   * An ISO date `dias` days from `fecha`, negative to go backwards. The order
   * between two transitions is written through it — `fechaDesplazada(baja,
   * -1)` rather than a second literal that merely happens to fall earlier —
   * so the relationship survives an edit to either one.
   */
  function fechaDesplazada(fecha: string, dias: number): string {
    const desplazada = new Date(`${fecha}T00:00:00Z`);
    desplazada.setUTCDate(desplazada.getUTCDate() + dias);

    return desplazada.toISOString().slice(0, 10);
  }

  /**
   * A month after the signature: a plausible date to end an agreement on, and
   * what every case below uses when the date itself is not what is under test.
   */
  const DIAS_HASTA_LA_BAJA = 30;

  it("lets the office terminate a contract, recording reason, date and actor", async () => {
    const { id, firma } = await contratoVigente();

    const respuesta = await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({
        motivo: "Baja solicitada por el abonado",
        fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA),
      })
      .expect(200);

    expect(respuesta.body.estado).toBe("dado_de_baja");
    expect(respuesta.body.equiposPendientesDeRestitucion).toBe(true);
  });

  it("lets the office annul a contract, which leaves no equipment pending", async () => {
    const { id, firma } = await contratoVigente();

    const respuesta = await api()
      .post(`/contratos/${id}/anulacion`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({
        motivo: "DNI mal cargado",
        fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA),
      })
      .expect(200);

    expect(respuesta.body.estado).toBe("anulado");
    expect(respuesta.body.equiposPendientesDeRestitucion).toBe(false);
  });

  it("lets the office close the outstanding-equipment report", async () => {
    const { id, firma } = await contratoVigente();
    const baja = fechaDesplazada(firma, DIAS_HASTA_LA_BAJA);

    await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: baja })
      .expect(200);

    const respuesta = await api()
      .post(`/contratos/${id}/restitucion`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      // Three weeks later, the way equipment actually comes back: some time
      // after the agreement ended, never on the same afternoon.
      .send({ fecha: fechaDesplazada(baja, 21) })
      .expect(200);

    expect(respuesta.body.equiposPendientesDeRestitucion).toBe(false);
  });

  /**
   * `admin` reads every contract and writes none. The read boundary moved
   * because the list had already moved it; ending someone's agreement is a
   * different question, and none of that argument carries over.
   */
  it.each(["baja", "anulacion", "restitucion"] as const)(
    "refuses %s to an administrator, who reads contracts but never changes them",
    async (transicion) => {
      const { id, firma } = await contratoVigente();

      await api()
        .post(`/contratos/${id}/${transicion}`)
        .set("Authorization", `Bearer ${sesion.admin}`)
        // A body the role gate never gets far enough to read, sent valid all
        // the same: a 403 earned by a malformed request proves nothing.
        .send({
          motivo: "Da igual",
          fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA),
        })
        .expect(403);
    },
  );

  it.each(["baja", "anulacion", "restitucion"] as const)(
    "refuses %s to a técnico, whose job is creating and signing",
    async (transicion) => {
      const { id, firma } = await contratoVigente();

      await api()
        .post(`/contratos/${id}/${transicion}`)
        .set("Authorization", `Bearer ${sesion.tecnico}`)
        .send({
          motivo: "Da igual",
          fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA),
        })
        .expect(403);
    },
  );

  /**
   * The actor comes from the verified token. A body that names its own author
   * is refused outright rather than ignored: silently dropping the field
   * would let a caller believe it had been recorded.
   */
  it("refuses a request that tries to name its own author", async () => {
    const { id, firma } = await contratoVigente();

    const respuesta = await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      // `usuarioId` is the only thing wrong here — everything else, the date
      // included, would have been accepted.
      .send({
        motivo: "Deuda",
        fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA),
        usuarioId: "otro-usuario",
      })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe("validacion");
  });

  /**
   * The point of the whole actor change (DESIGN.md §3). Read from the
   * database rather than the response, because the question this answers —
   * "who ended this contract?" — is asked of the record, months later, not
   * of an HTTP reply. What the reply carries is checked separately below.
   *
   * `usuario-oficina1` is the id the session's token was minted from, which
   * is what proves the actor came from the verified token and not from
   * anything the caller sent.
   */
  it("stamps the event with the id from the caller's token", async () => {
    const { id, firma } = await contratoVigente();

    await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA) })
      .expect(200);

    const eventos = await prisma.eventoContrato.findMany({
      where: { contratoId: id },
      orderBy: { registradoEn: "asc" },
      select: { tipo: true, usuarioId: true },
    });

    expect(eventos.map((evento) => evento.tipo)).toEqual([
      "creado",
      "firmado",
      "dado_de_baja",
    ]);
    expect(eventos.at(-1)?.usuarioId).toBe("usuario-oficina1");
    // The two that never had an author keep a null, not a placeholder.
    expect(eventos.slice(0, 2).map((evento) => evento.usuarioId)).toEqual([null, null]);
  });

  /**
   * The other half: the id is the record, the name is what a screen can
   * render. `Prueba oficina1` is `usuario-oficina1`'s `nombreCompleto`, so
   * this only passes if the id actually round-tripped through `usuarios`.
   */
  it("answers the transition with the actor named, never with the raw id", async () => {
    const { id, firma } = await contratoVigente();

    const respuesta = await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA) })
      .expect(200);

    const eventos = (respuesta.body as DatosContratoDetalle).eventos;
    expect(eventos.map((evento) => [evento.tipo, evento.usuario])).toEqual([
      ["creado", null],
      ["firmado", null],
      ["dado_de_baja", "Prueba oficina1"],
    ]);
    expect(JSON.stringify(respuesta.body)).not.toContain("usuario-oficina1");
  });

  /**
   * The one that can actually be wrong. Resolving the name from the *caller's*
   * own token would satisfy the test above and still be a lie: it would show
   * whoever is looking at the screen as the author of everything. So this
   * reads the contract back as `admin`, who terminated nothing, and demands
   * the history still name `oficina1`.
   */
  it("names the actor from the record, not from whoever is reading it", async () => {
    const { id, firma } = await contratoVigente();
    await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA) })
      .expect(200);

    const respuesta = await api()
      .get(`/contratos/${id}`)
      .set("Authorization", `Bearer ${sesion.admin}`)
      .expect(200);

    const eventos = (respuesta.body as DatosContratoDetalle).eventos;
    expect(eventos.at(-1)?.usuario).toBe("Prueba oficina1");
    expect(JSON.stringify(respuesta.body)).not.toContain("Prueba jefe");
  });

  it("refuses a termination with no reason, naming the field", async () => {
    const { id, firma } = await contratoVigente();

    const respuesta = await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      // `motivo` is the only thing wrong here, so the field the answer names
      // can only be that one.
      .send({ motivo: "   ", fecha: fechaDesplazada(firma, DIAS_HASTA_LA_BAJA) })
      .expect(400);

    expect(Object.keys(respuesta.body.error.campos)).toContain("motivo");
  });

  /**
   * A draft was never in force, so there is nothing to end: 409, not 400.
   *
   * The only literal date left in this file, and the only one that cannot
   * drift: a draft has no `fechaFirma` for the date to be measured against,
   * so `darDeBaja` refuses it on the state and never reads the field at all.
   */
  it("answers 409 when the contract is not in a state that allows the transition", async () => {
    const id = await crearBorrador();

    const respuesta = await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: "2027-03-10" })
      .expect(409);

    expect(respuesta.body.error.codigo).toBe("conflicto_de_estado");
  });

  /**
   * The distinction the domain drew on purpose: the contract is in exactly
   * the right state to take a restitution, one FIELD is simply wrong, and a
   * different date works — so 400, never 409.
   */
  it("answers 400, not 409, for a restitution dated before the termination", async () => {
    const { id, firma } = await contratoVigente();
    const baja = fechaDesplazada(firma, DIAS_HASTA_LA_BAJA);

    await api()
      .post(`/contratos/${id}/baja`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      .send({ motivo: "Deuda", fecha: baja })
      .expect(200);

    await api()
      .post(`/contratos/${id}/restitucion`)
      .set("Authorization", `Bearer ${sesion.oficina}`)
      // The day before the baja, and still well after the signature: the one
      // thing wrong with this request is the order of the two dates, which is
      // exactly the distinction under test.
      .send({ fecha: fechaDesplazada(baja, -1) })
      .expect(400);
  });
});
