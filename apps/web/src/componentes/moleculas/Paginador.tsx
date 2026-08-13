import { hayPaginaAnterior, haySiguientePagina, totalPaginas } from "../../funcionalidades/contratos/logica/paginacion";
import { Boton } from "../atomos/Boton";

interface PropiedadesPaginador {
  readonly pagina: number;
  readonly total: number;
  readonly tamanoPagina: number;
  readonly onCambiarPagina: (pagina: number) => void;
}

/**
 * R-3.9 / DESIGN.md D16 — always renders prev/next AND the numbered page
 * list in the DOM; below 640px `panel.css` hides only the numbers
 * (`display: none`, no `!important` — this is what keeps
 * `PATRON_DISPLAY_IMPORTANT` at exactly 1). Zero results renders nothing at
 * all, distinguishing "no pagination needed" from "pagination present but
 * disabled".
 */
export function Paginador({ pagina, total, tamanoPagina, onCambiarPagina }: PropiedadesPaginador) {
  const paginas = totalPaginas(total, tamanoPagina);
  if (paginas === 0) {
    return null;
  }

  const anterior = hayPaginaAnterior(pagina);
  const siguiente = haySiguientePagina(pagina, total, tamanoPagina);
  const numerosDePagina = Array.from({ length: paginas }, (_, indice) => indice + 1);

  return (
    <nav aria-label="Paginación de contratos" className="paginador">
      <Boton type="button" disabled={!anterior} onClick={() => onCambiarPagina(pagina - 1)}>
        Página anterior
      </Boton>
      <ul className="paginador__numeros">
        {numerosDePagina.map((numero) => (
          <li key={numero}>
            <Boton
              type="button"
              aria-current={numero === pagina ? "page" : undefined}
              className={numero === pagina ? "boton--pagina-actual" : undefined}
              onClick={() => onCambiarPagina(numero)}
            >
              {numero}
            </Boton>
          </li>
        ))}
      </ul>
      <Boton type="button" disabled={!siguiente} onClick={() => onCambiarPagina(pagina + 1)}>
        Página siguiente
      </Boton>
    </nav>
  );
}
