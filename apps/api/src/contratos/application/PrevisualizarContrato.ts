import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import type { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { FechaCalendario as Fecha } from "../../shared/domain/FechaCalendario";
import { DOCUMENTOS_DEL_CONTRATO } from "../../shared/domain/TipoDocumentoFirmado";
import type { TipoDocumentoFirmado } from "../../shared/domain/TipoDocumentoFirmado";
import { FirmaCapturada } from "../domain/FirmaCapturada";
import { Plazo } from "../domain/Plazo";
import { buscarContrato } from "./buscarContrato";
import { ZONA_HORARIA_CONTRATO } from "./FirmarContrato";
import type { ContratoRepository } from "./ports/ContratoRepository";
import type { FirmanteRepository } from "./ports/FirmanteRepository";
import type { PlantillaRepository } from "./ports/PlantillaRepository";
import type { Reloj } from "./ports/Reloj";
import { rellenarPlantilla, valoresDePlantilla } from "./rellenarPlantilla";

export interface ComandoPrevisualizarContrato {
  readonly contratoId: string;
}

export interface DocumentoPrevisualizado {
  readonly documento: TipoDocumentoFirmado;
  readonly html: string;
}

export interface ContratoPrevisualizado {
  readonly contratoId: string;
  readonly plantillaVersion: string;
  readonly plazoMeses: number;
  readonly fechaPrevistaDeFirma: FechaCalendario;
  readonly fechaPrevistaDeVencimiento: FechaCalendario;
  readonly documentos: readonly DocumentoPrevisualizado[];
}

/**
 * A 1×1 fully transparent PNG.
 *
 * Every signature slot in the preview gets this, including the comodante's.
 * The template puts each one straight into `src="…"`, so an empty string would
 * make the browser resolve the page URL as an image and draw a broken icon in
 * the middle of the document the customer is being asked to read.
 */
const PIXEL_TRANSPARENTE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** The blank where the server will stamp `Nº` once the contract is signed. */
const NUMERO_SIN_ASIGNAR = "—";

/**
 * Stand-in signatures, so `valoresDePlantilla` can be reused unchanged.
 *
 * It requires one signature per document — rightly, since it exists to build
 * the *signed* document. The three image values it derives are overwritten
 * below, so nothing from these ever reaches the rendered HTML.
 */
const TRAZO_VACIO = Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 0, t: i }));
const FIRMAS_EN_BLANCO = DOCUMENTOS_DEL_CONTRATO.map((documento) =>
  FirmaCapturada.crear({
    documento,
    imagenPng: PIXEL_TRANSPARENTE,
    trazos: [TRAZO_VACIO],
  }),
);

/**
 * Renders the two documents of a draft, as the customer will read them.
 *
 * This is step 3 of the signing flow (DESIGN.md §6) — the digital equivalent
 * of *"previa lectura y ratificación"* in the closing clause, which the design
 * insists must be a real step rather than a checkbox.
 *
 * **It must agree with the signature that follows it, or it is worse than
 * nothing.** A customer who reads one document and signs another has been
 * shown a decoration. Three things guarantee the agreement, and all three are
 * deliberate:
 *
 * - the template comes from `plantillas.vigente()`, the very call
 *   `FirmarContrato` makes moments later;
 * - the values come from `valoresDePlantilla` and the text is filled by
 *   `rellenarPlantilla`, the same two functions the PDF renderer uses, so a
 *   change to either moves both;
 * - the dates come from the same clock, in the same timezone, through the same
 *   `Plazo.estandarDesde`.
 *
 * What it deliberately does *not* carry is the comodante's signature image.
 * That is a real person's handwriting, and DESIGN.md §4 says it is to be
 * served server-side during PDF generation and never handed to the frontend.
 */
export class PrevisualizarContrato {
  constructor(
    private readonly contratos: ContratoRepository,
    private readonly plantillas: PlantillaRepository,
    private readonly firmantes: FirmanteRepository,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    comando: ComandoPrevisualizarContrato,
  ): Promise<ContratoPrevisualizado> {
    const contrato = await buscarContrato(this.contratos, comando.contratoId);

    // A signed contract already has its own sealed, hashed PDFs. Rendering it
    // again against today's date would produce something that looks official
    // and disagrees with what was signed — download the real document instead.
    if (contrato.estaFirmado) {
      throw new ConflictoDeEstado(
        `El contrato ya está ${contrato.estado}: descargue el documento firmado en lugar de previsualizarlo.`,
      );
    }

    const [plantilla, firmante] = await Promise.all([
      this.plantillas.vigente(),
      this.firmantes.activo(),
    ]);

    const fechaFirma = Fecha.enZona(this.reloj.ahora(), ZONA_HORARIA_CONTRATO);
    const plazo = Plazo.estandarDesde(fechaFirma);

    const valores = {
      ...valoresDePlantilla({
        // Zero is never a real contract number, and it is overwritten on the
        // next line; it exists only because the shared value builder types
        // this field as a number.
        numero: 0,
        fechaFirma,
        plazo,
        comodatario: contrato.comodatario,
        equipos: contrato.equipos,
        firmas: FIRMAS_EN_BLANCO,
        plantilla,
        firmante,
      }),
      numero: NUMERO_SIN_ASIGNAR,
      firmaComodatarioCondiciones: PIXEL_TRANSPARENTE,
      firmaComodatarioComodato: PIXEL_TRANSPARENTE,
      firmaComodante: PIXEL_TRANSPARENTE,
    };

    return {
      contratoId: contrato.id,
      plantillaVersion: plantilla.version,
      plazoMeses: plazo.meses,
      fechaPrevistaDeFirma: fechaFirma,
      fechaPrevistaDeVencimiento: plazo.fechaVencimiento,
      documentos: DOCUMENTOS_DEL_CONTRATO.map((documento) => ({
        documento,
        html: rellenarPlantilla(plantilla.contenidoDe(documento), valores),
      })),
    };
  }
}
