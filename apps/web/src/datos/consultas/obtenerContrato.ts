import type { DatosContratoDetalle } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";

/**
 * `GET /contratos/:id`. The read `resultadoDeFirma.ts` uses to confirm
 * whether a `conflicto_de_estado` on `firmar` means a previous, lost-response
 * attempt actually sealed the contract (DESIGN.md D3a).
 *
 * A read, so DESIGN.md D3a's table applies as-is: never wrapped in
 * `conReintentoDeConcurrencia` — there is nothing for a `GET` to conflict
 * with.
 */
export async function obtenerContrato(contratoId: string): Promise<DatosContratoDetalle> {
  return await clienteHttp<DatosContratoDetalle>(`/contratos/${contratoId}`);
}
