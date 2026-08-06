import {
  FORMATOS_ACEPTADOS,
  mensajeDeErrorDeCamara,
  puedeEscanearMac,
  type AbrirCamara,
} from "../logica/escanerDeMac";

/**
 * DESIGN.md D6's real implementations — feature detection and the camera
 * open/decode/close cycle. Thin enough to read, same rationale as
 * `firma/infraestructura/superficieDeCanvas.ts`: the DOM-free rules
 * (`puedeEscanearMac`, `macDesdeCodigoEscaneado`) stay unit-testable without
 * a browser; only the calls that must touch `navigator`/`window` live here.
 */

/** DESIGN.md D6 — "Both halves required", checked against the real browser APIs. */
export async function verificarDisponibilidadDeEscaneo(): Promise<boolean> {
  if (typeof window === "undefined" || window.BarcodeDetector === undefined) {
    return false;
  }
  try {
    const [formatosSoportados, dispositivos] = await Promise.all([
      window.BarcodeDetector.getSupportedFormats(),
      navigator.mediaDevices.enumerateDevices(),
    ]);
    return puedeEscanearMac({ tieneBarcodeDetector: true, formatosSoportados, dispositivos });
  } catch {
    // A tablet that cannot answer either question gets no scan button —
    // never a button that fails the moment it is tapped.
    return false;
  }
}

/**
 * Opens the camera, runs the decode loop against `video`, and hands back a
 * controller whose `cerrar()` stops every track — the one invariant this
 * module exists to prove (see the spec file: "the decisive teardown
 * proof"). Every exit path — a decode, a detector error, or an explicit
 * `cerrar()` — goes through the same `detener` function, so there is no
 * second place a track could be left running.
 */
export const abrirCamaraReal: AbrirCamara = async (video, { onDecodificado, onError }) => {
  let activo = true;
  let flujo: MediaStream | null = null;

  function detener(): void {
    activo = false;
    flujo?.getTracks().forEach((pista) => pista.stop());
  }

  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = flujo;
    try {
      await video.play();
    } catch {
      // Autoplay policies / jsdom: the stream is already attached either way.
    }

    const Detector = window.BarcodeDetector;
    if (Detector === undefined) {
      detener();
      onError(mensajeDeErrorDeCamara(new Error("no hay BarcodeDetector")));
      return { cerrar: detener };
    }
    const detector = new Detector({ formats: [...FORMATOS_ACEPTADOS] });

    function programarSiguienteIntento(): void {
      if (!activo) {
        return;
      }
      const conRvfc = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => void;
      };
      if (typeof conRvfc.requestVideoFrameCallback === "function") {
        conRvfc.requestVideoFrameCallback(() => void intentarDetectar());
      } else if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => void intentarDetectar());
      }
      // No frame-scheduling API at all: the loop simply stops re-firing.
      // `cerrar()`/unmount teardown are unaffected either way.
    }

    async function intentarDetectar(): Promise<void> {
      if (!activo) {
        return;
      }
      try {
        const codigos = await detector.detect(video);
        const primero = codigos[0];
        if (primero !== undefined) {
          detener(); // one decode closes the camera (DESIGN.md D6) — a re-scan re-opens it.
          onDecodificado(primero.rawValue);
          return;
        }
      } catch (error) {
        detener();
        onError(mensajeDeErrorDeCamara(error));
        return;
      }
      programarSiguienteIntento();
    }

    void intentarDetectar();

    return { cerrar: detener };
  } catch (error) {
    detener();
    onError(mensajeDeErrorDeCamara(error));
    return { cerrar: detener };
  }
};
