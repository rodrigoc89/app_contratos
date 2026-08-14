import type { DatosContratoDetalle } from "@contratos/esquemas";
import { useState } from "react";

import { Boton } from "../../../componentes/atomos/Boton";
import { Spinner } from "../../../componentes/atomos/Spinner";
import { Toast } from "../../../componentes/moleculas/Toast";
import { entregarDocumentos, type ResultadoEntrega } from "../logica/entregaDeDocumentos";

/**
 * PR15's own composition job (`sdd/pwa-firma-comodato/tasks`): mounts onto
 * `EnvioDeFirma`'s "firmado" state, the natural place to offer the sealed
 * PDFs once signing itself has already succeeded. The contract is legally
 * complete before this component ever renders (DESIGN.md §6/§8) — a
 * delivery failure here must never look like a signing failure, so failure
 * only ever offers a retry of the SAME "compartir" action, never anything
 * that could be read as "the contract might not be signed".
 */

type EstadoEntrega =
  | { readonly tipo: "inicial" }
  | { readonly tipo: "entregando" }
  | { readonly tipo: "entregado"; readonly resultado: Exclude<ResultadoEntrega, { via: "cancelado" }> }
  | { readonly tipo: "error" };

export interface PropiedadesEntregaDeDocumentos {
  readonly contrato: DatosContratoDetalle;
  /** Injection seam for tests. Production leaves this unset. */
  readonly entregar?: (contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>;
  /**
   * Fires when the technician is done with this customer and wants the next
   * one. This container owns delivery, not the visit's lifecycle — only
   * `InicioTecnico` can reset the flow — so all it does here is offer the
   * action and report the tap; the reset itself belongs to whoever passed
   * this. Unset means "no owner able to reset", and then no exit is offered
   * at all rather than a button that does nothing.
   */
  readonly onFinalizarVisita?: () => void;
}

export function EntregaDeDocumentos({
  contrato,
  entregar,
  onFinalizarVisita,
}: PropiedadesEntregaDeDocumentos) {
  const [estado, establecerEstado] = useState<EstadoEntrega>({ tipo: "inicial" });
  // PR26 — design.md "Toast" category: only "Documentos compartidos
  // correctamente." is a toast, never the download-fallback message.
  const [avisoEntregaVisible, establecerAvisoEntregaVisible] = useState(true);
  const ejecutarEntrega = entregar ?? entregarDocumentos;

  async function manejarCompartir(): Promise<void> {
    establecerEstado({ tipo: "entregando" });
    try {
      const resultado = await ejecutarEntrega(contrato);
      if (resultado.via === "cancelado") {
        // DESIGN.md D11 — a person changing their mind, not a failure. The
        // share action simply becomes available again, with no message.
        establecerEstado({ tipo: "inicial" });
        return;
      }
      establecerEstado({ tipo: "entregado", resultado });
    } catch {
      establecerEstado({ tipo: "error" });
    }
  }

  if (estado.tipo === "entregando") {
    return (
      <div role="status" className="progreso">
        <span aria-hidden="true">
          <Spinner etiqueta="Preparando los documentos" />
        </span>
        Preparando los documentos…
      </div>
    );
  }

  if (estado.tipo === "entregado") {
    /*
      Delivering once is not the same as delivering successfully, and this
      screen used to treat them as the same thing: both success paths ended
      with no action left, and only FAILURE offered a retry. Backwards.

      DESIGN.md §8 — "the customer is entitled to their copy". A wrong chat, a
      WhatsApp that dropped the attachment, or a customer saying "no me llegó"
      are the most ordinary things that can happen while the técnico is still
      standing in the house. Sending again costs nothing and cannot harm the
      contract: it is already sealed, and delivery only ever reads the PDFs
      back.
    */
    return (
      <div className="entrega-documentos">
        {estado.resultado.via === "compartido" && avisoEntregaVisible && (
          <Toast
            mensaje="Documentos compartidos correctamente."
            onDescartar={() => establecerAvisoEntregaVisible(false)}
          />
        )}
        {estado.resultado.via === "descarga" && (
          /* The standing instruction for what to do next — it stays put
             rather than blinking out on a second attempt. */
          <p role="status">
            Los documentos se descargaron. Adjuntalos manualmente por WhatsApp.
          </p>
        )}
        <Boton type="button" onClick={() => void manejarCompartir()}>
          Compartir de nuevo
        </Boton>
        {/*
          Until now this screen was the end of the road: `/` is the only route
          a técnico ever mounts, so there was nothing to navigate back to, and
          the only escape was "Cerrar sesión" — which also throws away the
          session and the local draft. A técnico who finished one customer
          could not start the next one.

          Leaving is safe: the contract was sealed before this component ever
          rendered (DESIGN.md §6/§8) and the office panel can re-download the
          PDFs whenever it needs to. So this is finishing, not cancelling, and
          the copy says exactly that — plus where it lands, so it can never be
          mistaken for logging out.

          What it DOES cost is "Compartir de nuevo", right when "no me llegó"
          is the most ordinary thing a customer can say. That is why it sits
          last and wears `boton--secundario`: same rule `FormularioEquipos`
          applies to "Volver" — the fill stays on the action this screen
          exists for. Nothing here is destructive enough to be worth a
          confirmation dialog on a tablet in a customer's doorway; being
          visibly subordinate is the whole guard.
        */}
        {onFinalizarVisita !== undefined && (
          <Boton type="button" className="boton--secundario" onClick={onFinalizarVisita}>
            Finalizar y empezar otro contrato
          </Boton>
        )}
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div role="alert">
        <p>No se pudieron preparar los documentos. Podés intentar de nuevo.</p>
        <Boton type="button" onClick={() => void manejarCompartir()}>
          Compartir documentos
        </Boton>
      </div>
    );
  }

  return (
    <div className="entrega-documentos">
      <Boton type="button" onClick={() => void manejarCompartir()}>
        Compartir documentos
      </Boton>
    </div>
  );
}
