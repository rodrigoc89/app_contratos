import type { DatosContratoCreado } from "@contratos/esquemas";
import { useState } from "react";

import { FormularioBorrador } from "../../borrador/contenedores/FormularioBorrador";
import { PasoFirmaDual } from "../../firma/contenedores/PasoFirmaDual";

/**
 * Técnico home. Composes the two steps built so far: `FormularioBorrador`
 * (PR6/PR7) creates the draft, then this container moves into `PasoFirmaDual`
 * (PR13) — the transition task 7.3 was waiting on. `PasoFirmaDual` itself
 * blocks that move behind `ColaDeGuardado.vaciar()` (DESIGN.md D3); this
 * container only decides *when* to render it, not how it gets there.
 *
 * MAC scanning (D6) and the signing submission + delivery steps (D3a, D11)
 * land in later slices — `PasoFirmaDual`'s `onListo` is unused here for now.
 */
export function InicioTecnico() {
  const [contrato, establecerContrato] = useState<DatosContratoCreado | null>(null);

  if (contrato !== null) {
    return <PasoFirmaDual contratoId={contrato.id} />;
  }

  return <FormularioBorrador onCreado={establecerContrato} />;
}
