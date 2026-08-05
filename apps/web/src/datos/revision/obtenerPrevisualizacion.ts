import type { DatosPrevisualizacion } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";

/**
 * Step 3 of DESIGN.md §6: `GET /contratos/:id/previsualizacion` renders both
 * documents from the same stored values `firmar` will seal moments later.
 *
 * A read, so DESIGN.md D3a's table applies as-is: never wrapped in
 * `conReintentoDeConcurrencia` — there is nothing for a `GET` to conflict
 * with.
 */
export async function obtenerPrevisualizacion(contratoId: string): Promise<DatosPrevisualizacion> {
  return await clienteHttp<DatosPrevisualizacion>(`/contratos/${contratoId}/previsualizacion`);
}
