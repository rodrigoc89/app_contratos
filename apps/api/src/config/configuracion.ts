import { z } from "zod";

/**
 * The server's configuration, read from the environment once at boot.
 *
 * Everything here is validated before the HTTP server is created, so a missing
 * `JWT_SECRET` or a malformed `DATABASE_URL` kills the process on the ground
 * rather than at the first request — which, in this system, means in front of a
 * technician standing at a customer's house with a half-signed contract.
 *
 * The environment is passed in rather than read from `process.env` here so the
 * validator is a plain, testable function. Nothing in this file loads a `.env`
 * file: that is the operator's job (systemd `EnvironmentFile`, or `dotenv` in
 * the dev scripts). See `.env.example` for the full list.
 */

const MINUTOS_MAXIMOS_DE_ACCESO = 60;

/**
 * Zod's built-in messages are English. Everything an operator reads while a
 * deployment is failing has to be Spanish, so every rule below carries its own
 * message — including the "you did not set this at all" case, which is by far
 * the most common one and the one Zod would otherwise report as
 * "expected string, received undefined".
 */
const EsquemaConfiguracion = z.object({
  NODE_ENV: z
    .enum(
      ["development", "test", "production"],
      "NODE_ENV tiene que ser development, test o production.",
    )
    .default("development"),

  PORT: z.coerce
    .number("PORT tiene que ser un número de puerto TCP (1 a 65535).")
    .int("PORT tiene que ser un número entero.")
    .min(1, "PORT tiene que estar entre 1 y 65535.")
    .max(65535, "PORT tiene que estar entre 1 y 65535.")
    .default(3000),

  DATABASE_URL: z
    .string("Falta DATABASE_URL: la cadena de conexión a PostgreSQL.")
    .min(1, "Falta DATABASE_URL: la cadena de conexión a PostgreSQL.")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL tiene que ser una URL de PostgreSQL (postgresql://…).",
    ),

  /**
   * No default, deliberately. A signing key with a fallback value is a signing
   * key an attacker already has: every deployment that forgot to set it would
   * accept tokens minted by anyone who has read this repository.
   */
  JWT_SECRET: z
    .string(
      "Falta JWT_SECRET: la clave con la que se firman los tokens de acceso. No tiene valor por defecto. Genérela con `openssl rand -base64 48`.",
    )
    .min(
      32,
      "JWT_SECRET tiene que tener al menos 32 caracteres. Genérela con `openssl rand -base64 48`.",
    ),

  /**
   * Access tokens are not revocable — they are verified by signature alone, so
   * a stolen one stays valid until it expires. That is why the cap is an hour:
   * revoking a lost tablet has to actually take effect in minutes.
   */
  JWT_ACCESO_MINUTOS: z.coerce
    .number("JWT_ACCESO_MINUTOS tiene que ser un número de minutos.")
    .int("JWT_ACCESO_MINUTOS tiene que ser un número entero de minutos.")
    .positive("JWT_ACCESO_MINUTOS tiene que ser mayor que cero.")
    .max(
      MINUTOS_MAXIMOS_DE_ACCESO,
      `JWT_ACCESO_MINUTOS no puede superar los ${MINUTOS_MAXIMOS_DE_ACCESO} minutos: el token de acceso no se puede revocar, así que su vida corta es lo que hace que revocar un dispositivo sirva de algo.`,
    )
    .default(15),

  JWT_REFRESH_DIAS: z.coerce
    .number("JWT_REFRESH_DIAS tiene que ser un número de días.")
    .int("JWT_REFRESH_DIAS tiene que ser un número entero de días.")
    .positive("JWT_REFRESH_DIAS tiene que ser mayor que cero.")
    .max(365, "JWT_REFRESH_DIAS no puede superar los 365 días.")
    .default(30),

  /** Login attempts allowed per IP per minute before the throttler answers 429. */
  LOGIN_INTENTOS_POR_MINUTO: z.coerce
    .number("LOGIN_INTENTOS_POR_MINUTO tiene que ser un número.")
    .int("LOGIN_INTENTOS_POR_MINUTO tiene que ser un número entero.")
    .positive("LOGIN_INTENTOS_POR_MINUTO tiene que ser mayor que cero.")
    .default(5),

  /**
   * Only turn this on when the process really is behind Nginx (DESIGN.md §10).
   * With it on and no proxy in front, any client can forge `X-Forwarded-For`
   * and walk straight through the login rate limit.
   */
  CONFIAR_EN_PROXY: z
    .enum(["true", "false"], 'CONFIAR_EN_PROXY tiene que ser "true" o "false".')
    .default("false")
    .transform((valor) => valor === "true"),

  /**
   * Root directory of the signed-PDF archive.
   *
   * The PDFs are the legal asset (DESIGN.md §7), so where they land is an
   * operational decision — a mounted volume, a directory replicated offsite —
   * and it belongs here rather than in a `process.env` read next to the code
   * that writes them. The default is relative on purpose: it works out of the
   * box for development, and it is obviously wrong for a server, which is what
   * makes an operator set it.
   */
  ALMACEN_DOCUMENTOS_RUTA: z
    .string("ALMACEN_DOCUMENTOS_RUTA tiene que ser una ruta de directorio.")
    .trim()
    .min(
      1,
      "ALMACEN_DOCUMENTOS_RUTA no puede estar vacía: es el directorio donde se guardan los PDF firmados.",
    )
    .default("var/documentos"),
});

