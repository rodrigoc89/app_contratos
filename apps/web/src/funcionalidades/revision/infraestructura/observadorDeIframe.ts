import type { ObservadorDeDocumento } from "../logica/observadorDeDocumento";

/**
 * DESIGN.md D2 — the one real `ObservadorDeDocumento`. Watches the iframe's
 * *inner* document, not the frame element: a `resize`/`orientationchange`/
 * `ResizeObserver` on the iframe itself never fires when content grows
 * inside a fixed-height box, so a late webfont or image landing after
 * `load` would otherwise measure a long document as short, present the
 * confirmation control, and let it be confirmed.
 *
 * `allow-same-origin` (and no `allow-scripts` — see `VisorDeDocumento`) is
 * what makes reading `contentDocument` from here possible at all.
 */
export function crearObservadorDeIframe(iframe: HTMLIFrameElement): ObservadorDeDocumento {
  return {
    observar(alMedir) {
      const desconexiones: Array<() => void> = [];

      function medirAhora(): void {
        const documento = iframe.contentDocument;
        const ventana = iframe.contentWindow;
        if (documento === null || ventana === null) {
          return;
        }
        alMedir({
          scrollTop: ventana.scrollY,
          clientHeight: documento.documentElement.clientHeight,
          scrollHeight: documento.documentElement.scrollHeight,
        });
      }

      function alCargar(): void {
        medirAhora();

        const documento = iframe.contentDocument;
        const ventana = iframe.contentWindow;
        if (documento === null || ventana === null) {
          return;
        }

        // Feature-detected, not assumed: jsdom (used for this app's own
        // component tests) has no `ResizeObserver` global, and this branch
        // must degrade to "no resize-driven re-measurement" rather than
        // throw — the same jsdom-tolerance shape as this app's other DOM
        // ports (DESIGN.md's note on `LienzoDeFirma`'s null-`getContext`
        // tolerance).
        if (typeof ResizeObserver !== "undefined") {
          const observadorDeRedimension = new ResizeObserver(() => medirAhora());
          observadorDeRedimension.observe(documento.documentElement);
          if (documento.body !== null) {
            observadorDeRedimension.observe(documento.body);
          }
          desconexiones.push(() => observadorDeRedimension.disconnect());
        }

        ventana.addEventListener("scroll", medirAhora);
        desconexiones.push(() => ventana.removeEventListener("scroll", medirAhora));

        // One forced re-measure once webfonts settle — the case a late font
        // swap grows the document without any resize/scroll firing at all.
        // Feature-detected for the same jsdom-tolerance reason as
        // `ResizeObserver` above: jsdom has no `document.fonts`.
        if (documento.fonts !== undefined) {
          documento.fonts.ready.then(medirAhora).catch(() => {});
        }
      }

      iframe.addEventListener("load", alCargar);
      desconexiones.push(() => iframe.removeEventListener("load", alCargar));

      // Supplements only, never the primary trigger (DESIGN.md D2): these
      // fire on the outer window and say nothing about the inner document's
      // own size, but cost nothing to keep wired alongside the real signals
      // above.
      window.addEventListener("resize", medirAhora);
      window.addEventListener("orientationchange", medirAhora);
      desconexiones.push(() => {
        window.removeEventListener("resize", medirAhora);
        window.removeEventListener("orientationchange", medirAhora);
      });

      return () => {
        for (const desconectar of desconexiones) {
          desconectar();
        }
      };
    },
  };
}
