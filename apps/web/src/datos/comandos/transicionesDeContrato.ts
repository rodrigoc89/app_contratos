import type { DatosContratoDetalle } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";
import { conReintentoDeConcurrencia } from "../reintentoDeConcurrencia";

/**
 * The three post-signature transitions (DESIGN.md §3). Each answers the
 * updated contract, so the screen renders the new state from the response
 * instead of re-reading it and racing its own write.
 *
 * Wrapped in `conReintentoDeConcurrencia` for the same reason signing is: a
 * `conflicto_de_concurrencia` means two writers collided and the same body
 * will succeed on a second try. That helper deliberately never retries
 * `conflicto_de_estado`, which is the 409 these endpoints actually raise when
 * the contract is in the wrong state — resending it would repeat a request
 * already known to fail.
 *
 * None of them sends who is asking. The actor comes from the token the HTTP
 * client already attaches, and the API refuses a body that names its own
 * author.
 */

async function transicion(
  contratoId: string,
  ruta: string,
  cuerpo: Record<string, string>,
): Promise<DatosContratoDetalle> {
  return await conReintentoDeConcurrencia(() =>
    clienteHttp<DatosContratoDetalle>(`/contratos/${contratoId}/${ruta}`, {
      metodo: "POST",
      cuerpo,
    }),
  );
}

export async function darDeBajaContrato(
  contratoId: string,
  datos: { readonly motivo: string; readonly fecha: string },
): Promise<DatosContratoDetalle> {
  return await transicion(contratoId, "baja", { motivo: datos.motivo, fecha: datos.fecha });
}

export async function anularContrato(
  contratoId: string,
  datos: { readonly motivo: string; readonly fecha: string },
): Promise<DatosContratoDetalle> {
  return await transicion(contratoId, "anulacion", { motivo: datos.motivo, fecha: datos.fecha });
}

export async function registrarRestitucion(
  contratoId: string,
  datos: { readonly fecha: string },
): Promise<DatosContratoDetalle> {
  return await transicion(contratoId, "restitucion", { fecha: datos.fecha });
}
