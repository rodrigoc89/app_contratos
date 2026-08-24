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
 * list in the DOM; below the `tableta` breakpoint only the numbers are
 * hidden (`hidden tableta:flex`, no forced-visible override anywhere —
 * guard 2's `!important display` count stays at Preflight's own rule
 * alone). Zero results renders nothing at all, distinguishing "no
 * pagination needed" from "pagination present but disabled".
 *
 * design-system-migration PR10 (guards 13/15, D6) — `sticky bottom-0`
 * replaces the CSS-scoped `.paginador { position: sticky; bottom: 0; }`
 * pair (`bottom-0` is what arms it — `sticky` alone silently behaves as
 * `static`); `bg-fondo` is the opaque background so rows never scroll
 * visibly behind the controls. The current-page marker reuses `Boton`'s
 * `primario`/`secundario` split, the same fix guard 13 applies to the
 * estado chips — never a border colour alone.
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
    <nav
      aria-label="Paginación de contratos"
      className="sticky bottom-0 z-10 -mb-6 mt-4 flex flex-wrap items-center gap-2 border-t border-borde-suave bg-fondo py-3"
    >
      <Boton type="button" variante="secundario" disabled={!anterior} onClick={() => onCambiarPagina(pagina - 1)}>
        Página anterior
      </Boton>
      <ul className="hidden gap-1 tableta:flex">
        {numerosDePagina.map((numero) => (
          <li key={numero}>
            <Boton
              type="button"
              variante={numero === pagina ? "primario" : "secundario"}
              aria-current={numero === pagina ? "page" : undefined}
              onClick={() => onCambiarPagina(numero)}
            >
              {numero}
            </Boton>
          </li>
        ))}
      </ul>
      <Boton type="button" variante="secundario" disabled={!siguiente} onClick={() => onCambiarPagina(pagina + 1)}>
        Página siguiente
      </Boton>
    </nav>
  );
}
