import { randomUUID } from "node:crypto";

import { Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";

import type { PrismaClient } from "../../generated/prisma/client";
import { CONFIGURACION, type Configuracion } from "../config/configuracion";
import { PrismaFirmanteRepository } from "../firmantes/infrastructure/PrismaFirmanteRepository";
import { PRISMA } from "../persistencia/PrismaModule";
import { PrismaPlantillaRepository } from "../plantillas/infrastructure/PrismaPlantillaRepository";
import { ActualizarBorrador } from "./application/ActualizarBorrador";
import { BuscarContratos } from "./application/BuscarContratos";
import { AnularContrato } from "./application/AnularContrato";
import { ConsultarContrato } from "./application/ConsultarContrato";
import { DarDeBajaContrato } from "./application/DarDeBajaContrato";
import { RegistrarRestitucion } from "./application/RegistrarRestitucion";
import { CrearBorrador } from "./application/CrearBorrador";
import { DescargarDocumento } from "./application/DescargarDocumento";
import { FirmarContrato } from "./application/FirmarContrato";
import type { AlmacenDeDocumentos } from "./application/ports/AlmacenDeDocumentos";
import type { ContratoRepository } from "./application/ports/ContratoRepository";
import type { FirmanteRepository } from "./application/ports/FirmanteRepository";
import type { IdentificadorUnico } from "./application/ports/IdentificadorUnico";
import type { PlantillaRepository } from "./application/ports/PlantillaRepository";
import type { Reloj } from "./application/ports/Reloj";
import { PrevisualizarContrato } from "./application/PrevisualizarContrato";
import {
  ACTUALIZAR_BORRADOR,
  ALMACEN_DE_DOCUMENTOS,
  BUSCAR_CONTRATOS,
  ANULAR_CONTRATO,
  CONSULTAR_CONTRATO,
  CONTRATO_REPOSITORY,
  DAR_DE_BAJA_CONTRATO,
  CREAR_BORRADOR,
  DESCARGAR_DOCUMENTO,
  FIRMANTE_REPOSITORY,
  REGISTRAR_RESTITUCION,
  FIRMAR_CONTRATO,
  GENERADOR_DE_DOCUMENTOS,
  IDENTIFICADOR_DE_CONTRATO,
  PLANTILLA_REPOSITORY,
  PREVISUALIZAR_CONTRATO,
  RELOJ_CONTRATOS,
} from "./ContratosModule.tokens";
import { AlmacenDeDocumentosEnDisco } from "./infrastructure/AlmacenDeDocumentosEnDisco";
import { GeneradorDeDocumentosPuppeteer } from "./infrastructure/GeneradorDeDocumentosPuppeteer";
import { PrismaContratoRepository } from "./infrastructure/PrismaContratoRepository";
import { RelojDelSistema } from "./infrastructure/RelojDelSistema";
import { ContratosController } from "./interface/ContratosController";

/** Server-side ids, so nothing on the tablet ever invents one (§2). */
class IdentificadoresUuidDeContrato implements IdentificadorUnico {
  nuevo(): string {
    return randomUUID();
  }
}

/**
 * Closes the shared headless Chromium when the process is shutting down.
 *
 * `main.ts` left this extension point open and named the cost of skipping it:
 * `GeneradorDeDocumentosPuppeteer` keeps one browser alive across every
 * render, and without this hook every restart leaks a Chromium process on a
 * 4 GB VPS — the box whose single biggest memory consumer is that very
 * browser (DESIGN.md §7, §10).
 *
 * A separate provider rather than a lifecycle method on the generator itself,
 * exactly as `CierreDePrisma` does it: the generator is built by a plain
 * factory and has no business knowing about NestJS.
 */
@Injectable()
class CierreDelGeneradorDeDocumentos implements OnApplicationShutdown {
  constructor(
    @Inject(GENERADOR_DE_DOCUMENTOS)
    private readonly generador: GeneradorDeDocumentosPuppeteer,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.generador.cerrar();
  }
}

/**
 * Contract signing: the endpoints the tablet calls (DESIGN.md §6).
 *
 * Every provider is registered against an explicit token with a `useFactory`.
 * `src/main.ts` explains why and it is load-bearing: the runtime is jiti,
 * which emits decorator metadata, and the test transpiler is esbuild, which
 * does not. Writing the wiring out means the container behaves identically in
 * both, so what a test exercises is what ships.
 *
 * Authentication comes for free — `IdentidadModule` registers its guards
 * globally, so these endpoints were protected the moment they existed and the
 * roles on each route are the only access decision this module makes.
 */
@Module({
  controllers: [ContratosController],
  providers: [
    // ---- platform adapters ----------------------------------------------
    {
      provide: RELOJ_CONTRATOS,
      useFactory: (): Reloj => new RelojDelSistema(),
    },
    {
      provide: IDENTIFICADOR_DE_CONTRATO,
      useFactory: (): IdentificadorUnico => new IdentificadoresUuidDeContrato(),
    },

    // ---- persistence -----------------------------------------------------
    {
      provide: CONTRATO_REPOSITORY,
      inject: [PRISMA, RELOJ_CONTRATOS],
      useFactory: (prisma: PrismaClient, reloj: Reloj): ContratoRepository =>
        new PrismaContratoRepository(prisma, reloj),
    },
    {
      provide: PLANTILLA_REPOSITORY,
      inject: [PRISMA, RELOJ_CONTRATOS],
      useFactory: (prisma: PrismaClient, reloj: Reloj): PlantillaRepository =>
        new PrismaPlantillaRepository(prisma, reloj),
    },
    {
      provide: FIRMANTE_REPOSITORY,
      inject: [PRISMA],
      useFactory: (prisma: PrismaClient): FirmanteRepository =>
        new PrismaFirmanteRepository(prisma),
    },

    // ---- documents -------------------------------------------------------
    {
      provide: ALMACEN_DE_DOCUMENTOS,
      inject: [CONFIGURACION],
      // The store root is configuration, validated at boot — never a
      // `process.env` read next to the code that writes the legal asset.
      useFactory: (config: Configuracion): AlmacenDeDocumentos =>
        new AlmacenDeDocumentosEnDisco(config.rutaAlmacenDeDocumentos),
    },
    {
      provide: GENERADOR_DE_DOCUMENTOS,
      inject: [ALMACEN_DE_DOCUMENTOS],
      // Concrete rather than the port type, so the shutdown hook can reach
      // `cerrar()` through the same token without a downcast.
      useFactory: (
        almacen: AlmacenDeDocumentos,
      ): GeneradorDeDocumentosPuppeteer =>
        new GeneradorDeDocumentosPuppeteer({ almacen }),
    },
    CierreDelGeneradorDeDocumentos,

    // ---- use cases -------------------------------------------------------
    {
      provide: CREAR_BORRADOR,
      inject: [CONTRATO_REPOSITORY, IDENTIFICADOR_DE_CONTRATO],
      useFactory: (contratos: ContratoRepository, ids: IdentificadorUnico) =>
        new CrearBorrador(contratos, ids),
    },
    {
      provide: ACTUALIZAR_BORRADOR,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) =>
        new ActualizarBorrador(contratos),
    },
    {
      provide: CONSULTAR_CONTRATO,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) =>
        new ConsultarContrato(contratos),
    },
    {
      provide: DAR_DE_BAJA_CONTRATO,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) => new DarDeBajaContrato(contratos),
    },
    {
      provide: ANULAR_CONTRATO,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) => new AnularContrato(contratos),
    },
    {
      provide: REGISTRAR_RESTITUCION,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) => new RegistrarRestitucion(contratos),
    },
    {
      provide: PREVISUALIZAR_CONTRATO,
      inject: [
        CONTRATO_REPOSITORY,
        PLANTILLA_REPOSITORY,
        FIRMANTE_REPOSITORY,
        RELOJ_CONTRATOS,
      ],
      useFactory: (
        contratos: ContratoRepository,
        plantillas: PlantillaRepository,
        firmantes: FirmanteRepository,
        reloj: Reloj,
      ) => new PrevisualizarContrato(contratos, plantillas, firmantes, reloj),
    },
    {
      provide: FIRMAR_CONTRATO,
      inject: [
        CONTRATO_REPOSITORY,
        PLANTILLA_REPOSITORY,
        FIRMANTE_REPOSITORY,
        GENERADOR_DE_DOCUMENTOS,
        RELOJ_CONTRATOS,
      ],
      useFactory: (
        contratos: ContratoRepository,
        plantillas: PlantillaRepository,
        firmantes: FirmanteRepository,
        documentos: GeneradorDeDocumentosPuppeteer,
        reloj: Reloj,
      ) =>
        new FirmarContrato(
          contratos,
          plantillas,
          firmantes,
          documentos,
          reloj,
        ),
    },
    {
      provide: DESCARGAR_DOCUMENTO,
      inject: [CONTRATO_REPOSITORY, ALMACEN_DE_DOCUMENTOS],
      useFactory: (
        contratos: ContratoRepository,
        almacen: AlmacenDeDocumentos,
      ) => new DescargarDocumento(contratos, almacen),
    },
    {
      provide: BUSCAR_CONTRATOS,
      inject: [CONTRATO_REPOSITORY],
      useFactory: (contratos: ContratoRepository) =>
        new BuscarContratos(contratos),
    },
  ],
})
export class ContratosModule {}
