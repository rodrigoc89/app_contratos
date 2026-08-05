import { FirmanteComodante } from "../../firmantes/domain/FirmanteComodante";
import { PlantillaContrato } from "../../plantillas/domain/PlantillaContrato";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { Comodatario } from "../domain/Comodatario";
import { ContextoDeFirma } from "../domain/ContextoDeFirma";
import { Contrato } from "../domain/Contrato";
import type { DocumentoContrato } from "../domain/Contrato";
import { Equipos } from "../domain/Equipos";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import type { AlmacenDeDocumentos } from "./ports/AlmacenDeDocumentos";
import type { ContratoRepository } from "./ports/ContratoRepository";
import type { IdentificadorUnico } from "./ports/IdentificadorUnico";
import type {
  EntradaGeneracion,
  GeneradorDeDocumentos,
} from "./ports/GeneradorDeDocumentos";

/**
 * Test doubles and fixtures shared by the contract use-case specs.
 *
 * Deliberately not a `.spec.ts` file, so vitest treats it as a module rather
 * than as a suite. It carries no assertions: every double here is a plain
 * in-memory implementation of a port, which is the whole point of the ports
 * existing — the use cases stay testable with no database, no browser and no
 * filesystem, and `pnpm test` stays free of all three.
 */

export const ID_CONTRATO = "11111111-1111-4111-8111-111111111111";

/** 21:30 in Argentina is already the next day in UTC — kept on purpose. */
export const INSTANTE_FIRMA = new Date("2026-08-04T21:30:00-03:00");

export const PLANTILLA = PlantillaContrato.crear({
  id: "plantilla-2026-01",
  version: "2026-01",
  condicionesGeneralesHtml:
    "<h1>CONDICIONES GENERALES DE USO</h1><p>Contrato Nº {{numero}} de {{comodatarioNombre}}, a los {{firmaDia}} días del mes de {{firmaMes}} de 20{{firmaAnio}}.</p><img src=\"{{firmaComodatarioCondiciones}}\" />",
  comodatoHtml:
    "<h1>CONTRATO DE COMODATO</h1><p>{{comodatarioNombre}}, DNI {{comodatarioDni}}, {{comodatarioDomicilio}}, {{comodatarioCiudad}}, {{comodatarioProvincia}}.</p><p>Antena {{antenaModelo}} MAC {{antenaMac}}, POE {{poe}}, caño {{canoMetros}} m.</p><p>Plazo {{plazoMeses}} meses desde {{fechaInicio}} hasta {{fechaVencimiento}}.</p><p>{{comodanteNombre}} DNI {{comodanteDni}} — {{firmaDia}}/{{firmaMes}}/{{firmaAnioCorto}}</p><img src=\"{{firmaComodante}}\" /><img src=\"{{firmaComodatarioComodato}}\" />",
  vigenteDesde: FechaCalendario.desdeIso("2026-01-01"),
});

/** A real handwritten signature stands in as a data URI; never a URL. */
export const FIRMA_COMODANTE_PNG =
  "data:image/png;base64,RklSTUFERUxDT01PREFOVEU=";

export const FIRMANTE = FirmanteComodante.crear({
  id: "firmante-sieira-v1",
  version: "v1",
  nombreCompleto: "SIEIRA GUILLERMO FEDERICO",
  dni: "27.582.030",
  imagenFirmaPng: FIRMA_COMODANTE_PNG,
});

