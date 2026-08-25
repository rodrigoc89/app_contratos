import { describe, expect, it } from "vitest";

import { HasherFalso } from "../identidad/application/dobles.testing";
import type { Usuario } from "../identidad/domain/Usuario";
import { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../shared/domain/FechaCalendario";
import {
  PROVISIONAL_SIGNATORY_VERSION,
  type SeedContent,
} from "./seedContent";
import {
  seedDatabase,
  type AdminSeedInput,
  type AdminSeedStore,
  type SignatorySeedStore,
  type TemplateSeedStore,
} from "./seedDatabase";

class AlmacenDePlantillasFalso implements TemplateSeedStore {
  readonly publicadas: PlantillaContrato[] = [];

  async buscarPorVersion(version: string): Promise<PlantillaContrato | null> {
    return this.publicadas.find((una) => una.version === version) ?? null;
  }

  async publicar(plantilla: PlantillaContrato): Promise<void> {
    this.publicadas.push(plantilla);
  }
}

class AlmacenDeFirmantesFalso implements SignatorySeedStore {
  readonly instalados: FirmanteComodante[] = [];

  async buscarPorVersion(version: string): Promise<FirmanteComodante | null> {
    return this.instalados.find((uno) => uno.version === version) ?? null;
  }

  async instalarComoActivo(firmante: FirmanteComodante): Promise<void> {
    this.instalados.push(firmante);
  }
}

function contenido(versionFirmante: string): SeedContent {
  return {
    plantilla: PlantillaContrato.crear({
      id: "plantilla-contrato-v1",
      version: "v1",
      condicionesGeneralesHtml: "<p>condiciones</p>",
      comodatoHtml: "<p>comodato</p>",
      vigenteDesde: FechaCalendario.desdeIso("2026-08-01"),
    }),
    firmante: FirmanteComodante.crear({
      id: `firmante-${versionFirmante}`,
      version: versionFirmante,
      nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
      dni: "27.582.030",
      imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
    }),
  };
}

function entrada(
  versionFirmante: string,
  nodeEnv: string | undefined,
): {
  content: SeedContent;
  templates: AlmacenDePlantillasFalso;
  signatories: AlmacenDeFirmantesFalso;
  nodeEnv: string | undefined;
} {
  return {
    content: contenido(versionFirmante),
    templates: new AlmacenDePlantillasFalso(),
    signatories: new AlmacenDeFirmantesFalso(),
    nodeEnv,
  };
}

describe("seedDatabase", () => {
  it("publishes the template version and installs the signatory on an empty database", async () => {
    const partes = entrada(PROVISIONAL_SIGNATORY_VERSION, "development");

    const reporte = await seedDatabase(partes);

    expect(reporte.plantilla).toEqual({ version: "v1", action: "created" });
    expect(reporte.firmante).toEqual({
      version: PROVISIONAL_SIGNATORY_VERSION,
      action: "created",
    });
    expect(partes.templates.publicadas).toHaveLength(1);
    expect(partes.signatories.instalados).toHaveLength(1);
  });

  it("writes nothing on a second run and says so", async () => {
    const partes = entrada(PROVISIONAL_SIGNATORY_VERSION, "development");

    await seedDatabase(partes);
    const segundo = await seedDatabase(partes);

    expect(segundo.plantilla.action).toBe("already-present");
    expect(segundo.firmante.action).toBe("already-present");
    expect(partes.templates.publicadas).toHaveLength(1);
    expect(partes.signatories.instalados).toHaveLength(1);
  });

  it("seeds each half independently when only one of the two is missing", async () => {
    const partes = entrada(PROVISIONAL_SIGNATORY_VERSION, "development");
    await partes.templates.publicar(partes.content.plantilla);

    const reporte = await seedDatabase(partes);

    expect(reporte.plantilla.action).toBe("already-present");
    expect(reporte.firmante.action).toBe("created");
    expect(partes.templates.publicadas).toHaveLength(1);
    expect(partes.signatories.instalados).toHaveLength(1);
  });

  it("refuses to install the provisional test signature in production, and writes nothing at all", async () => {
    const partes = entrada(PROVISIONAL_SIGNATORY_VERSION, "production");

    await expect(seedDatabase(partes)).rejects.toThrow(
      /firma real|NO VALIDA|producción/i,
    );

    // The guard has to fire before anything is written, or a production
    // database ends up with a half-applied seed carrying the fake signature.
    expect(partes.templates.publicadas).toHaveLength(0);
    expect(partes.signatories.instalados).toHaveLength(0);
  });

  it("runs in production once a real signature version has been loaded", async () => {
    const partes = entrada("v1", "production");

    const reporte = await seedDatabase(partes);

    expect(reporte.firmante).toEqual({ version: "v1", action: "created" });
    expect(partes.signatories.instalados).toHaveLength(1);
  });
});

class UsuariosFalsos implements AdminSeedStore {
  readonly guardados: Usuario[] = [];

  async buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    return (
      this.guardados.find((uno) => uno.nombreUsuario === nombreUsuario) ?? null
    );
  }

  async guardar(usuario: Usuario): Promise<void> {
    this.guardados.push(usuario);
  }
}

