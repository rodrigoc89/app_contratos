import type { DatosContratoCreado, DatosCrearContrato } from "@contratos/esquemas";

import { clienteHttp } from "../clienteHttp";
import { conReintentoDeConcurrencia } from "../reintentoDeConcurrencia";

/**
 * Creates a new `borrador` (spec `borrador-form` — "Create draft").
 * `EsquemaCrearContrato` requires both `comodatario` and `equipos`, so this
 * is the first request the tablet can make for a new contract — no
 * `contratoId` exists before it (DESIGN.md, "Non-obvious constraint").
 *
 * Wrapped in `conReintentoDeConcurrencia` per DESIGN.md D3a's table: a fresh
 * draft has no conflicting writer, so the retry is cheap and mostly
 * theoretical here, but every write in this app goes through the same
 * primitive rather than some writes trusting a bare `clienteHttp` call.
 */
export async function crearBorrador(datos: DatosCrearContrato): Promise<DatosContratoCreado> {
  return await conReintentoDeConcurrencia(() =>
    clienteHttp<DatosContratoCreado>("/contratos", {
      metodo: "POST",
      cuerpo: datos,
    }),
  );
}
