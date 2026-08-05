import { describe, expect, it } from "vitest";

import { FirmanteComodante } from "../../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../../plantillas/domain/PlantillaContrato";
import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "../domain/Comodatario";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import { Plazo } from "../domain/Plazo";
import type { EntradaGeneracion } from "./ports/GeneradorDeDocumentos";
import { rellenarPlantilla, valoresDePlantilla } from "./rellenarPlantilla";

const FIRMA = FechaCalendario.desdeIso("2026-08-04");

const firmaDe = (documento: TipoDocumentoFirmado, imagen: string) =>
  FirmaCapturada.crear({
    documento,
    imagenPng: imagen,
    trazos: [Array.from({ length: 14 }, (_, i) => ({ x: i, y: i, t: i * 16 }))],
  });

const entrada = (
  sobreescribir: Partial<EntradaGeneracion> = {},
): EntradaGeneracion => ({
  numero: 1042,
  fechaFirma: FIRMA,
  plazo: Plazo.estandarDesde(FIRMA),
  comodatario: Comodatario.crear({
    nombreCompleto: "Juan Carlos Pérez",
    dni: "30.123.456",
    domicilioCalle: "Av. Belgrano 1250",
    ciudad: "La Banda",
    whatsapp: "3854123456",
  }),
  equipos: Equipos.crear({
    antenaModelo: "LiteBeam 5AC Gen2",
    antenaMac: "ac8ba9123456",
    poe: true,
    canoMetros: 6,
  }),
  firmas: [
    firmaDe("condiciones_generales", "data:image/png;base64,CONDICIONES"),
    firmaDe("comodato", "data:image/png;base64,COMODATO"),
  ],
  plantilla: PlantillaContrato.crear({
    id: "plantilla-2026-01",
    version: "2026-01",
    condicionesGeneralesHtml: "<h1>condiciones</h1>",
    comodatoHtml: "<h1>comodato</h1>",
    vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
  }),
  firmante: FirmanteComodante.crear({
    id: "firmante-sieira-v1",
    version: "v1",
    nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
    dni: "27.582.030",
    imagenFirmaPng: "data:image/png;base64,COMODANTE",
  }),
  ...sobreescribir,
});

describe("valoresDePlantilla", () => {
  it("exposes the contract number the server assigned", () => {
    expect(valoresDePlantilla(entrada())["numero"]).toBe("1042");
  });

  it("exposes the customer as the contract prints them", () => {
    const valores = valoresDePlantilla(entrada());

    expect(valores["comodatarioNombre"]).toBe("Juan Carlos Pérez");
    expect(valores["comodatarioDni"]).toBe("30.123.456");
    expect(valores["comodatarioDomicilio"]).toBe("Av. Belgrano 1250");
    expect(valores["comodatarioCiudad"]).toBe("La Banda");
    expect(valores["comodatarioProvincia"]).toBe("Santiago del Estero");
  });

  it("exposes the comodante, whose data lives in the system, not the form", () => {
    const valores = valoresDePlantilla(entrada());

    expect(valores["comodanteNombre"]).toBe("SIEIRA GUILLERMO FEDERICO");
    expect(valores["comodanteDni"]).toBe("27.582.030");
  });

  it("exposes the equipment of clause PRIMERA", () => {
    const valores = valoresDePlantilla(entrada());

    expect(valores["antenaModelo"]).toBe("LiteBeam 5AC Gen2");
    expect(valores["antenaMac"]).toBe("AC:8B:A9:12:34:56");
    expect(valores["poe"]).toBe("SI");
    expect(valores["canoMetros"]).toBe("6");
  });

  it("prints PoE as NO when none was installed", () => {
    const sinPoe = entrada({
      equipos: Equipos.crear({
        antenaModelo: "LiteBeam",
        antenaMac: "ac8ba9123456",
        poe: false,
        canoMetros: 0,
      }),
    });

    expect(valoresDePlantilla(sinPoe)["poe"]).toBe("NO");
  });

  it("exposes the term of clause SEGUNDA, with the expiry already derived", () => {
    const valores = valoresDePlantilla(entrada());

    expect(valores["plazoMeses"]).toBe("120");
    expect(valores["fechaInicio"]).toBe("04/08/2026");
    expect(valores["fechaVencimiento"]).toBe("04/08/2036");
  });

  it("exposes the closing clause's day, month name and year", () => {
    // "a los ___ días del mes de ___ del año 20__"
    const valores = valoresDePlantilla(entrada());

    expect(valores["firmaDia"]).toBe("4");
    expect(valores["firmaMes"]).toBe("agosto");
    expect(valores["firmaAnio"]).toBe("2026");
    expect(valores["firmaAnioCorto"]).toBe("26");
  });

  it("exposes each signature image against its own document", () => {
    const valores = valoresDePlantilla(entrada());

    expect(valores["firmaComodatarioCondiciones"]).toBe(
      "data:image/png;base64,CONDICIONES",
    );
    expect(valores["firmaComodatarioComodato"]).toBe(
      "data:image/png;base64,COMODATO",
    );
    expect(valores["firmaComodante"]).toBe("data:image/png;base64,COMODANTE");
  });
});

