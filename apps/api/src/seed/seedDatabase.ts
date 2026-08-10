import type { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import type { HashDeContrasena } from "../identidad/application/ports/puertos";
import { Usuario } from "../identidad/domain/Usuario";
import type { RolUsuario } from "../identidad/domain/Usuario";
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

/**
 * The one write a seeded account needs, named as a port like the two above.
 * Shared by the admin and the técnico halves — neither needs anything the
 * other doesn't.
 */
export interface AdminSeedStore {
  buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null>;
  guardar(usuario: Usuario): Promise<void>;
}

/**
 * Shortest password the seed will accept for the `admin` account.
 *
 * This is the `admin` account of an internet-facing box, created once by
 * someone at a keyboard — there is no usability argument for a short one.
 */
export const LARGO_MINIMO_CONTRASENA_ADMIN = 12;

/**
 * Shortest password the seed will accept for the `tecnico` account —
 * deliberately the same as the admin's, not lowered for the touch keyboard.
 *
 * Usability is a real cost here: typed by hand, sometimes in direct sun, in a
 * customer's home. It does not win. `POST /auth/login` is the same
 * internet-facing, same-origin endpoint for every role, so a shorter técnico
 * password is not a shorter attack surface — only a weaker credential on an
 * equally exposed door. And what it authenticates is at least as
 * consequential as `admin`: it signs a legally binding comodato contract on
 * the company's behalf (DESIGN.md §6). A different blast radius, not a
 * lesser one.
 */
export const LARGO_MINIMO_CONTRASENA_TECNICO = 12;

export interface AdminSeedInput {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombreCompleto: string;
  /**
   * From `SEED_ADMIN_PASSWORD`. `undefined` when the operator did not set it —
   * which is a supported outcome, not an error. See `sembrarCuenta`.
   */
  readonly contrasena: string | undefined;
  readonly usuarios: AdminSeedStore;
  readonly hasher: HashDeContrasena;
}

/**
 * The técnico input has the exact same shape as the admin's — see
 * `sembrarCuenta`, the one place both are provisioned from.
 */
export type TecnicoSeedInput = AdminSeedInput;

export type SeedAction = "created" | "already-present" | "omitido";

interface EstadoDeCuenta {
  readonly nombreUsuario: string;
  readonly action: SeedAction;
}

export interface SeedReport {
  readonly plantilla: { readonly version: string; readonly action: SeedAction };
  readonly firmante: { readonly version: string; readonly action: SeedAction };
  /** `null` when the caller did not ask for an admin at all. */
  readonly administrador: EstadoDeCuenta | null;
  /** `null` when the caller did not ask for a técnico at all. */
  readonly tecnico: EstadoDeCuenta | null;
}

export interface SeedDatabaseInput {
  readonly content: SeedContent;
  readonly templates: TemplateSeedStore;
  readonly signatories: SignatorySeedStore;
  /** `process.env.NODE_ENV`, passed in rather than read, so it is testable. */
  readonly nodeEnv: string | undefined;
  /** Optional: omitting it seeds the template and signatory only. */
  readonly administrador?: AdminSeedInput;
  /** Optional: omitting it leaves the signing flow unreachable — see README.md. */
  readonly tecnico?: TecnicoSeedInput;
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
        : await sembrarCuenta(input.administrador, {
            rol: "admin",
            variableContrasena: "SEED_ADMIN_PASSWORD",
            largoMinimoContrasena: LARGO_MINIMO_CONTRASENA_ADMIN,
            descripcionParaError:
              "es la cuenta de administración de un servidor expuesto a internet.",
          }),
    tecnico:
      input.tecnico === undefined
        ? null
        : await sembrarCuenta(input.tecnico, {
            rol: "tecnico",
            variableContrasena: "SEED_TECNICO_PASSWORD",
            largoMinimoContrasena: LARGO_MINIMO_CONTRASENA_TECNICO,
            descripcionParaError:
              "firma contratos vinculantes en nombre de la empresa desde el dispositivo de campo.",
          }),
  };
}

