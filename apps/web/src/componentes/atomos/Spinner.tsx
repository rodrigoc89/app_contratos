interface PropiedadesSpinner {
  readonly etiqueta: string;
}

export function Spinner({ etiqueta }: PropiedadesSpinner) {
  return (
    <div role="status" aria-label={etiqueta}>
      <span aria-hidden="true" />
    </div>
  );
}
