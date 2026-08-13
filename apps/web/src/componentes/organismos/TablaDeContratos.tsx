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

/**
 * DESIGN.md D12 — one DOM tree, not two. This always renders real table
 * markup with explicit `role="table"/"row"/"columnheader"/"cell"` and a
 * `data-etiqueta` on every cell; `panel.css` (below 640px) sets
 * `display: block` on the table elements and reveals `data-etiqueta` via
 * `td::before`. The explicit roles are required, not decorative:
 * `display: block` on table elements destroys the implicit table semantics
 * several screen readers rely on (R-3.6).
 *
 * The row itself carries no click handler (R-3.4). It used to carry no link
 * either, because no office detail screen existed to land on; now that
 * `/contratos/:id` does, the name carries exactly one link per row and the
 * row stays a plain row. The hover treatment in `panel.css` is still a
 * background tint only, never a pointer cursor on the row — what is
 * clickable is the link, and it looks like one.
 */
export function TablaDeContratos({ contratos }: PropiedadesTablaDeContratos) {
  return (
    <div
      className="tabla-de-contratos__desplazamiento"
      role="region"
      aria-label="Contratos"
      tabIndex={0}
    >
      <table className="tabla-de-contratos" role="table">
        <thead>
          <tr role="row">
            {COLUMNAS.map((columna) => (
              <th key={columna.clave} role="columnheader" scope="col">
                {columna.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contratos.map((contrato) => (
            <tr key={contrato.id} role="row">
              <td role="cell" data-etiqueta="Número">
                {textoDeNumero(contrato.numero)}
              </td>
              <td role="cell" data-etiqueta="Estado">
                {/*
                  The estado is what the office opens this screen to read, so
                  it carries a colour as well as its word. `data-estado` is
                  the hook `panel.css` paints from — an attribute rather than
                  a class per state, so adding an estado to the domain is one
                  CSS rule and no component change.

                  The label stays as real text, never replaced by the colour:
                  the four tints differ in hue and barely in luminance, so for
                  a colour-blind reader — or a greyscale printout — the
                  Spanish word is the whole meaning.
                */}
                <InsigniaDeEstado estado={contrato.estado} />
              </td>
              <td role="cell" data-etiqueta="Nombre completo">
                {/*
                  R-3.4, amended: the ROW is still not a click target — a
                  whole-row handler is invisible to the keyboard, announces
                  nothing and swallows text selection. The name carries the
                  one link instead. It is what the office is scanning for,
                  and unlike `numero` it is present on a draft too, so every
                  row is reachable. One link per row also keeps the tab order
                  at one stop per row (R-3.7).
                */}
                <Link className="tabla-de-contratos__enlace" to={`/contratos/${contrato.id}`}>
                  {contrato.comodatario.nombreCompleto}
                </Link>
              </td>
              <td role="cell" data-etiqueta="DNI">
                {contrato.comodatario.dni}
              </td>
              <td role="cell" data-etiqueta="Fecha de firma">
                {textoDeFecha(contrato.fechaFirma)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
