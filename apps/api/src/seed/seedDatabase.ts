import type { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import type { HashDeContrasena } from "../identidad/application/ports/puertos";
import { Usuario } from "../identidad/domain/Usuario";
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

/** The one write the admin half needs, named as a port like the two above. */
export interface AdminSeedStore {
  buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null>;
  guardar(usuario: Usuario): Promise<void>;
}

/**
 * Shortest password the seed will accept.
 *
 * This is the `admin` account of an internet-facing box, created once by
 * someone at a keyboard — there is no usability argument for a short one.
 */
export const LARGO_MINIMO_CONTRASENA_ADMIN = 12;

export interface AdminSeedInput {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombreCompleto: string;
  /**
   * From `SEED_ADMIN_PASSWORD`. `undefined` when the operator did not set it —
   * which is a supported outcome, not an error. See `sembrarAdministrador`.
   */
  readonly contrasena: string | undefined;
  readonly usuarios: AdminSeedStore;
  readonly hasher: HashDeContrasena;
}

export type SeedAction = "created" | "already-present" | "omitido";

export interface SeedReport {
  readonly plantilla: { readonly version: string; readonly action: SeedAction };
  readonly firmante: { readonly version: string; readonly action: SeedAction };
  /** `null` when the caller did not ask for an admin at all. */
  readonly administrador: {
    readonly nombreUsuario: string;
    readonly action: SeedAction;
  } | null;
}

export interface SeedDatabaseInput {
  readonly content: SeedContent;
  readonly templates: TemplateSeedStore;
  readonly signatories: SignatorySeedStore;
  /** `process.env.NODE_ENV`, passed in rather than read, so it is testable. */
  readonly nodeEnv: string | undefined;
  /** Optional: omitting it seeds the template and signatory only. */
  readonly administrador?: AdminSeedInput;
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
    administrador:
      input.administrador === undefined
        ? null
        : await sembrarAdministrador(input.administrador),
  };
}

/**
 * Creates the first `admin` account — or refuses to.
 *
 * **There is no default password, and there will not be one.** This is the
 * same call the seed already makes about the placeholder signature: a bad
 * default that reaches production is not something a later stage catches, so
 * the only reliable defence is to make it impossible to create by accident.
 * The password comes from `SEED_ADMIN_PASSWORD` or the account is not created.
 *
 * The alternative — seed a known password and force a change at first login —
 * was rejected on two counts. It leaves a window in which a publicly-known
 * credential is live on an internet-facing box, and that window closes only
 * when someone gets round to logging in. And "must change password" is
 * application logic: it lives in a flag that every future code path has to
 * remember to check, so the first path that forgets silently reopens the hole.
 * Requiring the operator to supply the password means there is never a moment
 * when a credential exists that the operator did not choose.
 *
 * An absent variable is a supported outcome (the template and signatory still
 * seed, and the report says so loudly). A *weak* one is not: the operator
 * clearly meant to set a password, and silently skipping would read as success
 * in a deploy log.
 */
async function sembrarAdministrador(
  admin: AdminSeedInput,
): Promise<{ nombreUsuario: string; action: SeedAction }> {
  const nombreUsuario = admin.nombreUsuario.trim().toLowerCase();

  const existente = await admin.usuarios.buscarPorNombreUsuario(nombreUsuario);
  if (existente !== null) {
    // Never re-hash over an existing account. Otherwise re-running the seed
    // with a stale environment variable would silently reset an admin
    // password that had already been rotated.
    return { nombreUsuario, action: "already-present" };
  }

  if (admin.contrasena === undefined || admin.contrasena.trim() === "") {
    return { nombreUsuario, action: "omitido" };
  }

  if (admin.contrasena.length < LARGO_MINIMO_CONTRASENA_ADMIN) {
    throw new Error(
      `SEED_ADMIN_PASSWORD tiene que tener al menos ${LARGO_MINIMO_CONTRASENA_ADMIN} caracteres: es la cuenta de administración de un servidor expuesto a internet.`,
    );
  }

  await admin.usuarios.guardar(
    Usuario.crear({
      id: admin.id,
      nombreUsuario,
      nombreCompleto: admin.nombreCompleto,
      rol: "admin",
      activo: true,
      hashDeContrasena: await admin.hasher.hashear(admin.contrasena),
    }),
  );

  return { nombreUsuario, action: "created" };
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

  const lineas = [
    `Plantilla de contrato "${reporte.plantilla.version}": ${frase(reporte.plantilla.action)}.`,
    `Firmante comodante "${reporte.firmante.version}": ${frase(reporte.firmante.action)}.`,
  ];

  const admin = reporte.administrador;
  if (admin !== null) {
    lineas.push(
      admin.action === "omitido"
        ? `ATENCION: no se creó el usuario administrador "${admin.nombreUsuario}" porque no se definió SEED_ADMIN_PASSWORD. Nadie puede entrar al sistema todavía. Defina esa variable con una contraseña elegida por usted y vuelva a ejecutar la semilla; esta aplicación no inventa contraseñas por defecto.`
        : `Usuario administrador "${admin.nombreUsuario}": ${frase(admin.action)}.`,
    );
  }

  return lineas.join("\n");
}
