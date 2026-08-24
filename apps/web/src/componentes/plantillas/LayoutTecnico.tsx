import type { ReactNode } from "react";

interface PropiedadesLayoutTecnico {
  readonly children: ReactNode;
  /** Injected by the route tree — see `LayoutPanel` for why. */
  readonly cabecera?: ReactNode;
}

export function LayoutTecnico({ children, cabecera }: PropiedadesLayoutTecnico) {
  return (
    <div className="min-h-full" data-layout-tecnico>
      {cabecera}
      <main className="mx-auto max-w-[720px] p-4" data-layout-tecnico-contenido>
        {children}
      </main>
    </div>
  );
}
