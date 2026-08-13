/**
 * R-3.9 — the one pure place pagination's off-by-one arithmetic lives.
 * `total: 0` yields `0` pages deliberately: that value is what tells
 * `Paginador` to render no controls at all, rather than a lone disabled
 * page 1.
 */
export function totalPaginas(total: number, tamanoPagina: number): number {
  return tamanoPagina > 0 ? Math.ceil(total / tamanoPagina) : 0;
}

export function hayPaginaAnterior(pagina: number): boolean {
  return pagina > 1;
}

export function haySiguientePagina(pagina: number, total: number, tamanoPagina: number): boolean {
  return pagina < totalPaginas(total, tamanoPagina);
}
