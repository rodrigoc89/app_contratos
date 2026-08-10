interface PropiedadesSpinner {
  readonly etiqueta: string;
}

export function Spinner({ etiqueta }: PropiedadesSpinner) {
  return (
    <div role="status" aria-label={etiqueta} className="spinner">
      <span aria-hidden="true" className="spinner__punto" />
    </div>
  );
}