export interface ConfiguracionJwt {
  readonly secreto: string;
  readonly minutosDeAcceso: number;
  readonly diasDeRefresco: number;
}

export interface Configuracion {
  readonly entorno: "development" | "test" | "production";
  readonly puerto: number;
  readonly urlBaseDeDatos: string;
  readonly jwt: ConfiguracionJwt;
  readonly loginIntentosPorMinuto: number;
  readonly confiarEnProxy: boolean;
  /** Root of the signed-PDF archive. */
  readonly rutaAlmacenDeDocumentos: string;
}

/** Injection token: `Configuracion` is an interface and has no runtime value. */
export const CONFIGURACION = Symbol("CONFIGURACION");

/** Raised when the environment cannot produce a usable configuration. */
export class ErrorDeConfiguracion extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDeConfiguracion";
  }
}

export function cargarConfiguracion(
  entorno: Record<string, string | undefined>,
): Configuracion {
  const resultado = EsquemaConfiguracion.safeParse(entorno);

  if (!resultado.success) {
    // Every problem at once: an operator fixing a fresh VPS should need one
    // boot to learn everything that is wrong, not one boot per variable.
    const problemas = resultado.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");

    throw new ErrorDeConfiguracion(
      `La configuración del servidor es inválida y por eso no arranca:\n${problemas}\n\nRevise las variables de entorno (ver .env.example).`,
    );
  }

  const valores = resultado.data;

  return {
    entorno: valores.NODE_ENV,
    puerto: valores.PORT,
    urlBaseDeDatos: valores.DATABASE_URL,
    jwt: {
      secreto: valores.JWT_SECRET,
      minutosDeAcceso: valores.JWT_ACCESO_MINUTOS,
      diasDeRefresco: valores.JWT_REFRESH_DIAS,
    },
    loginIntentosPorMinuto: valores.LOGIN_INTENTOS_POR_MINUTO,
    confiarEnProxy: valores.CONFIAR_EN_PROXY,
    rutaAlmacenDeDocumentos: valores.ALMACEN_DOCUMENTOS_RUTA,
  };
}

/**
 * The one-line boot banner.
 *
 * It exists so nothing is ever tempted to `console.log(config)`: that object
 * holds the JWT signing key and the database password, and a boot log is the
 * single most-copied piece of text in any incident.
 */
export function describirConfiguracion(config: Configuracion): string {
  return [
    `entorno=${config.entorno}`,
    `puerto=${config.puerto}`,
    `base=${destinoDeBaseDeDatos(config.urlBaseDeDatos)}`,
    `acceso=${config.jwt.minutosDeAcceso}min`,
    `refresco=${config.jwt.diasDeRefresco}d`,
    `proxy=${config.confiarEnProxy ? "sí" : "no"}`,
  ].join(" ");
}

/** `host:puerto/base` — never the credentials embedded in the URL. */
function destinoDeBaseDeDatos(url: string): string {
  try {
    const analizada = new URL(url);
    return `${analizada.host}${analizada.pathname}`;
  } catch {
    return "(url ilegible)";
  }
}
