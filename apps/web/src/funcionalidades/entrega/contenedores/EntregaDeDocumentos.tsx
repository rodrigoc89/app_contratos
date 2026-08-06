import type { DatosContratoDetalle } from "@contratos/esquemas";
import { useState } from "react";

import { Boton } from "../../../componentes/atomos/Boton";
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
}

export function EntregaDeDocumentos({ contrato, entregar }: PropiedadesEntregaDeDocumentos) {
  const [estado, establecerEstado] = useState<EstadoEntrega>({ tipo: "inicial" });
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
    return <p role="status">Preparando los documentos…</p>;
  }

  if (estado.tipo === "entregado") {
    const mensaje =
      estado.resultado.via === "compartido"
        ? "Documentos compartidos correctamente."
        : "Los documentos se descargaron. Adjuntalos manualmente por WhatsApp.";
    return <p role="status">{mensaje}</p>;
  }

  return (
    <div>
      {estado.tipo === "error" && (
        <p role="alert">No se pudieron preparar los documentos. Podés intentar de nuevo.</p>
      )}
      <Boton type="button" onClick={() => void manejarCompartir()}>
        Compartir documentos
      </Boton>
    </div>
  );
}
