/** A point in CSS pixels, relative to the canvas — resolution-independent (DESIGN.md D5). */
export interface Punto {
  readonly x: number;
  readonly y: number;
}

/**
 * DESIGN.md D5 — the drawing port `LienzoDeFirma` (PR12) draws through.
 * `capturaDeFirma.ts` (PR10/PR11) never depends on this: it only ever sees
 * `MuestraDePuntero` samples. Tests inject a fake that records calls instead
 * of touching a real canvas; production gets the real canvas-backed
 * implementation from `infraestructura/superficieDeCanvas.ts`.
 */
export interface SuperficieDeFirma {
  /** Draws one segment of a stroke, from `a` to `b`, both in CSS pixels. */
  dibujarSegmento(a: Punto, b: Punto): void;
  /** Erases every pixel drawn so far. */
  limpiar(): void;
  /** `data:image/png;base64,…` — must match `EsquemaImagenFirmaPng` (`@contratos/esquemas`). */
  aPngDataUri(): string;
}
