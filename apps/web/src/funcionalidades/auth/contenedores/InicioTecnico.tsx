import type { DatosContratoCreado } from "@contratos/esquemas";
import { useState } from "react";

import { FormularioBorrador } from "../../borrador/contenedores/FormularioBorrador";
import { EnvioDeFirma } from "../../firma/contenedores/EnvioDeFirma";

/**
 * Técnico home. Composes the steps built so far: `FormularioBorrador`
 * (PR6/PR7) creates the draft, then this container moves into `EnvioDeFirma`
 * (PR14) — the transition task 7.3 was waiting on. `EnvioDeFirma` renders
 * `PasoFirmaDual` (PR13, which blocks that move behind
 * `ColaDeGuardado.vaciar()`, DESIGN.md D3) and, once both signatures are
 * ready, owns the actual `POST :id/firmar` submission and its outcome
 * (DESIGN.md D3a). This container only decides *when* to render it.
 *
 * MAC scanning (D6) and document delivery (D11) land in later slices.
 */
export function InicioTecnico() {
  const [contrato, establecerContrato] = useState<DatosContratoCreado | null>(null);

  if (contrato !== null) {
    return <EnvioDeFirma contratoId={contrato.id} />;
  }

  return <FormularioBorrador onCreado={establecerContrato} />;
}
