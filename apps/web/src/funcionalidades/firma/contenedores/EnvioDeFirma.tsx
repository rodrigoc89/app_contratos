import type {
  DatosContratoDetalle,
  DatosFirmaCapturada,
  DatosPrevisualizacion,
} from "@contratos/esquemas";
import { useEffect, useState } from "react";

import { Boton } from "../../../componentes/atomos/Boton";
import { limpiarBorradorLocal } from "../../../almacenamiento/borradorLocal";
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { mensajeDeError, type MensajeDeError } from "../../../errores/mensajeDeError";
import { marcarTrabajoEnCurso } from "../../../pwa/trabajoEnCurso";
import { EntregaDeDocumentos } from "../../entrega/contenedores/EntregaDeDocumentos";
import type { ResultadoEntrega } from "../../entrega/logica/entregaDeDocumentos";
import type { ObservadorDeDocumento } from "../../revision/logica/observadorDeDocumento";
import type { SuperficieDeFirma } from "../logica/superficieDeFirma";
import { firmarContrato } from "../logica/resultadoDeFirma";
import { PasoFirmaDual } from "./PasoFirmaDual";

type EstadoEnvio =
  | { readonly tipo: "revisando" }
  | { readonly tipo: "firmando"; readonly firmas: readonly DatosFirmaCapturada[] }
  | { readonly tipo: "firmado"; readonly contrato: DatosContratoDetalle }
  | {
      readonly tipo: "error";
      readonly firmas: readonly DatosFirmaCapturada[];
      readonly mensaje: MensajeDeError;
    };

export interface PropiedadesEnvioDeFirma {
  readonly contratoId: string;
  /** Injection seams forwarded to `PasoFirmaDual` (PR13) — see its own docs. */
  readonly crearCola?: (contratoId: string) => ColaDeGuardado;
  readonly cargarPrevisualizacion?: (contratoId: string) => Promise<DatosPrevisualizacion>;
  readonly crearObservador?: (iframe: HTMLIFrameElement) => ObservadorDeDocumento;
  readonly crearSuperficie?: (canvas: HTMLCanvasElement) => SuperficieDeFirma;
  /** Injection seam for the real `POST :id/firmar` submission. Production leaves this unset. */
  readonly firmar?: (
    contratoId: string,
    firmas: readonly DatosFirmaCapturada[],
  ) => Promise<DatosContratoDetalle>;
  /** Injection seam forwarded to `EntregaDeDocumentos` (PR15). Production leaves this unset. */
  readonly entregar?: (contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>;
}

/**
 * Task 14.3 — owns what `PasoFirmaDual` (PR13) explicitly left to PR14: the
 * real `POST :id/firmar` call. `PasoFirmaDual`'s `onListo` only ever fires
 * with an already-validated `firmas[]`, so this container's whole job is
 * outcome handling (DESIGN.md D3a):
 *
 * - Success clears the local draft (DESIGN.md D8) — nothing is left to
 *   recover once the contract is sealed.
 * - Failure keeps the SAME `firmas[]` in state and offers a retry that
 *   resubmits it unchanged. The customer already signed correctly; a
 *   network failure after that is never a reason to make them sign again.
 */
export function EnvioDeFirma({
  contratoId,
  crearCola,
  cargarPrevisualizacion,
  crearObservador,
  crearSuperficie,
  firmar,
  entregar,
}: PropiedadesEnvioDeFirma) {
  const [estado, establecerEstado] = useState<EstadoEnvio>({ tipo: "revisando" });
  const ejecutarFirma = firmar ?? firmarContrato;

  // DESIGN.md D9 — "any contract open, any signature captured" for the
  // signing window: active from the moment this container mounts (review,
  // both signature canvases, the submit itself) through a failed attempt
  // still awaiting retry, and only clears once the contract is actually
  // sealed. Cleanup covers an unmount mid-visit too (e.g. a hard navigation
  // away), so the marker never survives past this container's own lifetime.
  useEffect(() => {
    const clave = `firma:${contratoId}`;
    marcarTrabajoEnCurso(clave, estado.tipo !== "firmado");
    return () => marcarTrabajoEnCurso(clave, false);
  }, [contratoId, estado.tipo]);

  async function manejarListo(firmas: readonly DatosFirmaCapturada[]): Promise<void> {
    establecerEstado({ tipo: "firmando", firmas });
    try {
      const contrato = await ejecutarFirma(contratoId, firmas);
      limpiarBorradorLocal();
      establecerEstado({ tipo: "firmado", contrato });
    } catch (motivo) {
      const mensaje =
        motivo instanceof ErrorDeApi
          ? mensajeDeError(motivo)
          : { titulo: "Error inesperado", mensaje: "No se pudo firmar el contrato.", accion: "Reintentar" };
      establecerEstado({ tipo: "error", firmas, mensaje });
    }
  }

  if (estado.tipo === "firmando") {
    return <p role="status">Enviando la firma…</p>;
  }

  if (estado.tipo === "firmado") {
    const { numero } = estado.contrato;
    return (
      <div>
        <p role="status">
          {numero !== null ? `Contrato Nº ${numero} firmado` : "Contrato firmado"} correctamente.
        </p>
        <EntregaDeDocumentos
          contrato={estado.contrato}
          {...(entregar === undefined ? {} : { entregar })}
        />
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div role="alert">
        <p>{estado.mensaje.titulo}</p>
        <p>{estado.mensaje.mensaje}</p>
        <Boton type="button" onClick={() => void manejarListo(estado.firmas)}>
          Reintentar
        </Boton>
      </div>
    );
  }

  return (
    <PasoFirmaDual
      contratoId={contratoId}
      onListo={(firmas) => void manejarListo(firmas)}
      {...(crearCola === undefined ? {} : { crearCola })}
      {...(cargarPrevisualizacion === undefined ? {} : { cargarPrevisualizacion })}
      {...(crearObservador === undefined ? {} : { crearObservador })}
      {...(crearSuperficie === undefined ? {} : { crearSuperficie })}
    />
  );
}
