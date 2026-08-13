import type { DatosContratoResumen, EstadoContrato } from "@contratos/esquemas";

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

const ETIQUETA_ESTADO: Record<EstadoContrato, string> = {
  borrador: "Borrador",
  vigente: "Vigente",
  dado_de_baja: "Dado de baja",
  anulado: "Anulado",
};

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
 * Rows carry no `link`/`button` role and no click handler (R-3.4) — no
 * office contract-detail screen exists to land on, and the row-hover
 * treatment in `panel.css` is a background tint only, never a pointer
 * cursor, so nothing here promises an action that does not happen.
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
                {ETIQUETA_ESTADO[contrato.estado]}
              </td>
              <td role="cell" data-etiqueta="Nombre completo">
                {contrato.comodatario.nombreCompleto}
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