export const trazoDePrueba = (puntos = 14): Array<{ x: number; y: number; t: number }> =>
  Array.from({ length: puntos }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

export const firmaDe = (documento: TipoDocumentoFirmado): FirmaCapturada =>
  FirmaCapturada.crear({
    documento,
    imagenPng: `data:image/png;base64,RklSTUFERUxDTElFTlRF${documento === "comodato" ? "Qw==" : "Qg=="}`,
    trazos: [trazoDePrueba()],
  });

export const contextoDePrueba = (): ContextoDeFirma =>
  ContextoDeFirma.crear({
    tecnicoId: "usuario-tecnico1",
    dispositivoId: "tablet-lenovo-03",
    capturadoEn: INSTANTE_FIRMA,
  });

export const datosComodatario = () => ({
  nombreCompleto: "Juan Carlos Pérez",
  dni: "30.123.456",
  domicilioCalle: "Av. Belgrano 1250",
  ciudad: "La Banda",
  whatsapp: "3854123456",
});

export const datosEquipos = () => ({
  antenaModelo: "LiteBeam 5AC Gen2",
  antenaMac: "ac8ba9123456",
  poe: true,
  canoMetros: 6,
});

export const nuevoBorrador = (id = ID_CONTRATO): Contrato =>
  Contrato.crearBorrador({
    id,
    comodatario: Comodatario.crear(datosComodatario()),
    equipos: Equipos.crear(datosEquipos()),
  });

export class ContratosEnMemoria implements ContratoRepository {
  readonly guardados: Contrato[] = [];
  private proximoNumero = 1042;
  private readonly almacenados = new Map<string, Contrato>();

  agregar(contrato: Contrato): void {
    this.almacenados.set(contrato.id, contrato);
  }

  porId(id: string): Promise<Contrato | null> {
    return Promise.resolve(this.almacenados.get(id) ?? null);
  }

  guardar(contrato: Contrato): Promise<void> {
    this.guardados.push(contrato);
    this.almacenados.set(contrato.id, contrato);
    return Promise.resolve();
  }

  siguienteNumero(): Promise<number> {
    return Promise.resolve(this.proximoNumero++);
  }
}

export class IdentificadoresFijos implements IdentificadorUnico {
  private siguiente = 0;

  constructor(private readonly valores: readonly string[] = [ID_CONTRATO]) {}

  nuevo(): string {
    const valor = this.valores[this.siguiente % this.valores.length];
    this.siguiente += 1;
    return valor ?? ID_CONTRATO;
  }
}

export class AlmacenEnMemoria implements AlmacenDeDocumentos {
  readonly guardados = new Map<string, Uint8Array>();

  guardar(ruta: string, contenido: Uint8Array): Promise<void> {
    this.guardados.set(ruta, contenido);
    return Promise.resolve();
  }

  leer(ruta: string): Promise<Uint8Array> {
    const contenido = this.guardados.get(ruta);
    if (contenido === undefined) {
      return Promise.reject(
        new Error(`No hay ningún documento guardado en "${ruta}".`),
      );
    }
    return Promise.resolve(contenido);
  }
}

/**
 * Renders nothing and writes the "PDF" bytes into whatever store it was
 * given, so a download test can read back exactly what a signing test wrote.
 */
export class GeneradorFalso implements GeneradorDeDocumentos {
  recibido: EntradaGeneracion | null = null;
  fallar = false;

  constructor(private readonly almacen?: AlmacenDeDocumentos) {}

  async generar(
    entrada: EntradaGeneracion,
  ): Promise<readonly DocumentoContrato[]> {
    if (this.fallar) {
      throw new Error("Chromium se quedó sin memoria");
    }
    this.recibido = entrada;

    const documentos: DocumentoContrato[] = [
      {
        documento: "condiciones_generales",
        ruta: `${entrada.numero}/condiciones_generales.pdf`,
        sha256: "a".repeat(64),
      },
      {
        documento: "comodato",
        ruta: `${entrada.numero}/comodato.pdf`,
        sha256: "b".repeat(64),
      },
    ];

    for (const documento of documentos) {
      await this.almacen?.guardar(
        documento.ruta,
        new TextEncoder().encode(`%PDF-1.7 ${documento.documento}`),
      );
    }

    return documentos;
  }
}

export const relojFijo = (instante = INSTANTE_FIRMA) => ({
  ahora: (): Date => instante,
});

export const plantillasFijas = () => ({
  vigente: (): Promise<PlantillaContrato> => Promise.resolve(PLANTILLA),
});

export const firmantesFijos = () => ({
  activo: (): Promise<FirmanteComodante> => Promise.resolve(FIRMANTE),
});
