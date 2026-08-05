import type { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import type { PlantillaContrato } from "../plantillas/domain/PlantillaContrato";
import {
  PROVISIONAL_SIGNATORY_VERSION,
  type SeedContent,
} from "./seedContent";

/**
 * The two writes the seed needs, named as ports so the guard below can be
 * tested without a database. `PrismaPlantillaRepository` and
 * `PrismaFirmanteRepository` satisfy them.
 */
export interface TemplateSeedStore {
  buscarPorVersion(version: string): Promise<PlantillaContrato | null>;
  publicar(plantilla: PlantillaContrato): Promise<void>;
}

export interface SignatorySeedStore {
  buscarPorVersion(version: string): Promise<FirmanteComodante | null>;
  instalarComoActivo(firmante: FirmanteComodante): Promise<void>;
}

export type SeedAction = "created" | "already-present";

export interface SeedReport {
  readonly plantilla: { readonly version: string; readonly action: SeedAction };
  readonly firmante: { readonly version: string; readonly action: SeedAction };
}

export interface SeedDatabaseInput {
  readonly content: SeedContent;
  readonly templates: TemplateSeedStore;
  readonly signatories: SignatorySeedStore;
  /** `process.env.NODE_ENV`, passed in rather than read, so it is testable. */
  readonly nodeEnv: string | undefined;
}

/**
 * Publishes the contract template version and installs the comodante
 * signatory, once.
 *
 * Idempotent by version: both halves are looked up by their version string
 * before anything is written, so running the seed twice leaves exactly one
 * template version and one signatory. That matters beyond tidiness — a second
 * template row with the same `vigenteDesde` would make "the version in force
 * today" ambiguous, and a second active signatory is rejected by the database
 * outright.
 */
export async function seedDatabase(
  input: SeedDatabaseInput,
): Promise<SeedReport> {
  const { content, templates, signatories, nodeEnv } = input;

  // THE line. The seeded signature is a legible "FIRMA DE PRUEBA - NO VALIDA"
  // block, and a contract signed with it is rendered, hashed, sealed and
  // stored exactly like a real one — there is no later stage that would catch
  // it. So production refuses to start from here.
  if (
    nodeEnv === "production" &&
    content.firmante.version === PROVISIONAL_SIGNATORY_VERSION
  ) {
    throw new Error(
      `No se puede sembrar la base de datos de producción con la firma de prueba (versión "${PROVISIONAL_SIGNATORY_VERSION}"): todavía no se cargó la firma real del comodante. Cargue la imagen real en prisma/firmas, actualice SIGNATORY_VERSION y SIGNATORY_ID en src/seed/seedContent.ts y vuelva a ejecutar la semilla.`,
    );
  }

  return {
    plantilla: {
      version: content.plantilla.version,
      action: await publicarPlantilla(templates, content.plantilla),
    },
    firmante: {
      version: content.firmante.version,
      action: await instalarFirmante(signatories, content.firmante),
    },
  };
}

async function publicarPlantilla(
  templates: TemplateSeedStore,
  plantilla: PlantillaContrato,
): Promise<SeedAction> {
  const existente = await templates.buscarPorVersion(plantilla.version);
  if (existente !== null) {
    return "already-present";
  }

  await templates.publicar(plantilla);
  return "created";
}

async function instalarFirmante(
  signatories: SignatorySeedStore,
  firmante: FirmanteComodante,
): Promise<SeedAction> {
  const existente = await signatories.buscarPorVersion(firmante.version);
  if (existente !== null) {
    return "already-present";
  }

  await signatories.instalarComoActivo(firmante);
  return "created";
}

/** One line per half, for the seed script's stdout. */
export function describeSeedReport(reporte: SeedReport): string {
  const frase = (accion: SeedAction): string =>
    accion === "created" ? "se creó" : "ya existía";

  return [
    `Plantilla de contrato "${reporte.plantilla.version}": ${frase(reporte.plantilla.action)}.`,
    `Firmante comodante "${reporte.firmante.version}": ${frase(reporte.firmante.action)}.`,
  ].join("\n");
}
