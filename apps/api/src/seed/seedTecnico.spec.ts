import { describe, expect, it } from "vitest";

import { HasherFalso } from "../identidad/application/dobles.testing";
import type { Usuario } from "../identidad/domain/Usuario";
import { PlantillaContrato } from "../plantillas/domain/PlantillaContrato";
import { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import { FechaCalendario } from "../shared/domain/FechaCalendario";
import type { AdminSeedStore, SeedDatabaseInput } from "./seedDatabase";
import { describeSeedReport, seedDatabase } from "./seedDatabase";

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

const CONTRASENA = "una-contrasena-elegida-por-el-tecnico";

type EntradaConTecnico = Omit<SeedDatabaseInput, "tecnico"> & {
  tecnico: Omit<NonNullable<SeedDatabaseInput["tecnico"]>, "usuarios"> & {
    usuarios: UsuariosFalsos;
  };
};

function entrada(
  contrasena: string | undefined,
  usuarios = new UsuariosFalsos(),
): EntradaConTecnico {
  return {
    content: {
      plantilla: PlantillaContrato.crear({
        id: "plantilla-contrato-v1",
        version: "v1",
        condicionesGeneralesHtml: "<p>condiciones</p>",
        comodatoHtml: "<p>comodato</p>",
        vigenteDesde: FechaCalendario.desdeIso("2026-08-01"),
      }),
      firmante: FirmanteComodante.crear({
        id: "firmante-v1",
        version: "v1",
        nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
        dni: "27.582.030",
        imagenFirmaPng: "data:image/png;base64,iVBORw0KGgo=",
      }),
    },
    templates: {
      async buscarPorVersion() {
        return null;
      },
      async publicar() {},
    },
    signatories: {
      async buscarPorVersion() {
        return null;
      },
      async instalarComoActivo() {},
    },
    nodeEnv: "development",
    tecnico: {
      id: "usuario-tecnico",
      nombreUsuario: "tecnico",
      nombreCompleto: "Técnico de Campo",
      contrasena,
      usuarios,
      hasher: new HasherFalso(),
    },
  };
}

describe("seedDatabase — the field técnico", () => {
  it("creates the técnico with the password the operator supplied, and rol tecnico — never admin", async () => {
    const partes = entrada(CONTRASENA);

    const reporte = await seedDatabase(partes);

    expect(reporte.tecnico).toEqual({
      nombreUsuario: "tecnico",
      action: "created",
    });
    expect(partes.tecnico.usuarios.guardados).toHaveLength(1);
    expect(partes.tecnico.usuarios.guardados[0]?.rol).toBe("tecnico");
    expect(partes.tecnico.usuarios.guardados[0]?.activo).toBe(true);
  });

  it("stores the password as a hash, never as itself", async () => {
    const partes = entrada(CONTRASENA);

    await seedDatabase(partes);

    const guardado = partes.tecnico.usuarios.guardados[0];
    expect(guardado?.hashDeContrasena).not.toBe(CONTRASENA);
    expect(guardado?.hashDeContrasena).toContain("hash:");
  });

  // Same reasoning as the admin half: a default credential that reaches a
  // customer's tablet is a breach, and it is what lets someone sign a legally
  // binding contract on the company's behalf. So there is no fallback
  // password — the operator supplies one or gets no técnico.
  it("refuses to invent a password: with none supplied it seeds no técnico at all", async () => {
    const partes = entrada(undefined);

    const reporte = await seedDatabase(partes);

    expect(reporte.tecnico?.action).toBe("omitido");
    expect(partes.tecnico.usuarios.guardados).toHaveLength(0);
  });

  it("also refuses a blank password — not just an absent one — and creates no técnico", async () => {
    const partes = entrada("   ");

    const reporte = await seedDatabase(partes);

    expect(reporte.tecnico?.action).toBe("omitido");
    expect(partes.tecnico.usuarios.guardados).toHaveLength(0);
  });

  it("says loudly, and actionably, that the técnico was skipped — and that nobody can sign yet", async () => {
    const reporte = await seedDatabase(entrada(undefined));

    const texto = describeSeedReport(reporte);

    expect(texto).toMatch(/SEED_TECNICO_PASSWORD/);
    expect(texto).toMatch(/ATENCION|ATENCIÓN/);
  });

  it("still seeds the template and the signatory when the técnico is skipped", async () => {
    const reporte = await seedDatabase(entrada(undefined));

    expect(reporte.plantilla.action).toBe("created");
    expect(reporte.firmante.action).toBe("created");
  });

  // Absent is a decision; present-but-weak is a mistake, and silently
  // skipping it would look identical to success in a deploy log.
  it("fails outright on a password too short to be worth having", async () => {
    await expect(seedDatabase(entrada("corta"))).rejects.toThrow(
      /SEED_TECNICO_PASSWORD/,
    );
  });

  it("is idempotent and never resets an existing técnico's password", async () => {
    const usuarios = new UsuariosFalsos();
    await seedDatabase(entrada(CONTRASENA, usuarios));
    const hashOriginal = usuarios.guardados[0]?.hashDeContrasena;

    const segundo = await seedDatabase(
      entrada("otra-contrasena-distinta", usuarios),
    );

    expect(segundo.tecnico?.action).toBe("already-present");
    expect(usuarios.guardados).toHaveLength(1);
    expect(usuarios.guardados[0]?.hashDeContrasena).toBe(hashOriginal);
  });

  it("never prints the password", async () => {
    const reporte = await seedDatabase(entrada(CONTRASENA));

    expect(describeSeedReport(reporte)).not.toContain(CONTRASENA);
    expect(JSON.stringify(reporte)).not.toContain(CONTRASENA);
  });

  it("reports nothing about a técnico when the caller did not ask for one", async () => {
    const { tecnico: _sinTecnico, ...sinPedirlo } = entrada(CONTRASENA);

    const reporte = await seedDatabase(sinPedirlo);

    expect(reporte.tecnico).toBeNull();
    expect(describeSeedReport(reporte)).not.toMatch(/técnico/i);
  });

  it("seeds an admin and a técnico independently in the same run, each keeping its own rol", async () => {
    const usuariosAdmin = new UsuariosFalsos();
    const usuariosTecnico = new UsuariosFalsos();
    const partes = {
      ...entrada(CONTRASENA, usuariosTecnico),
      administrador: {
        id: "usuario-admin",
        nombreUsuario: "admin",
        nombreCompleto: "Administrador",
        contrasena: "una-contrasena-de-administrador",
        usuarios: usuariosAdmin,
        hasher: new HasherFalso(),
      },
    };

    const reporte = await seedDatabase(partes);

    expect(reporte.administrador).toEqual({
      nombreUsuario: "admin",
      action: "created",
    });
    expect(reporte.tecnico).toEqual({
      nombreUsuario: "tecnico",
      action: "created",
    });
    expect(usuariosAdmin.guardados[0]?.rol).toBe("admin");
    expect(usuariosTecnico.guardados[0]?.rol).toBe("tecnico");
  });
});
