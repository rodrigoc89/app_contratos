import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import type { DatosContratoDetalle } from "@contratos/esquemas";

import {
  anularContrato,
  darDeBajaContrato,
  registrarRestitucion,
} from "../../datos/comandos/transicionesDeContrato";
import { clavesDeContratos } from "../../datos/consultas/clavesDeContratos";

export type TipoDeTransicion = "baja" | "anulacion" | "restitucion";

export interface DatosDeTransicion {
  readonly tipo: TipoDeTransicion;
  readonly motivo?: string;
  readonly fecha: string;
}

/**
 * The one mutation on the office side, and the first in this app —
 * `providers.tsx` already sets `mutations.retry: false` deliberately, so a
 * failed transition is reported once rather than silently resent. Resending
 * an ending is not the same as resending a read.
 *
 * On success it writes the response straight into the detail's cache entry
 * and invalidates every contract list. The list must be invalidated rather
 * than patched: the estado filter and the search term decide which page a
 * contract belongs on, and a contract that just became `anulado` may no
 * longer belong on the page the office is looking at.
 */
export function usarTransicionDeContrato(
  contratoId: string,
): UseMutationResult<DatosContratoDetalle, unknown, DatosDeTransicion> {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: async (datos: DatosDeTransicion) => {
      if (datos.tipo === "restitucion") {
        return await registrarRestitucion(contratoId, { fecha: datos.fecha });
      }
      const cuerpo = { motivo: datos.motivo ?? "", fecha: datos.fecha };
      return datos.tipo === "baja"
        ? await darDeBajaContrato(contratoId, cuerpo)
        : await anularContrato(contratoId, cuerpo);
    },
    onSuccess: (contrato) => {
      cliente.setQueryData(clavesDeContratos.detalle(contratoId), contrato);
      void cliente.invalidateQueries({ queryKey: clavesDeContratos.todo });
    },
  });
}
