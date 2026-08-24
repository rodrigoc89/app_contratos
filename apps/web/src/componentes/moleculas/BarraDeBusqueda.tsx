import type { EstadoContrato } from "@contratos/esquemas";
import type { FormEvent, KeyboardEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";

interface PropiedadesBarraDeBusqueda {
  readonly termino: string;
  readonly onCambiarTermino: (valor: string) => void;
  /** Flushes the debounce immediately — DESIGN.md D15's `Enter` handler. */
  readonly onBuscarInmediato: () => void;
  readonly estados: readonly EstadoContrato[];
  readonly onAlternarEstado: (estado: EstadoContrato) => void;
}

const ESTADOS: ReadonlyArray<{ readonly valor: EstadoContrato; readonly etiqueta: string }> = [
  { valor: "borrador", etiqueta: "Borrador" },
  { valor: "vigente", etiqueta: "Vigente" },
  { valor: "dado_de_baja", etiqueta: "Dado de baja" },
  { valor: "anulado", etiqueta: "Anulado" },
];

/**
 * DESIGN.md D15 — the search box sits in `<form role="search">`. Without a
 * form, `Enter` would do nothing at all; with a form and no handler,
 * `Enter` triggers a full page reload. `manejarEnvio` is what turns that
 * into "search now" instead (R-3.7).
 *
 * DESIGN.md D14 — the `estados` filter renders as toggle **buttons**
 * (`aria-pressed`), not checkboxes: four checkboxes at the globally-mandated
 * 48×48 (`base.css:81-86`) would make a filter bar that is mostly checkbox.
 * Reusing `Boton` — which already satisfies the 48px guard — sidesteps that
 * rule instead of fighting it.
 *
 * design-system-migration PR10 (guard 13, D6) — off is `Boton`'s
 * `secundario` variant (outline), on is `primario` (fill): the exact fix
 * for the historical 1.32:1 defect (`panel.css:107-109`), where two dark
 * greens read as the same filled button. Both variants share
 * `border-primario`, so the state is never carried by a border colour
 * alone. `aria-pressed` is unchanged.
 */
export function BarraDeBusqueda({
  termino,
  onCambiarTermino,
  onBuscarInmediato,
  estados,
  onAlternarEstado,
}: PropiedadesBarraDeBusqueda) {
  function manejarEnvio(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    onBuscarInmediato();
  }

  function manejarTecla(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === "Escape") {
      onCambiarTermino("");
    }
  }

  return (
    <form role="search" onSubmit={manejarEnvio} className="mb-6 flex flex-wrap items-end gap-3">
      {/*
        The label and its field share one flex item. `Etiqueta` is `block`,
        which does nothing when it is itself a flex child — it became a
        column beside the input instead of a line above it, which is how it
        shipped after PR10 and what the user saw. The wrapper restores the
        stack without touching the atom.
      */}
      <div>
        <Etiqueta htmlFor="busqueda-contratos">Buscar por nombre o DNI</Etiqueta>
        <CampoTexto
          id="busqueda-contratos"
          type="search"
          value={termino}
          onCambiar={onCambiarTermino}
          onKeyDown={manejarTecla}
          placeholder="Nombre o DNI"
          className="w-60"
        />
      </div>
      <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {ESTADOS.map(({ valor, etiqueta }) => {
          const activo = estados.includes(valor);
          return (
            <Boton
              key={valor}
              type="button"
              variante={activo ? "primario" : "secundario"}
              /*
                Four full-weight buttons outweighed the table they filter and
                read as four actions. What shrinks is the ink, never the box:
                `min-h-toque min-w-toque` still comes from `tamano`, so the
                target a gloved thumb has to hit is unchanged at 48px, and
                guard 3 iterates variante x tamano to keep it that way. These
                utilities merge through `cn()`, so each beats the atom's own
                default in its group — `border` over `border-2`, `rounded-full`
                over `rounded-base`, `font-medium` over `font-semibold`.
              */
              className="rounded-full border px-4 font-medium"
              aria-pressed={activo}
              onClick={() => onAlternarEstado(valor)}
            >
              {etiqueta}
            </Boton>
          );
        })}
      </div>
    </form>
  );
}
