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
}

export function EntregaDeDocumentos({ contrato, entregar }: PropiedadesEntregaDeDocumentos) {
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
    if (estado.resultado.via === "compartido") {
      return avisoEntregaVisible ? (
        <Toast
          mensaje="Documentos compartidos correctamente."
          onDescartar={() => establecerAvisoEntregaVisible(false)}
        />
      ) : null;
    }
    return <p role="status">Los documentos se descargaron. Adjuntalos manualmente por WhatsApp.</p>;
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
