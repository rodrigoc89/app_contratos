import { describe, expect, it } from "vitest";

import { FirmanteComodante } from "../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../shared/domain/FechaCalendario";
import {
  PROVISIONAL_SIGNATORY_VERSION,
  type SeedContent,
} from "./seedContent";
import {
  seedDatabase,
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
