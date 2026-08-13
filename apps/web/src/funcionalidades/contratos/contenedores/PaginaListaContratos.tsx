import { Boton } from "../../../componentes/atomos/Boton";
import { Spinner } from "../../../componentes/atomos/Spinner";
import { BarraDeBusqueda } from "../../../componentes/moleculas/BarraDeBusqueda";
import { Paginador } from "../../../componentes/moleculas/Paginador";
import { TablaDeContratos } from "../../../componentes/organismos/TablaDeContratos";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { mensajeDeError } from "../../../errores/mensajeDeError";
import { usarBusquedaDeContratos } from "../usarBusquedaDeContratos";

function textoDeEstadoVacio(total: number, hayFiltroActivo: boolean): string {
  if (total !== 0) {
    return total === 1 ? "1 contrato" : `${total} contratos`;
  }
  return hayFiltroActivo
    ? "No hay contratos que coincidan con la búsqueda."
    : "Todavía no hay contratos cargados.";
}

/**
 * R-3.3 — four distinct outcomes: loading, error, and the two empty states
 * kept apart on purpose ("no results" reading as "the system is broken" is
 * what generates support calls). DESIGN.md D15 — the result line is the
 * screen's single live region; the loading row's own `role="status"` never
 * coexists with it because the two branches are mutually exclusive, and its
 * `Spinner` is wrapped `aria-hidden` so nothing is announced twice
 * (`organismos.css`'s existing `.progreso` rule).
 *
 * Tab order (R-3.7) is DOM order alone — search box, then `estados` chips
 * (inside `BarraDeBusqueda`), then the table's scroll region, then
 * pagination — so no `tabIndex` is set anywhere in this container.
 */
export function PaginaListaContratos() {
  const {
    termino,
    establecerTermino,
    aplicarBusquedaInmediata,
    estados,
    alternarEstado,
    pagina,
    establecerPagina,
    tamanoPagina,
    consulta,
  } = usarBusquedaDeContratos();

  const { data, isLoading, isError, error, refetch } = consulta;
  const hayFiltroActivo = termino.trim() !== "" || estados.length > 0;

  return (
    <div className="pagina-lista-contratos">
      <h1>Contratos</h1>
      <BarraDeBusqueda
        termino={termino}
        onCambiarTermino={establecerTermino}
        onBuscarInmediato={aplicarBusquedaInmediata}
        estados={estados}
        onAlternarEstado={alternarEstado}
      />

      {isLoading && (
        <div role="status" className="progreso">
          <span aria-hidden="true">
            <Spinner etiqueta="Cargando contratos" />
          </span>
          Cargando contratos…
        </div>
      )}

      {isError && (
        <div role="alert">
          <p>
            {error instanceof ErrorDeApi
              ? mensajeDeError(error).mensaje
              : "No se pudo cargar el listado de contratos."}
          </p>
          <Boton type="button" onClick={() => void refetch()}>
            Reintentar
          </Boton>
        </div>
      )}

      {!isLoading && !isError && data !== undefined && (
        <>
          <p role="status">{textoDeEstadoVacio(data.total, hayFiltroActivo)}</p>
          {data.total > 0 && <TablaDeContratos contratos={data.elementos} />}
        </>
      )}

      {!isError && data !== undefined && (
        <Paginador
          pagina={pagina}
          total={data.total}
          tamanoPagina={tamanoPagina}
          onCambiarPagina={establecerPagina}
        />
      )}
    </div>
  );
}
