import type { DatosContratoResumen } from "@contratos/esquemas";
import { Link } from "react-router-dom";

import { InsigniaDeEstado } from "./estadoDeContrato";

interface PropiedadesTablaDeContratos {
  readonly contratos: readonly DatosContratoResumen[];
}

interface Columna {
  readonly clave: string;
  readonly etiqueta: string;
}

const COLUMNAS: readonly Columna[] = [
  { clave: "numero", etiqueta: "Número" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "nombre", etiqueta: "Nombre completo" },
  { clave: "dni", etiqueta: "DNI" },
  { clave: "fechaFirma", etiqueta: "Fecha de firma" },
];

const SIN_VALOR = "—";

function textoDeNumero(numero: number | null): string {
  return numero === null ? SIN_VALOR : String(numero);
}

function textoDeFecha(fecha: string | null): string {
  return fecha ?? SIN_VALOR;
}

/** Card reflow below `tableta` (640px): every table element becomes a
 * block, restored to its real table display at `tableta`. */
const CLASE_TABLA = "block w-full border-collapse tableta:table";
const CLASE_CUERPO = "block w-full tableta:table-row-group";

/**
 * The header row is displaced off-screen, never removed from the tree and
 * never clipped: an absolutely-positioned 1px box at a large negative
 * `left` contributes nothing to the document's scroll width, needing no
 * other utility to keep its pixels off the page. `panel.css:230-236`
 * measured what a clip-based recipe does instead — it removes PIXELS while
 * leaving LAYOUT untouched, so the boxes still occupy space and once
 * widened the document to a measured 492px at a 360px viewport (design.md
 * D3). Restored to a real `table-header-group` at `tableta`.
 */
const CLASE_CABECERA =
  "absolute -left-[10000px] -m-px h-px w-px whitespace-nowrap tableta:static tableta:left-auto tableta:h-auto tableta:w-auto tableta:m-0 tableta:whitespace-normal tableta:table-header-group";

const CLASE_TH =
  "border-b-2 border-borde-suave bg-borde-suave/[0.18] px-3 py-3 text-left text-xs font-bold tracking-wide text-texto-suave uppercase";

/**
 * Guard 5 (R-3.5/R-3.8): no ≥48px floor, no `cursor-pointer` — a row is
 * not a target, and no whole-row destination exists. The hover tint at
 * `tableta` is a mouse-only affordance (separating a name from its estado
 * on a wide row), not a cursor change; it registers under D5's touch-floor
 * engine as an interactive candidate purely because of the `hover:`
 * variant, which is why it carries its own recorded exemption
 * (`pisoDeToque.ts`'s `EXENCIONES`, keyed `"tbody tr"`) — the same shape
 * the retired CSS engine recorded for `.tabla-de-contratos tbody tr`.
 */
const CLASE_FILA =
  "block w-full mb-3 rounded-base border border-borde-suave tableta:table-row tableta:mb-0 tableta:rounded-none tableta:border-0 tableta:even:bg-borde-suave/[0.3] tableta:hover:bg-primario/[0.06]";

const CLASE_CELDA =
  "flex items-baseline justify-between gap-3 border-b border-borde-suave px-3 py-2 text-right last:border-b-0 before:content-[attr(data-etiqueta)] before:text-left before:font-semibold tableta:table-cell tableta:px-3 tableta:py-3 tableta:text-left tableta:before:content-none";

/** Guard 20/21: the one real target per row — `inline-flex` so the touch
 * floor is not vetoed by the default inline box a bare `<a>` renders. */
const CLASE_ENLACE = "inline-flex min-h-toque items-center gap-1 font-semibold text-primario hover:text-primario-oscuro";

/**
 * DESIGN.md D12 — one DOM tree, not two. This always renders real table
 * markup with explicit `role="table"/"row"/"columnheader"/"cell"` and a
 * `data-etiqueta` on every cell; the `tableta:` variants above set
 * `display: block` below that breakpoint and reveal `data-etiqueta` via
 * `before:content-[attr(...)]`. The explicit roles are required, not
 * decorative: `display: block` on table elements destroys the implicit
 * table semantics several screen readers rely on (R-3.6).
 *
 * The row itself carries no click handler (R-3.4). It used to carry no link
 * either, because no office detail screen existed to land on; now that
 * `/contratos/:id` does, the name carries exactly one link per row and the
 * row stays a plain row. The hover treatment above is still a background
 * tint only, never a pointer cursor on the row — what is clickable is the
 * link, and it looks like one.
 */
export function TablaDeContratos({ contratos }: PropiedadesTablaDeContratos) {
  return (
    <div
      className="mb-5 overflow-x-auto rounded-base border border-borde-suave outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foco"
      role="region"
      aria-label="Contratos"
      tabIndex={0}
    >
      <table className={CLASE_TABLA} role="table">
        <thead className={CLASE_CABECERA}>
          <tr role="row">
            {COLUMNAS.map((columna) => (
              <th key={columna.clave} role="columnheader" scope="col" className={CLASE_TH}>
                {columna.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={CLASE_CUERPO}>
          {contratos.map((contrato) => (
            <tr key={contrato.id} role="row" className={CLASE_FILA}>
              <td role="cell" data-etiqueta="Número" className={CLASE_CELDA}>
                {textoDeNumero(contrato.numero)}
              </td>
              <td role="cell" data-etiqueta="Estado" className={CLASE_CELDA}>
                {/*
                  The estado is what the office opens this screen to read, so
                  it carries a colour as well as its word. `data-estado` is
                  the hook `InsigniaDeEstado` paints from — an attribute
                  rather than a class per state, so adding an estado to the
                  domain is one token and no component change.

                  The label stays as real text, never replaced by the colour:
                  the four tints differ in hue and barely in luminance, so for
                  a colour-blind reader — or a greyscale printout — the
                  Spanish word is the whole meaning.
                */}
                <InsigniaDeEstado estado={contrato.estado} />
              </td>
              <td role="cell" data-etiqueta="Nombre completo" className={CLASE_CELDA}>
                {/*
                  R-3.4, amended: the ROW is still not a click target — a
                  whole-row handler is invisible to the keyboard, announces
                  nothing and swallows text selection. The name carries the
                  one link instead. It is what the office is scanning for,
                  and unlike `numero` it is present on a draft too, so every
                  row is reachable. One link per row also keeps the tab order
                  at one stop per row (R-3.7).
                */}
                <Link className={CLASE_ENLACE} to={`/panel/contratos/${contrato.id}`}>
                  {contrato.comodatario.nombreCompleto}
                </Link>
              </td>
              <td role="cell" data-etiqueta="DNI" className={CLASE_CELDA}>
                {contrato.comodatario.dni}
              </td>
              <td role="cell" data-etiqueta="Fecha de firma" className={CLASE_CELDA}>
                {textoDeFecha(contrato.fechaFirma)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
