import { describe, expect, it } from "vitest";

import {
  cargarConfiguracion,
  describirConfiguracion,
  ErrorDeConfiguracion,
} from "./configuracion";

/** The smallest environment that is expected to boot. */
function entornoValido(): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    DATABASE_URL: "postgresql://contratos:contratos@localhost:5432/contratos",
    JWT_SECRET: "x".repeat(32),
  };
}

describe("cargarConfiguracion", () => {
  it("reads a complete environment and applies the documented defaults", () => {
    const config = cargarConfiguracion(entornoValido());

    expect(config.entorno).toBe("test");
    expect(config.puerto).toBe(3000);
    expect(config.urlBaseDeDatos).toContain("postgresql://");
    expect(config.jwt.minutosDeAcceso).toBe(15);
    expect(config.jwt.diasDeRefresco).toBe(30);
    expect(config.loginIntentosPorMinuto).toBe(5);
    expect(config.confiarEnProxy).toBe(false);
    expect(config.rutaAlmacenDeDocumentos).toBe("var/documentos");
  });

  /**
   * The PDF archive is the legal asset (DESIGN.md §7). Where it lives is an
   * operational decision — a mounted volume, a replicated directory — so it is
   * configuration, read once at boot like everything else, and never a
   * `process.env` lookup scattered through the code that writes to it.
   */
  it("takes the document store root from the environment", () => {
    const config = cargarConfiguracion({
      ...entornoValido(),
      ALMACEN_DOCUMENTOS_RUTA: "/srv/contratos/documentos",
    });

    expect(config.rutaAlmacenDeDocumentos).toBe("/srv/contratos/documentos");
  });

  it("refuses an empty document store root instead of writing to the cwd", () => {
    expect(() =>
      cargarConfiguracion({ ...entornoValido(), ALMACEN_DOCUMENTOS_RUTA: "  " }),
    ).toThrow(/ALMACEN_DOCUMENTOS_RUTA/);
  });

  it("coerces the numeric variables out of their string form", () => {
    const config = cargarConfiguracion({
      ...entornoValido(),
      PORT: "8080",
      JWT_ACCESO_MINUTOS: "5",
      JWT_REFRESH_DIAS: "7",
      LOGIN_INTENTOS_POR_MINUTO: "3",
      CONFIAR_EN_PROXY: "true",
    });

    expect(config.puerto).toBe(8080);
    expect(config.jwt.minutosDeAcceso).toBe(5);
    expect(config.jwt.diasDeRefresco).toBe(7);
    expect(config.loginIntentosPorMinuto).toBe(3);
    expect(config.confiarEnProxy).toBe(true);
  });

  // The whole point of validating at boot: the process must die on the ground,
  // not in front of a technician holding a tablet at a customer's house.
  it("crashes when JWT_SECRET is missing — there is no default secret", () => {
    const { JWT_SECRET: _omitido, ...sinSecreto } = entornoValido();

    expect(() => cargarConfiguracion(sinSecreto)).toThrow(ErrorDeConfiguracion);
    expect(() => cargarConfiguracion(sinSecreto)).toThrow(/JWT_SECRET/);
  });

  it("rejects a JWT_SECRET short enough to be guessed", () => {
    expect(() =>
      cargarConfiguracion({ ...entornoValido(), JWT_SECRET: "corto" }),
    ).toThrow(/JWT_SECRET/);
  });

  it("crashes when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _omitido, ...sinBase } = entornoValido();

    expect(() => cargarConfiguracion(sinBase)).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a Postgres URL", () => {
    expect(() =>
      cargarConfiguracion({
        ...entornoValido(),
        DATABASE_URL: "mysql://root@localhost/contratos",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a port that is not a valid TCP port", () => {
    expect(() =>
      cargarConfiguracion({ ...entornoValido(), PORT: "70000" }),
    ).toThrow(/PORT/);
    expect(() =>
      cargarConfiguracion({ ...entornoValido(), PORT: "no-es-un-numero" }),
    ).toThrow(/PORT/);
  });

  it("reports every problem at once, so one boot fixes the whole file", () => {
    const error = (() => {
      try {
        cargarConfiguracion({ NODE_ENV: "production" });
        return null;
      } catch (e) {
        return e as ErrorDeConfiguracion;
      }
    })();

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/DATABASE_URL/);
    expect(error?.message).toMatch(/JWT_SECRET/);
  });

  it("refuses an access token lifetime long enough to outlive a revocation", () => {
    expect(() =>
      cargarConfiguracion({ ...entornoValido(), JWT_ACCESO_MINUTOS: "1440" }),
    ).toThrow(/JWT_ACCESO_MINUTOS/);
  });
});

describe("describirConfiguracion", () => {
  it("never prints the JWT secret", () => {
    const secreto = "s3cr3t0-de-produccion-larguisimo-abcdef";
    const linea = describirConfiguracion(
      cargarConfiguracion({ ...entornoValido(), JWT_SECRET: secreto }),
    );

    expect(linea).not.toContain(secreto);
    expect(linea).toContain("puerto");
  });

  it("never prints the database password", () => {
    const linea = describirConfiguracion(
      cargarConfiguracion({
        ...entornoValido(),
        DATABASE_URL: "postgresql://contratos:una-clave-secreta@db:5432/contratos",
      }),
    );

    expect(linea).not.toContain("una-clave-secreta");
    expect(linea).toContain("db:5432");
  });
});
