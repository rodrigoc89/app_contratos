import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The complete environment-variable contract: the 9 keys validated by
 * `EsquemaConfiguracion` (`./configuracion.ts`) plus the 6 raw `SEED_*`
 * variables `prisma/seed.ts` reads straight from `process.env`, outside the
 * schema — see that file's own comment on why (a signing key with a
 * fallback is a signing key an attacker already has).
 *
 * This is a hand-written list, and on its own it would be the weakest kind
 * of guard: add a tenth key to `EsquemaConfiguracion` and every assertion
 * below keeps passing while `.env.example` never documents it — a test that
 * goes quiet instead of failing. The last spec in this file is what makes it
 * trustworthy: it re-derives both halves from the source files and fails
 * when this list drifts from them (`deployment-configuration` spec.md's
 * "`.env.example` completeness" requirement).
 */
const VARIABLES_ESPERADAS = [
  // EsquemaConfiguracion — apps/api/src/config/configuracion.ts
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_ACCESO_MINUTOS",
  "JWT_REFRESH_DIAS",
  "LOGIN_INTENTOS_POR_MINUTO",
  "CONFIAR_EN_PROXY",
  "ALMACEN_DOCUMENTOS_RUTA",
  // Raw process.env.SEED_* reads — apps/api/prisma/seed.ts
  "SEED_ADMIN_USERNAME",
  "SEED_ADMIN_NOMBRE",
  "SEED_ADMIN_PASSWORD",
  "SEED_TECNICO_USERNAME",
  "SEED_TECNICO_NOMBRE",
  "SEED_TECNICO_PASSWORD",
] as const;

const RUTA_ENV_EXAMPLE = join(import.meta.dirname, "../../../../.env.example");

/**
 * `.env.example` is read here twice, under two different patterns, because
 * "documented" and "active" are not the same claim:
 *
 * - A key with no safe default (e.g. `SEED_ADMIN_PASSWORD`) is deliberately
 *   left commented out — the app treats "unset" as "skip this account",
 *   which is only correct outside production. Commenting it is how the file
 *   already documents `JWT_SECRET`-style secrets that must never ship a
 *   fallback (see `configuracion.ts`'s own reasoning on that key). This
 *   still counts as "documented".
 * - A stray *uncommented* key is different: it would actually load into
 *   `process.env` for whoever copies this file to `.env`, so the contract
 *   this test enforces is: never an active key the app does not read (e.g.
 *   the `POSTGRES_*` docker-compose overrides already in this file stay
 *   commented on purpose, and are not part of the 15-variable contract).
 */
const PATRON_CLAVE_ACTIVA = /^([A-Z][A-Z0-9_]*)=/;
const PATRON_CLAVE_DOCUMENTADA = /^#?\s*([A-Z][A-Z0-9_]*)=/;

function extraerClaves(contenido: string, patron: RegExp): string[] {
  return contenido
    .split("\n")
    .map((linea) => patron.exec(linea)?.[1])
    .filter((clave): clave is string => Boolean(clave));
}

describe(".env.example", () => {
  it("documents every variable the app or the seed script reads", () => {
    const contenido = readFileSync(RUTA_ENV_EXAMPLE, "utf-8");
    const clavesDocumentadas = extraerClaves(contenido, PATRON_CLAVE_DOCUMENTADA);

    for (const variable of VARIABLES_ESPERADAS) {
      expect(clavesDocumentadas).toContain(variable);
    }
  });

  it("never activates an environment variable outside the documented contract", () => {
    const contenido = readFileSync(RUTA_ENV_EXAMPLE, "utf-8");
    const clavesActivas = extraerClaves(contenido, PATRON_CLAVE_ACTIVA);

    const clavesInesperadas = clavesActivas.filter(
      (clave) => !(VARIABLES_ESPERADAS as readonly string[]).includes(clave),
    );
    expect(clavesInesperadas).toEqual([]);
  });

  it("stays in sync with the source files it claims to mirror", () => {
    // The guard on the guard. Without it, VARIABLES_ESPERADAS is a snapshot
    // of what the app read on the day it was written, asserted against
    // `.env.example` forever after.
    const rutaConfiguracion = join(import.meta.dirname, "configuracion.ts");
    const rutaSeed = join(import.meta.dirname, "../../prisma/seed.ts");

    const configuracion = readFileSync(rutaConfiguracion, "utf-8");
    const esquema = /const EsquemaConfiguracion = z\.object\(\{([\s\S]*?)^\}\);/m.exec(
      configuracion,
    )?.[1];
    expect(esquema, "EsquemaConfiguracion no encontrado en configuracion.ts").toBeDefined();

    const clavesDelEsquema = [
      ...(esquema ?? "").matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm),
    ].map((coincidencia) => coincidencia[1]);

    const clavesDelSeed = [
      ...new Set(
        [...readFileSync(rutaSeed, "utf-8").matchAll(/process\.env\.(SEED_[A-Z0-9_]+)/g)].map(
          (coincidencia) => coincidencia[1],
        ),
      ),
    ];

    expect([...clavesDelEsquema, ...clavesDelSeed].sort()).toEqual(
      [...VARIABLES_ESPERADAS].sort(),
    );
  });

  it("documents CONFIAR_EN_PROXY=true as the required production value, with the rate-limiter-collapse consequence stated", () => {
    const contenido = readFileSync(RUTA_ENV_EXAMPLE, "utf-8");

    // A text-content check, not an active-assignment check: this file's one
    // *active* CONFIAR_EN_PROXY line stays the local-dev default (`false`).
    // Requiring a second, uncommented `CONFIAR_EN_PROXY=true` line would
    // create two live assignments of the same key in one template — the
    // production value belongs in prose, the way `JWT_SECRET`'s "generate
    // your own" guidance already does.
    expect(contenido).toMatch(/CONFIAR_EN_PROXY=true/);
    // The specific consequence the deployment-configuration spec requires,
    // not just any mention of "rate limit": leaving it false behind nginx
    // collapses every client to 127.0.0.1 as far as the limiter can tell.
    expect(contenido).toMatch(/127\.0\.0\.1/);
    expect(contenido.toLowerCase()).toMatch(/rate.?limit/);
  });
});
