import type { DatosListaContratos } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";
import type { FiltrosDeListaContratos } from "./clavesDeContratos";

/**
 * `GET /contratos`. Mirrors `obtenerContrato.ts`'s shape: a read, so it is
 * never wrapped in `conReintentoDeConcurrencia` — there is nothing for a
 * `GET` to conflict with.
 *
 * `estados` MUST reach the wire as ONE comma-separated parameter
 * (DESIGN.md D6) — never `?estado=a&estado=b`, and never omitted-vs-empty
 * ambiguity beyond "absent means every state". `termino` and `estados` are
 * both omitted entirely rather than sent empty: `EsquemaConsultaDeContratos`
 * is `z.strictObject`, but an empty value for a known key still parses (an
 * empty `estados` means "every state"), so omitting is a style choice here,
 * not a correctness requirement — kept anyway so the request line reads as
 * "no filter" rather than carrying two empty params on every unfiltered
 * search.
 */
export async function buscarContratos(filtros: FiltrosDeListaContratos): Promise<DatosListaContratos> {
  const parametros = new URLSearchParams();

  if (filtros.termino.trim() !== "") {
    parametros.set("termino", filtros.termino);
  }
  if (filtros.estados.length > 0) {
    parametros.set("estados", filtros.estados.join(","));
  }
  parametros.set("pagina", String(filtros.pagina));
  parametros.set("tamanoPagina", String(filtros.tamanoPagina));

  return await clienteHttp<DatosListaContratos>(`/contratos?${parametros.toString()}`);
}
