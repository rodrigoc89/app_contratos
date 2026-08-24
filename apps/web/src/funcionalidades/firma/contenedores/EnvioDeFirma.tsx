import type {
  DatosContratoDetalle,
  DatosFirmaCapturada,
  DatosPrevisualizacion,
} from "@contratos/esquemas";
import { useEffect, useState } from "react";

import { Boton } from "../../../componentes/atomos/Boton";
import { Spinner } from "../../../componentes/atomos/Spinner";
import { Toast } from "../../../componentes/moleculas/Toast";
import { limpiarBorradorLocal } from "../../../almacenamiento/borradorLocal";
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { mensajeDeError, type MensajeDeError } from "../../../errores/mensajeDeError";
import { CLASE_PROGRESO } from "../../../estilos/progreso";
import { marcarTrabajoEnCurso } from "../../../pwa/trabajoEnCurso";
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
  /**
   * Fires when the técnico is done with this customer and wants the next
   * one. This container owns signing, not the visit's lifecycle: the state
   * that keeps this screen mounted lives one level up, in `InicioTecnico`,
   * which is the only place that can reset it — same shape as
   * `onCreado`/`onContinuarAFirma` on the draft side.
   *
   * Required, not optional, and that is the whole point. While it was
   * optional the completion screen had to guard every render of the exit
   * against a missing owner, and a guard is exactly what stranded técnicos
   * here before (see the "firmado" branch below). A caller that cannot reset
   * the visit must not be able to mount this screen at all.
   */
  readonly onFinalizarVisita: () => void;
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
/**
 * design-system-migration PR18 (task 18.3) — ported 1:1 from
 * `.envio-firma__resultado, .envio-firma__error` / `.envio-firma__titulo` /
 * `.envio-firma__proximo-paso` (organismos.css).
 */
const CLASE_PADDING_RESULTADO = "p-4";
const CLASE_TITULO_RESULTADO = "m-0 mb-4 border-b-2 border-primario pb-2 text-grande font-bold";
const CLASE_PROXIMO_PASO = "m-0 mb-4";

export function EnvioDeFirma({
  contratoId,
  crearCola,
  cargarPrevisualizacion,
  crearObservador,
  crearSuperficie,
  firmar,
  onFinalizarVisita,
}: PropiedadesEnvioDeFirma) {
  const [estado, establecerEstado] = useState<EstadoEnvio>({ tipo: "revisando" });
  // PR26 — design.md "Toast" category: whether the signing-confirmation
  // toast is still showing. Nothing else on the completion screen is gated by
  // it; the toast may expire, the rest of that screen may not.
  const [avisoFirmaVisible, establecerAvisoFirmaVisible] = useState(true);
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
    return (
      <div role="status" className={CLASE_PROGRESO} data-progreso>
        <span aria-hidden="true">
          <Spinner etiqueta="Enviando la firma" />
        </span>
        Enviando la firma…
      </div>
    );
  }

  if (estado.tipo === "firmado") {
    const { numero } = estado.contrato;
    const mensaje = `${numero !== null ? `Contrato Nº ${numero} firmado` : "Contrato firmado"} correctamente.`;
    return (
      <div className={CLASE_PADDING_RESULTADO}>
        {/*
          The toast dismisses itself after five seconds, and for a while that
          was the ONLY statement that the contract had been signed. Past that
          window the whole screen read "tecnico / Cerrar sesión / Compartir
          documentos" — no number, no state, nothing about the one moment in
          this flow with legal weight, with the customer standing there.

          The toast is still right for the instant it lands. This is what
          stays behind it, and it is also this screen's `h1`, which it never
          had.
        */}
        <h1 className={CLASE_TITULO_RESULTADO}>
          {numero !== null ? `Contrato Nº ${numero} firmado` : "Contrato firmado"}
        </h1>
        {avisoFirmaVisible && (
          <Toast mensaje={mensaje} onDescartar={() => establecerAvisoFirmaVisible(false)} />
        )}
        {/*
          The técnico used to hand the documents over from the tablet, so this
          screen never had to say who would. It does now (DESIGN.md §8,
          decided 2026-08-18): the office sends them, by its own means, from
          the office panel's Descargar action. The técnico is standing in
          front of the customer who is about to ask where their copy is, and
          "no lo sé" is not an answer this screen may force them into.
        */}
        <p className={CLASE_PROXIMO_PASO}>
          Los documentos firmados los envía la oficina. No tenés que hacer nada más.
        </p>
        {/*
          Unconditional, and that is the fix. `/` is the only route the
          técnico flow mounts (`rutas/rutas.tsx`), so there is nothing to
          navigate back to: without this button the only way off this screen
          is "Cerrar sesión", which also throws away the session. The exit
          used to live inside the delivery screen's *delivered* branch, which
          meant a técnico who never tapped share, who cancelled the OS share
          sheet, or whose share AND download both failed never saw it at all —
          precisely the people most stuck.

          Leaving is finishing, not cancelling: the contract was sealed before
          this branch rendered (DESIGN.md §6/§8) and the office panel can
          re-download the PDFs whenever it needs to. Nothing here is
          destructive, so no confirmation dialog stands between a técnico on a
          tablet and the next customer.
        */}
        <Boton type="button" onClick={onFinalizarVisita}>
          Finalizar y empezar otro contrato
        </Boton>
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div role="alert" className={CLASE_PADDING_RESULTADO}>
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
