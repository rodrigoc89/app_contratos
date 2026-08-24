interface PropiedadesSpinner {
  readonly etiqueta: string;
}

/**
 * design-system-migration PR8 — visual redesign. Sized to the touch floor
 * (`size-toque`) even though it is not a control (no `EXENCIONES` entry
 * needed, D2), for visual consistency with the buttons it replaces while
 * loading.
 */
export function Spinner({ etiqueta }: PropiedadesSpinner) {
  return (
    <div role="status" aria-label={etiqueta} className="inline-flex size-toque items-center justify-center">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-4 border-borde-suave border-t-primario"
      />
    </div>
  );
}
