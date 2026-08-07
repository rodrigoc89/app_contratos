import type { MedicionDeDesplazamiento } from "./puertaDeLectura";

/**
 * DESIGN.md D2 — the seam between "the DOM" and `puertaDeLectura`. The one
 * real implementation (`revision/infraestructura/observadorDeIframe.ts`)
 * watches the *inner* iframe document, not the frame element: a `resize`,
 * `orientationchange` or `ResizeObserver` on the iframe itself never fires
 * when content grows inside a fixed-height box — exactly the late
 * webfont/image case this port exists to catch, where a long document would
 * otherwise measure as short during first layout.
 *
 * Kept DOM-free here so `puertaDeLectura`'s consumers can be driven by a
 * scripted fake in tests (`VisorDeDocumento.spec.tsx`), with no browser, no
 * iframe and no real timers involved.
 */
export interface ObservadorDeDocumento {
  /** Emits on every event that can change the measurement. Returns unsubscribe. */
  observar(alMedir: (medicion: MedicionDeDesplazamiento) => void): () => void;
}