function cuenta(
  nombreUsuario: string,
  contrasena: string | undefined,
  usuarios: UsuariosFalsos = new UsuariosFalsos(),
): AdminSeedInput {
  return {
    id: `usuario-${nombreUsuario}`,
    nombreUsuario,
    nombreCompleto: nombreUsuario,
    contrasena,
    usuarios,
    hasher: new HasherFalso(),
  };
}

// D3 — the fail-closed seed gate. `seedContent.spec.ts` and the two specs
// above cover the provisional-signature guard; these cover the newer
// guard over the admin/técnico accounts themselves.
describe("seedDatabase — production seed gate over admin/técnico accounts (D3)", () => {
  it("refuses to seed production when the técnico account resolves to omitido", async () => {
    const partes = entrada("v1", "production");

    await expect(
      seedDatabase({ ...partes, tecnico: cuenta("tecnico", undefined) }),
    ).rejects.toThrow(/SEED_TECNICO_PASSWORD/);
  });

  it("refuses to seed production when the administrador account resolves to omitido", async () => {
    const partes = entrada("v1", "production");

    await expect(
      seedDatabase({
        ...partes,
        administrador: cuenta("admin", undefined),
      }),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
  });

  // The two office accounts (oficina, oficina2 — a spare, so a second person
  // does not have to share one login) reach the same fail-closed gate as
  // admin/técnico: `ContratosController`'s dar-de-baja/anular/registrar-
  // restitución endpoints are `@Roles("oficina")`-only, so a production
  // deploy that silently skips both accounts leaves those three operations
  // unreachable exactly like a skipped técnico leaves signing unreachable.
  it("refuses to seed production when the oficina account resolves to omitido", async () => {
    const partes = entrada("v1", "production");

    await expect(
      seedDatabase({ ...partes, oficina: cuenta("oficina", undefined) }),
    ).rejects.toThrow(/SEED_OFICINA_PASSWORD/);
  });

  it("refuses to seed production when the oficina2 account resolves to omitido", async () => {
    const partes = entrada("v1", "production");

    await expect(
      seedDatabase({ ...partes, oficina2: cuenta("oficina2", undefined) }),
    ).rejects.toThrow(/SEED_OFICINA2_PASSWORD/);
  });

  // This is the load-bearing regression guard (design.md D3, tasks.md 4.3):
  // once an account already exists, its password is correctly rotated out
  // of the environment file, and every routine redeploy resolves that
  // account to "already-present" — never "omitido". A gate that fired on
  // anything other than "omitido" would turn every such redeploy into an
  // outage, in the startup path, on a machine where the fix is not obvious.
  it("never blocks a routine production redeploy once the seed accounts already exist", async () => {
    const usuariosAdmin = new UsuariosFalsos();
    const usuariosTecnico = new UsuariosFalsos();
    const usuariosOficina = new UsuariosFalsos();
    const usuariosOficina2 = new UsuariosFalsos();

    // First run (e.g. provisioning), with every password set — creates all
    // four accounts.
    const primeraEjecucion = entrada("v1", "development");
    await seedDatabase({
      ...primeraEjecucion,
      administrador: cuenta(
        "admin",
        "una-contrasena-de-administrador",
        usuariosAdmin,
      ),
      tecnico: cuenta("tecnico", "una-contrasena-de-tecnico", usuariosTecnico),
      oficina: cuenta("oficina", "una-contrasena-de-oficina", usuariosOficina),
      oficina2: cuenta(
        "oficina2",
        "una-contrasena-de-oficina2",
        usuariosOficina2,
      ),
    });

    // Routine redeploy: every password was correctly rotated out of the
    // environment after the accounts already exist, so all four resolve to
    // "already-present". Production must seed cleanly and must not throw.
    const redeploy = entrada("v1", "production");
    const reporte = await seedDatabase({
      ...redeploy,
      administrador: cuenta("admin", undefined, usuariosAdmin),
      tecnico: cuenta("tecnico", undefined, usuariosTecnico),
      oficina: cuenta("oficina", undefined, usuariosOficina),
      oficina2: cuenta("oficina2", undefined, usuariosOficina2),
    });

    expect(reporte.administrador?.action).toBe("already-present");
    expect(reporte.tecnico?.action).toBe("already-present");
    expect(reporte.oficina?.action).toBe("already-present");
    expect(reporte.oficina2?.action).toBe("already-present");
  });
});
