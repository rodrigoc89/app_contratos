import type { DatosContratoCreado } from "@contratos/esquemas";
import { useState } from "react";

import { crearColaDeGuardado, type ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { FormularioBorrador } from "../../borrador/contenedores/FormularioBorrador";
import { EnvioDeFirma } from "../../firma/contenedores/EnvioDeFirma";

/**
 * Técnico home. Composes the steps built so far: `FormularioBorrador`
 * (PR6/PR7) creates the draft, then this container moves into `EnvioDeFirma`
 * (PR14), which renders `PasoFirmaDual` (PR13, which blocks that move behind
 * `ColaDeGuardado.vaciar()`, DESIGN.md D3) and, once both signatures are
 * ready, owns the actual `POST :id/firmar` submission and its outcome
 * (DESIGN.md D3a).
 *
 * Task 19.1 (maintainer decision, overrules task 7.3's single-click
 * auto-transition — see `tasks`/apply-progress for the full "why"):
 * `FormularioBorrador` stays mounted and editable once the draft exists.
 * `POST /contratos` still happens exactly once — `manejarCreado` only ever
 * fires from `FormularioBorrador`'s own single `onCreado` call — and this
 * container only moves into `EnvioDeFirma` once the technician taps the
 * explicit post-creation "Continuar" action (`onContinuarAFirma`).
 *
 * Task 19.2 (DESIGN.md D3) — `manejarCreado` builds the ONE `ColaDeGuardado`
 * for this contract and this container is what shares that SAME instance
 * both downward into `FormularioBorrador` (so a post-creation edit reaches
 * `encolar`, task 18.3) and forward into `EnvioDeFirma`'s `crearCola`
 * injection seam (so `PasoFirmaDual`'s existing flush-on-entry,
 * `cola.vaciar()`, has the technician's real pending edit to flush — not a
 * second, freshly-built, empty queue that would let a stale preview
 * render). No other layer sits above both `FormularioBorrador` and
 * `EnvioDeFirma` at once, so this is the only place that can own it.
 *
 * MAC scanning (D6) and document delivery (D11) land in later slices.
 */
export function InicioTecnico() {
  const [contrato, establecerContrato] = useState<DatosContratoCreado | null>(null);
  const [cola, establecerCola] = useState<ColaDeGuardado | null>(null);
  const [avanzarAFirma, establecerAvanzarAFirma] = useState(false);

  function manejarCreado(contratoCreado: DatosContratoCreado) {
    establecerContrato(contratoCreado);
    establecerCola(crearColaDeGuardado(contratoCreado.id));
  }

  if (contrato !== null && cola !== null && avanzarAFirma) {
    return <EnvioDeFirma contratoId={contrato.id} crearCola={() => cola} />;
  }

  return (
    <FormularioBorrador
      onCreado={manejarCreado}
      onContinuarAFirma={() => establecerAvanzarAFirma(true)}
      cola={cola}
    />
  );
}