/** What distinguishes one seedable account (admin, técnico) from another. */
interface ConfiguracionDeCuenta {
  readonly rol: RolUsuario;
  /** The environment variable named in every message about this account's password. */
  readonly variableContrasena: string;
  readonly largoMinimoContrasena: number;
  /** Completes "`${variableContrasena}` tiene que tener al menos N caracteres: `${descripcionParaError}`". */
  readonly descripcionParaError: string;
}

/**
 * Creates one seeded account — admin or técnico — or refuses to.
 *
 * **There is no default password, and there will not be one.** Same call the
 * seed already makes about the placeholder signature: a bad default that
 * reaches production is not something a later stage catches, so the only
 * reliable defence is to make it impossible to create by accident. The
 * password comes from the account's own environment variable
 * (`SEED_ADMIN_PASSWORD`, `SEED_TECNICO_PASSWORD`) or the account is not
 * created — seeding a known password and forcing a change at first login was
 * rejected: it leaves a public credential live until someone logs in, and
 * "must change password" is a flag every future path must remember to check.
 *
 * An absent variable is a supported outcome (the template and signatory still
 * seed, and the report says so loudly). A *weak* one is not: the operator
 * clearly meant to set a password, and silently skipping would read as success
 * in a deploy log.
 */
async function sembrarCuenta(
  cuenta: AdminSeedInput,
  configuracion: ConfiguracionDeCuenta,
): Promise<EstadoDeCuenta> {
  const nombreUsuario = cuenta.nombreUsuario.trim().toLowerCase();

  const existente = await cuenta.usuarios.buscarPorNombreUsuario(nombreUsuario);
  if (existente !== null) {
    // Never re-hash over an existing account. Otherwise re-running the seed
    // with a stale environment variable would silently reset a password that
    // had already been rotated.
    return { nombreUsuario, action: "already-present" };
  }

  if (cuenta.contrasena === undefined || cuenta.contrasena.trim() === "") {
    return { nombreUsuario, action: "omitido" };
  }

  if (cuenta.contrasena.length < configuracion.largoMinimoContrasena) {
    throw new Error(
      `${configuracion.variableContrasena} tiene que tener al menos ${configuracion.largoMinimoContrasena} caracteres: ${configuracion.descripcionParaError}`,
    );
  }

  await cuenta.usuarios.guardar(
    Usuario.crear({
      id: cuenta.id,
      nombreUsuario,
      nombreCompleto: cuenta.nombreCompleto,
      rol: configuracion.rol,
      activo: true,
      hashDeContrasena: await cuenta.hasher.hashear(cuenta.contrasena),
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
        ? `ATENCION: no se creó el usuario administrador "${admin.nombreUsuario}" porque no se definió SEED_ADMIN_PASSWORD. El panel de administración no estará disponible hasta que la cree. Defina esa variable con una contraseña elegida por usted y vuelva a ejecutar la semilla; esta aplicación no inventa contraseñas por defecto.`
        : `Usuario administrador "${admin.nombreUsuario}": ${frase(admin.action)}.`,
    );
  }

  const tecnico = reporte.tecnico;
  if (tecnico !== null) {
    lineas.push(
      tecnico.action === "omitido"
        ? `ATENCION: no se creó el usuario técnico "${tecnico.nombreUsuario}" porque no se definió SEED_TECNICO_PASSWORD. Nadie puede firmar un contrato todavía: la aplicación solo implementa el flujo del técnico, así que sin esta cuenta el flujo de firma es inalcanzable. Defina esa variable con una contraseña elegida por usted y vuelva a ejecutar la semilla; esta aplicación no inventa contraseñas por defecto.`
        : `Usuario técnico "${tecnico.nombreUsuario}": ${frase(tecnico.action)}.`,
    );
  }

  return lineas.join("\n");
}