describe("rellenarPlantilla", () => {
  const valores = { nombre: "Juan", ciudad: "La Banda" };

  it("substitutes a placeholder", () => {
    expect(rellenarPlantilla("<p>{{nombre}}</p>", valores)).toBe("<p>Juan</p>");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(rellenarPlantilla("<p>{{  nombre  }}</p>", valores)).toBe(
      "<p>Juan</p>",
    );
  });

  it("substitutes the same placeholder everywhere it appears", () => {
    expect(rellenarPlantilla("{{nombre}} y {{nombre}}", valores)).toBe(
      "Juan y Juan",
    );
  });

  it("leaves the rest of the legal text untouched", () => {
    const html = "<p>PRIMERA - OBJETO: cede a {{nombre}} de {{ciudad}}.</p>";

    expect(rellenarPlantilla(html, valores)).toBe(
      "<p>PRIMERA - OBJETO: cede a Juan de La Banda.</p>",
    );
  });

  describe("escaping", () => {
    it("escapes markup in customer data", () => {
      const html = rellenarPlantilla("<p>{{nombre}}</p>", {
        nombre: "<script>alert(1)</script>",
      });

      expect(html).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    });

    it("escapes ampersands, which appear in real street names", () => {
      expect(
        rellenarPlantilla("<p>{{ciudad}}</p>", { ciudad: "Ruta 9 & 34" }),
      ).toBe("<p>Ruta 9 &amp; 34</p>");
    });

    it("escapes quotes, so a value cannot break out of an attribute", () => {
      const html = rellenarPlantilla('<img src="{{firma}}">', {
        firma: '" onerror="alert(1)',
      });

      expect(html).toBe('<img src="&quot; onerror=&quot;alert(1)">');
    });

    it("does not double-escape an ampersand that was already in the template", () => {
      expect(rellenarPlantilla("<p>A &amp; B: {{nombre}}</p>", valores)).toBe(
        "<p>A &amp; B: Juan</p>",
      );
    });
  });

  describe("refuses to print an incomplete contract", () => {
    it("rejects a template asking for a field that does not exist", () => {
      expect(() =>
        rellenarPlantilla("<p>{{noExiste}}</p>", valores),
      ).toThrow(DomainError);
    });

    it("names the offending field, so the template can be fixed", () => {
      expect(() => rellenarPlantilla("<p>{{noExiste}}</p>", valores)).toThrow(
        /noExiste/,
      );
    });

    it("explains this is about the template, not about customer input", () => {
      expect(() => rellenarPlantilla("<p>{{noExiste}}</p>", valores)).toThrow(
        /plantilla/i,
      );
    });

    it("reports every unknown field at once, not one per attempt", () => {
      expect(() =>
        rellenarPlantilla("{{unoMal}} {{nombre}} {{otroMal}}", valores),
      ).toThrow(/unoMal.*otroMal|otroMal.*unoMal/s);
    });
  });

  describe("a substituted value is never re-read as a placeholder", () => {
    it("treats braces inside customer data as ordinary text", () => {
      // Absurd, but a name is free text and the renderer must not choke.
      const html = rellenarPlantilla("<p>{{nombre}}</p>", {
        ...valores,
        nombre: "Juan {{comodanteDni}}",
      });

      expect(html).toBe("<p>Juan {{comodanteDni}}</p>");
    });
  });

  describe("the whole contract", () => {
    it("renders the real clauses with real values", () => {
      const html = rellenarPlantilla(
        [
          "<p>Nº {{numero}}</p>",
          "<p>el o la SR/A {{comodatarioNombre}} DNI N° {{comodatarioDni}}",
          " con domicilio en calle {{comodatarioDomicilio}}",
          " Ciudad {{comodatarioCiudad}}, de la provincia de {{comodatarioProvincia}}</p>",
          "<p>ANTENA {{antenaModelo}} MAC: {{antenaMac}}</p>",
          "<p>POE {{poe}} — CAÑO METROS {{canoMetros}}</p>",
          "<p>duración de {{plazoMeses}} meses a partir del {{fechaInicio}}",
          " ósea que vencerá el {{fechaVencimiento}}</p>",
          "<p>a los {{firmaDia}} días del mes de {{firmaMes}} del año 20{{firmaAnioCorto}}</p>",
          '<img src="{{firmaComodante}}"><img src="{{firmaComodatarioComodato}}">',
        ].join(""),
        valoresDePlantilla(entrada()),
      );

      expect(html).toContain("Nº 1042");
      expect(html).toContain("SR/A Juan Carlos Pérez DNI N° 30.123.456");
      expect(html).toContain("provincia de Santiago del Estero");
      expect(html).toContain("MAC: AC:8B:A9:12:34:56");
      expect(html).toContain("POE SI");
      expect(html).toContain("120 meses a partir del 04/08/2026");
      expect(html).toContain("vencerá el 04/08/2036");
      expect(html).toContain("a los 4 días del mes de agosto del año 2026");
      expect(html).not.toContain("{{");
    });
  });
});
