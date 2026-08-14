import type { DatosContratoCreado } from "@contratos/esquemas";
import { useState } from "react";

import { crearColaDeGuardado, type ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { FormularioBorrador } from "../../borrador/contenedores/FormularioBorrador";
import { EnvioDeFirma, type PropiedadesEnvioDeFirma } from "../../firma/contenedores/EnvioDeFirma";

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
export interface PropiedadesInicioTecnico {
  /**
   * Injection seams forwarded verbatim to `EnvioDeFirma` — its own DOM and
   * network ports (canvas surface, iframe observer, previsualización,
   * `POST :id/firmar`, delivery). Grouped into ONE optional prop instead of
   * re-declaring five, so this container keeps a no-prop production surface:
   * `rutas.tsx` renders `<InicioTecnico />` and nothing in the app ever
   * passes this. It exists so a test can drive a whole visit — draft through
   * delivery — against the real containers.
   */
  readonly firma?: Omit<PropiedadesEnvioDeFirma, "contratoId" | "crearCola" | "onFinalizarVisita">;
}

export function InicioTecnico({ firma }: PropiedadesInicioTecnico = {}) {
  const [contrato, establecerContrato] = useState<DatosContratoCreado | null>(null);
  const [cola, establecerCola] = useState<ColaDeGuardado | null>(null);
  const [avanzarAFirma, establecerAvanzarAFirma] = useState(false);

  function manejarCreado(contratoCreado: DatosContratoCreado) {
    establecerContrato(contratoCreado);
    establecerCola(crearColaDeGuardado(contratoCreado.id));
  }

  /*
    The técnico finished with this customer and wants the next one. Nothing
    is lost by leaving: the contract was sealed before the delivery screen
    ever rendered (DESIGN.md §6/§8) and the office panel can re-download the
    PDFs at any time. This container is the only place that CAN do this — `/`
    is the single route the técnico flow mounts (`rutas.tsx`), so there is no
    navigation to undo, and these three pieces of state are exactly what kept
    `EnvioDeFirma` on screen forever once they were set.

    Why the next customer's form comes up EMPTY, which is the part that
    matters legally (Ley 25.326 — a name, a DNI and an address on a shared
    tablet), and which does NOT follow from clearing state alone:

    - `FormularioBorrador` reads the stored draft exactly ONCE, in a
      `useState` initialiser, and holds every field in its own state from
      then on. A component that merely re-rendered would still be showing the
      previous customer.
    - It does not re-render, it remounts: the branch below returns
      `EnvioDeFirma` *instead of* `FormularioBorrador`, so React already
      unmounted the form when the técnico moved into signing. Coming back
      mounts a brand-new one, and that initialiser runs again.
    - What it reads is empty, because `EnvioDeFirma` clears the local draft
      the moment signing succeeds (DESIGN.md D8) and nothing writes to it
      afterwards — the only writer is the form that is no longer mounted.
      Behind that sits one more net: even a draft that somehow survived names
      a `contratoId`, and task 20.2's mount-time verification refuses to
      reopen a contract that already left `borrador` — it blanks the form
      instead.

    The chain is pinned end to end by "comes back to a BLANK draft form…" in
    `InicioTecnico.spec.tsx`, which asserts the fields themselves, and link
    by link by `EnvioDeFirma.spec.tsx`'s own "clears the local draft on
    success". An explicit `key` remount on the form was tried here and
    removed: measured against these tests it changes nothing (the unmount
    above already does the job), and a guard no test can fail would only
    hide which link actually holds.
  */
  function finalizarVisita() {
    establecerContrato(null);
    establecerCola(null);
    establecerAvanzarAFirma(false);
  }

  if (contrato !== null && cola !== null && avanzarAFirma) {
    return (
      <EnvioDeFirma
        contratoId={contrato.id}
        crearCola={() => cola}
        onFinalizarVisita={finalizarVisita}
        {...firma}
      />
    );
  }

  return (
    <FormularioBorrador
      onCreado={manejarCreado}
      onContinuarAFirma={() => establecerAvanzarAFirma(true)}
      cola={cola}
    />
  );
}
