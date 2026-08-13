import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { DatosContratoDetalle } from "@contratos/esquemas";

import { clavesDeContratos } from "../../datos/consultas/clavesDeContratos";
import { obtenerContrato } from "../../datos/consultas/obtenerContrato";

/**
 * The office detail screen's one query. Reuses the `obtenerContrato` fetcher
 * the técnico flow already has rather than adding a second call site for the
 * same endpoint, and takes its key from the factory (R-4.2) so no literal is
 * written here.
 *
 * `staleTime` is deliberately shorter than the list's 30s. A contract's
 * detail is what someone reads immediately before acting on it — and once
 * darDeBaja/anular/restitución land on this screen, acting on a stale
 * reading is exactly the mistake worth spending a refetch to avoid.
 */
export function opcionesDeContrato(id: string) {
  return {
    queryKey: clavesDeContratos.detalle(id),
    queryFn: () => obtenerContrato(id),
    staleTime: 5_000,
  };
}

export function usarContrato(id: string): UseQueryResult<DatosContratoDetalle> {
  return useQuery(opcionesDeContrato(id));
}
