import type { DatosContratoDetalle, DatosFirmaCapturada, DatosFirmarContrato } from "@contratos/esquemas";

import { obtenerContrato } from "../../../datos/consultas/obtenerContrato";
import { ErrorDeApi, clienteHttp } from "../../../datos/clienteHttp";
import { obtenerDispositivoId } from "../../../datos/dispositivo";
import { conReintentoDeConcurrencia } from "../../../datos/reintentoDeConcurrencia";

/**
 * Spec `contract-signing`, DESIGN.md D3a — the one request that seals a
 * contract, and the one place both 409s named `packages/esquemas/src/respuestas.ts`
 * meet with opposite remedies:
 *
 * - `conflicto_de_concurrencia` (two writers collided): wrapped in the same
 *   `conReintentoDeConcurrencia` every other write goes through — exactly
 *   one transparent retry, same as `ColaDeGuardado`'s `PATCH` and
 *   `crearBorrador`'s `POST` (D3a's table).
 * - `conflicto_de_estado`: never retried by `conReintentoDeConcurrencia` —
 *   it means the aggregate cannot take this write, not that two writers
 *   collided. But on `firmar` specifically this usually means a PREVIOUS
 *   attempt already sealed the contract and its response never arrived
 *   (`ContratosController.firmar`'s own doc comment: a retried request
 *   answers 409 without double-signing or burning a second contract
 *   number). Refetching and finding `estado === "vigente"` is treated as
 *   SUCCESS here — never shown as an error to a technician whose signature
 *   actually worked.
 *
 * If the confirming refetch itself throws (network failure, the contract no
 * longer exists, …), that new error is what propagates — this function
 * never invents a result it could not confirm, and never silently
 * swallows a failure it cannot explain.
 */
export async function firmarContrato(
  contratoId: string,
  firmas: readonly DatosFirmaCapturada[],
): Promise<DatosContratoDetalle> {
  const cuerpo: DatosFirmarContrato = {
    firmas: [...firmas],
    dispositivoId: obtenerDispositivoId(),
  };

  try {
    return await conReintentoDeConcurrencia(() =>
      clienteHttp<DatosContratoDetalle>(`/contratos/${contratoId}/firmar`, {
        metodo: "POST",
        cuerpo,
      }),
    );
  } catch (error) {
    if (error instanceof ErrorDeApi && error.codigo === "conflicto_de_estado") {
      const contrato = await obtenerContrato(contratoId);
      if (contrato.estado === "vigente") {
        return contrato;
      }
    }
    throw error;
  }
}
