/**
 * DESIGN — the confirmation-tone port, same shape as `SuperficieDeFirma` /
 * `ObservadorDeDocumento`: a narrow seam so the DOM/WebAudio-backed reality
 * (`infraestructura/tonoWebAudio.ts`) is testable with a fake and no audio
 * hardware. `reproducir` returns nothing and never throws by contract — a
 * blocked or failing tone must never break or delay the flow it supplements
 * (see `tonoWebAudio.ts` for how the real implementation swallows every
 * failure mode instead of letting one escape here).
 */
export interface TonoDeConfirmacion {
  reproducir(): void;
}
