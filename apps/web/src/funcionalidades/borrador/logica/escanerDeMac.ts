import { normalizarDireccionMac } from "@contratos/esquemas";

/**
 * DESIGN.md D6 — the DOM-free half of MAC camera scanning.
 *
 * **Extraction is a client concern; validation is not duplicated here.**
 * `macDesdeCodigoEscaneado` only finds a MAC-shaped substring inside
 * whatever a barcode/QR decoded to (a bare hex run, a separated one, or one
 * embedded in a URL/serial) and normalises it. Whether the result is a
 * *correct* MAC is `EsquemaDireccionMac`'s job (`@contratos/esquemas`) — the
 * single definition stays single, per D6.
 */

const CON_SEPARADORES = /(?:[0-9A-Fa-f]{2}[:\-. ]){5}[0-9A-Fa-f]{2}/;
const SIN_SEPARADORES = /[0-9A-Fa-f]{12}/;

function conDosPuntos(hex: string): string {
  const pares: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    pares.push(hex.slice(i, i + 2));
  }
  return pares.join(":");
}

/**
 * Finds a MAC-shaped substring anywhere in `crudo` and returns it
 * normalised as `AA:BB:CC:DD:EE:FF`. Returns `null` only when nothing
 * resembling 12 hex digits is present at all — a decode that merely fails
 * format validation still returns a value here (DESIGN.md D6: "Decode that
 * fails validation | Written into the field anyway").
 */
export function macDesdeCodigoEscaneado(crudo: string): string | null {
  const coincidencia = crudo.match(CON_SEPARADORES) ?? crudo.match(SIN_SEPARADORES);
  return coincidencia === null ? null : conDosPuntos(normalizarDireccionMac(coincidencia[0]));
}

/** `BarcodeDetector` formats worth decoding — Ubiquiti stickers use these. */
export const FORMATOS_ACEPTADOS: readonly string[] = [
  "qr_code",
  "code_128",
  "data_matrix",
  "code_39",
];

export interface DisponibilidadDeCamara {
  readonly tieneBarcodeDetector: boolean;
  readonly formatosSoportados: readonly string[];
  readonly dispositivos: ReadonlyArray<Pick<MediaDeviceInfo, "kind">>;
}

/**
 * DESIGN.md D6 — "Both halves required." A tablet with the API but no
 * camera, or a camera but an unsupported format list, must not render a
 * scan button that fails the moment it is tapped (spec scenario 14).
 */
export function puedeEscanearMac(info: DisponibilidadDeCamara): boolean {
  if (!info.tieneBarcodeDetector) {
    return false;
  }
  const formatoUtil = info.formatosSoportados.some((formato) => FORMATOS_ACEPTADOS.includes(formato));
  if (!formatoUtil) {
    return false;
  }
  return info.dispositivos.some((dispositivo) => dispositivo.kind === "videoinput");
}

const MENSAJES_DE_ERROR: Record<string, string> = {
  NotAllowedError: "No se pudo acceder a la cámara: revise los permisos del navegador.",
  NotFoundError: "No se encontró una cámara disponible en este dispositivo.",
  NotReadableError: "No se pudo iniciar la cámara: puede estar en uso por otra aplicación.",
  OverconstrainedError: "No se pudo iniciar la cámara con la configuración solicitada.",
};

/** Every branch keeps manual entry reachable — the message never dead-ends. */
export function mensajeDeErrorDeCamara(motivo: unknown): string {
  const nombre = motivo instanceof Error ? motivo.name : "";
  return MENSAJES_DE_ERROR[nombre] ?? "No se pudo abrir la cámara. Puede ingresar la MAC manualmente.";
}

/**
 * The camera/decode port (same shape as `SuperficieDeFirma`/
 * `ObservadorDeDocumento`): a real `<video>` element and getUserMedia are
 * behind this seam so `EscanerDeMac.spec.tsx` injects a fake instead of
 * driving a real camera. `cerrar` MUST stop every media track it opened —
 * DESIGN.md's own teardown rule (see PR15's `createObjectURL`/
 * `revokeObjectURL` pairing for the class of bug this guards against).
 */
export interface ControladorDeCamara {
  /** Stops every track this controller opened. Safe to call more than once. */
  cerrar(): void;
}

export type AbrirCamara = (
  video: HTMLVideoElement,
  manejadores: {
    readonly onDecodificado: (crudo: string) => void;
    readonly onError: (mensaje: string) => void;
  },
) => Promise<ControladorDeCamara>;
