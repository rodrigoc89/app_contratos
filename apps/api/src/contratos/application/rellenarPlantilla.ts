import { DomainError } from "../../shared/domain/DomainError";
import type { TipoDocumentoFirmado } from "../domain/FirmaCapturada";
import type { EntradaGeneracion } from "./ports/GeneradorDeDocumentos";

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes a value being placed into the contract's HTML.
 *
 * Customer data is free text: a street name with an ampersand, a surname with
 * an apostrophe. Unescaped, the best case is a broken render and the worst is
 * markup injected into a legal document.
 */
function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter] ?? caracter);
}

/**
 * Fills a versioned contract template with the values of one contract.
 *
 * Substitution happens in a single pass over the original template, and the
 * placeholder names are checked against the available values *before* that
 * pass. Two consequences, both deliberate:
 *
 * - A template asking for a field that does not exist fails loudly instead of
 *   printing `{{comodatarioDni}}` inside the legal text of a contract someone
 *   is about to sign.
 * - A value that happens to contain braces is never re-read as a placeholder,
 *   because the replacement output is not scanned again.
 */
export function rellenarPlantilla(
  html: string,
  valores: Record<string, string>,
): string {
  const desconocidos = new Set<string>();

  for (const coincidencia of html.matchAll(PLACEHOLDER)) {
    const nombre = coincidencia[1];
    if (nombre !== undefined && !(nombre in valores)) {
      desconocidos.add(nombre);
    }
  }

  if (desconocidos.size > 0) {
    throw new DomainError(
      `La plantilla del contrato pide campos que no existen: ${[...desconocidos].join(", ")}. Hay que corregir la plantilla antes de emitir contratos con ella.`,
    );
  }

  return html.replace(PLACEHOLDER, (_coincidencia, nombre: string) =>
    escaparHtml(valores[nombre] ?? ""),
  );
}

/**
 * Every value the contract template may ask for, keyed by placeholder name.
 *
 * This is the contract between the legal text and the software: whoever edits
 * a template version may use these names and no others.
 */
export function valoresDePlantilla(
  entrada: EntradaGeneracion,
): Record<string, string> {
  const { comodatario, equipos, plazo, fechaFirma, firmante } = entrada;

  return {
    numero: String(entrada.numero),

    comodatarioNombre: comodatario.nombreCompleto,
    comodatarioDni: comodatario.dni.formateado,
    comodatarioDomicilio: comodatario.domicilioCalle,
    comodatarioCiudad: comodatario.ciudad,
    comodatarioProvincia: comodatario.provincia,

    comodanteNombre: firmante.nombreCompleto,
    comodanteDni: firmante.dni.formateado,

    // Clause PRIMERA
    antenaModelo: equipos.antenaModelo,
    antenaMac: equipos.antenaMac.valor,
    poe: equipos.poeImpreso,
    canoMetros: equipos.canoMetros.valor.toString(),

    // Clause SEGUNDA — the expiry is derived, never typed.
    plazoMeses: String(plazo.meses),
    fechaInicio: plazo.fechaInicio.formateado,
    fechaVencimiento: plazo.fechaVencimiento.formateado,

    // "a los ___ días del mes de ___ del año 20__"
    firmaDia: String(fechaFirma.dia),
    firmaMes: fechaFirma.nombreMes,
    firmaAnio: String(fechaFirma.anio),
    firmaAnioCorto: String(fechaFirma.anio).slice(-2),

    firmaComodatarioCondiciones: imagenDeFirma(entrada, "condiciones_generales"),
    firmaComodatarioComodato: imagenDeFirma(entrada, "comodato"),
    firmaComodante: firmante.imagenFirmaPng,
  };
}

function imagenDeFirma(
  entrada: EntradaGeneracion,
  documento: TipoDocumentoFirmado,
): string {
  const firma = entrada.firmas.find((una) => una.documento === documento);

  if (firma === undefined) {
    throw new DomainError(
      `No se puede armar el documento: falta la firma de ${documento}.`,
    );
  }

  return firma.imagenPng;
}
