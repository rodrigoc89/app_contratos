/**
 * `BarcodeDetector` is absent from TypeScript's `lib.dom` (DESIGN.md D10).
 * Minimal ambient shape — only what this app calls: `getSupportedFormats`
 * (feature/format detection, DESIGN.md D6) and `detect` (the decode loop,
 * `funcionalidades/borrador/infraestructura/camaraDeEscaneo.ts`).
 */
interface CodigoDeBarras {
  readonly rawValue: string;
}

interface OpcionesBarcodeDetector {
  readonly formats?: readonly string[];
}

declare class BarcodeDetector {
  constructor(opciones?: OpcionesBarcodeDetector);
  static getSupportedFormats(): Promise<readonly string[]>;
  detect(fuente: CanvasImageSource): Promise<readonly CodigoDeBarras[]>;
}

interface Window {
  readonly BarcodeDetector?: typeof BarcodeDetector;
}
