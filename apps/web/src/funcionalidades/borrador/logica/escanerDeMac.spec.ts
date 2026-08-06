import { describe, expect, it } from "vitest";

import {
  macDesdeCodigoEscaneado,
  mensajeDeErrorDeCamara,
  puedeEscanearMac,
} from "./escanerDeMac";

/**
 * DESIGN.md D6 — the DOM-free half of MAC scanning: extracting a MAC-shaped
 * substring out of whatever a barcode/QR decodes to, and deciding whether
 * the scan button should exist at all. Validation itself stays a single
 * definition in `EsquemaDireccionMac` (`@contratos/esquemas`) — nothing here
 * re-implements that rule, only extraction and a plain boolean gate.
 */
describe("macDesdeCodigoEscaneado", () => {
  it("extracts a colon-separated MAC and normalises the separator/casing", () => {
    expect(macDesdeCodigoEscaneado("ac:8b:a9:12:34:56")).toBe("AC:8B:A9:12:34:56");
  });

  it("extracts a bare 12-hex-digit MAC with no separators at all", () => {
    expect(macDesdeCodigoEscaneado("AC8BA9123456")).toBe("AC:8B:A9:12:34:56");
  });

  it("extracts a MAC embedded inside a longer string, e.g. a serial or a URL", () => {
    expect(macDesdeCodigoEscaneado("https://unifi.local/device/AC8BA9123456?tab=info")).toBe(
      "AC:8B:A9:12:34:56",
    );
  });

  it("returns null when nothing resembling a MAC is found", () => {
    expect(macDesdeCodigoEscaneado("no-hex-content-here")).toBeNull();
  });
});

describe("puedeEscanearMac — scenario 14", () => {
  it("is false when BarcodeDetector is not present at all", () => {
    expect(
      puedeEscanearMac({
        tieneBarcodeDetector: false,
        formatosSoportados: ["qr_code"],
        dispositivos: [{ kind: "videoinput" }],
      }),
    ).toBe(false);
  });

  it("is false when BarcodeDetector is present but there is zero videoinput device — no scan button", () => {
    expect(
      puedeEscanearMac({
        tieneBarcodeDetector: true,
        formatosSoportados: ["qr_code", "code_128"],
        dispositivos: [{ kind: "audioinput" }],
      }),
    ).toBe(false);
  });

  it("is false when none of the supported formats overlap the accepted set", () => {
    expect(
      puedeEscanearMac({
        tieneBarcodeDetector: true,
        formatosSoportados: ["aztec", "pdf417"],
        dispositivos: [{ kind: "videoinput" }],
      }),
    ).toBe(false);
  });

  it("is true when BarcodeDetector, an accepted format and a videoinput device are all present", () => {
    expect(
      puedeEscanearMac({
        tieneBarcodeDetector: true,
        formatosSoportados: ["code_39", "qr_code"],
        dispositivos: [{ kind: "audioinput" }, { kind: "videoinput" }],
      }),
    ).toBe(true);
  });
});

describe("mensajeDeErrorDeCamara", () => {
  it("maps NotAllowedError to a permission-specific Spanish message", () => {
    expect(mensajeDeErrorDeCamara(nombrado("NotAllowedError"))).toMatch(/permiso/i);
  });

  it("maps NotFoundError to a no-camera-available message", () => {
    expect(mensajeDeErrorDeCamara(nombrado("NotFoundError"))).toMatch(/cámara/i);
  });

  it("falls back to a generic message for an unknown error", () => {
    expect(mensajeDeErrorDeCamara(nombrado("SomethingElse"))).toMatch(/manual/i);
  });
});

function nombrado(nombre: string): Error {
  const error = new Error("motivo");
  error.name = nombre;
  return error;
}
