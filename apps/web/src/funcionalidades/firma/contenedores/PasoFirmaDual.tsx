import {
  DOCUMENTOS_DEL_CONTRATO,
  MINIMO_PUNTOS_FIRMA,
  type DatosFirmaCapturada,
  type DatosPrevisualizacion,
  type TipoDocumentoFirmado,
} from "@contratos/esquemas";
import { useCallback, useEffect, useState } from "react";

import { Boton } from "../../../componentes/atomos/Boton";
import { Spinner } from "../../../componentes/atomos/Spinner";
import { LienzoDeFirma, type DatosLienzoDeFirma } from "../../../componentes/organismos/LienzoDeFirma";
import { VisorDeDocumento } from "../../../componentes/organismos/VisorDeDocumento";
import { crearColaDeGuardado, type ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { obtenerPrevisualizacion } from "../../../datos/revision/obtenerPrevisualizacion";
import { CLASE_PROGRESO } from "../../../estilos/progreso";
import type { ObservadorDeDocumento } from "../../revision/logica/observadorDeDocumento";
import { estadoInicialDePuerta, type EstadoPuerta } from "../../revision/logica/puertaDeLectura";
import { ensamblarFirmas } from "../logica/capturaDeFirma";
import type { SuperficieDeFirma } from "../logica/superficieDeFirma";

const TITULOS: Record<TipoDocumentoFirmado, string> = {
  condiciones_generales: "Condiciones Generales de Uso",
  comodato: "Contrato de Comodato",
};

/**
 * design-system-migration PR18 (task 18.4) — ported 1:1 from `.paso-firma` /
 * `.paso-firma__documento` / `.paso-firma__pendientes` /
 * `.paso-firma__pendientes-titulo` (organismos.css). espacio-3/4/6 map onto
 * Tailwind's 4px step as 3/4/8 (D3).
 */
const CLASE_PASO_FIRMA = "p-4";
const CLASE_DOCUMENTO = "mb-8";
const CLASE_PENDIENTES = "mx-4 mt-4 rounded-base border-2 border-borde-suave px-4 py-3 text-texto";
const CLASE_PENDIENTES_TITULO = "m-0 mb-2 font-bold";

type Fase =
  | { readonly tipo: "vaciando" }
  | { readonly tipo: "error_vaciado" }
  | { readonly tipo: "cargando" }
  | { readonly tipo: "error_carga" }
  | { readonly tipo: "revisando"; readonly previsualizacion: DatosPrevisualizacion };

function puertasIniciales(): Record<TipoDocumentoFirmado, EstadoPuerta> {
  return {
    condiciones_generales: estadoInicialDePuerta(),
    comodato: estadoInicialDePuerta(),
  };
}

function firmasIniciales(): Record<TipoDocumentoFirmado, DatosLienzoDeFirma | null> {
  return { condiciones_generales: null, comodato: null };
}

export interface PropiedadesPasoFirmaDual {
  readonly contratoId: string;
  /** Fires with the assembled `firmas[]`, once both documents are ready — PR14 owns the actual `POST :id/firmar`. */
  readonly onListo?: (firmas: readonly DatosFirmaCapturada[]) => void;
  /** Injection seam for `ColaDeGuardado` (DESIGN.md D3). Production leaves this unset and gets the real queue. */
  readonly crearCola?: (contratoId: string) => ColaDeGuardado;
  /** Injection seam for `GET :id/previsualizacion`. Production leaves this unset and gets the real fetch. */
  readonly cargarPrevisualizacion?: (contratoId: string) => Promise<DatosPrevisualizacion>;
  /** Injection seam for `ObservadorDeDocumento` (DESIGN.md D2), forwarded to both `VisorDeDocumento` instances. */
  readonly crearObservador?: (iframe: HTMLIFrameElement) => ObservadorDeDocumento;
  /** Injection seam for `SuperficieDeFirma` (DESIGN.md D5), forwarded to both `LienzoDeFirma` instances. */
  readonly crearSuperficie?: (canvas: HTMLCanvasElement) => SuperficieDeFirma;
}

/**
 * Spec `document-review` + `firma-capture` + `contract-signing`, DESIGN.md
 * D2/D3/D5 — the dual-signature step: two documents, each behind its own
 * reading gate and its own signature canvas, gated on both being genuinely
 * ready before `Firmar` is enabled.
 *
 * Task 7.3: moving into this step is blocked behind `ColaDeGuardado.vaciar()`
 * (DESIGN.md D3, "Pending edit on forward navigation") — no document, no
 * gate and no canvas mounts until the flush resolves, and a failed flush
 * shows a retry affordance instead of a review screen built from data an
 * unflushed edit is about to overwrite.
 *
 * `Firmar` requires BOTH documents' `PuertaDeLectura` to be `completo` — one
 * alone is not enough (spec `document-review`) — **and** both signatures to
 * carry at least `MINIMO_PUNTOS_FIRMA` captured points. The image is never
 * the gate: an untouched canvas still yields a schema-valid PNG
 * (`superficieDeCanvas.spec.ts`), so only the stroke data distinguishes a
 * real signature from a blank one.
 */
export function PasoFirmaDual({
  contratoId,
  onListo,
  crearCola,
  cargarPrevisualizacion,
  crearObservador,
  crearSuperficie,
}: PropiedadesPasoFirmaDual) {
  const [cola] = useState<ColaDeGuardado>(() => (crearCola ?? crearColaDeGuardado)(contratoId));
  const [fase, establecerFase] = useState<Fase>({ tipo: "vaciando" });
  const [puertas, establecerPuertas] = useState<Record<TipoDocumentoFirmado, EstadoPuerta>>(puertasIniciales);
  const [firmas, establecerFirmas] =
    useState<Record<TipoDocumentoFirmado, DatosLienzoDeFirma | null>>(firmasIniciales);

  const cargar = cargarPrevisualizacion ?? obtenerPrevisualizacion;

  const ejecutarTransicion = useCallback(async () => {
    establecerFase({ tipo: "vaciando" });
    try {
      // DESIGN.md D3, "Pending edit on forward navigation": the transition
      // into review is blocked while this flush runs, and cancelled (with a
      // retry affordance) on failure — a preview built from stale data,
      // sealed against different data, is the worst failure this system can
      // produce.
      await cola.vaciar();
    } catch {
      establecerFase({ tipo: "error_vaciado" });
      return;
    }

    establecerFase({ tipo: "cargando" });
    try {
      const previsualizacion = await cargar(contratoId);
      establecerFase({ tipo: "revisando", previsualizacion });
    } catch {
      establecerFase({ tipo: "error_carga" });
    }
  }, [cola, cargar, contratoId]);

  useEffect(() => {
    // Runs once per mount: `contratoId` is stable for this step's lifetime —
    // a different contract means a different instance of this container.
    void ejecutarTransicion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fase.tipo === "vaciando") {
    return (
      <div role="status" className={CLASE_PROGRESO} data-progreso>
        <span aria-hidden="true">
          <Spinner etiqueta="Guardando los últimos cambios antes de continuar" />
        </span>
        Guardando los últimos cambios antes de continuar…
      </div>
    );
  }

  if (fase.tipo === "error_vaciado") {
    return (
      <div role="alert">
        <p>No se pudieron guardar los últimos cambios. Verifique la conexión e intente de nuevo.</p>
        <Boton type="button" onClick={() => void ejecutarTransicion()}>
          Reintentar
        </Boton>
      </div>
    );
  }

  if (fase.tipo === "cargando") {
    return (
      <div role="status" className={CLASE_PROGRESO} data-progreso>
        <span aria-hidden="true">
          <Spinner etiqueta="Cargando los documentos para la revisión" />
        </span>
        Cargando los documentos para la revisión…
      </div>
    );
  }

  if (fase.tipo === "error_carga") {
    return (
      <div role="alert">
        <p>No se pudieron cargar los documentos del contrato. Intente de nuevo.</p>
        <Boton type="button" onClick={() => void ejecutarTransicion()}>
          Reintentar
        </Boton>
      </div>
    );
  }

  const { previsualizacion } = fase;

  const gatesCompletos = DOCUMENTOS_DEL_CONTRATO.every(
    (documento) => puertas[documento].estado === "completo",
  );
  const firmasSuficientes = DOCUMENTOS_DEL_CONTRATO.every(
    (documento) => (firmas[documento]?.captura.cantidadPuntos ?? 0) >= MINIMO_PUNTOS_FIRMA,
  );
  const listoParaFirmar = gatesCompletos && firmasSuficientes;

  /*
    A disabled button was the entire message. The técnico is standing in a
    customer's house, and "Firmar" greyed out with nothing beside it is
    indistinguishable from an app that broke — which is exactly how it was
    reported. Every fact needed to answer it already existed here; none of it
    reached the screen.

    Derived from the same two conditions the button reads, never tracked
    separately: a second source could disagree with the button and tell the
    técnico to do something that changes nothing.
  */
  const pendientes = DOCUMENTOS_DEL_CONTRATO.flatMap((documento) => {
    const faltas: string[] = [];
    if (puertas[documento].estado !== "completo") {
      faltas.push(`Leer ${TITULOS[documento]} hasta el final`);
    }
    if ((firmas[documento]?.captura.cantidadPuntos ?? 0) < MINIMO_PUNTOS_FIRMA) {
      faltas.push(`Falta la firma de ${TITULOS[documento]}`);
    }
    return faltas;
  });

  function manejarFirmar(): void {
    const condiciones = firmas.condiciones_generales;
    const comodato = firmas.comodato;
    if (!listoParaFirmar || condiciones === null || comodato === null) {
      return;
    }
    onListo?.(
      ensamblarFirmas([
        { documento: "condiciones_generales", captura: condiciones.captura, imagenPng: condiciones.imagenPng },
        { documento: "comodato", captura: comodato.captura, imagenPng: comodato.imagenPng },
      ]),
    );
  }

  return (
    <div className={CLASE_PASO_FIRMA}>
      {DOCUMENTOS_DEL_CONTRATO.map((documento) => {
        const html = previsualizacion.documentos.find((doc) => doc.documento === documento)?.html ?? "";
        return (
          <section key={documento} className={CLASE_DOCUMENTO}>
            <VisorDeDocumento
              html={html}
              titulo={TITULOS[documento]}
              onCambiaEstado={(estado) =>
                establecerPuertas((previo) => ({ ...previo, [documento]: estado }))
              }
              {...(crearObservador === undefined ? {} : { crearObservador })}
            />
            <LienzoDeFirma
              etiqueta={`Firma — ${TITULOS[documento]}`}
              onCambia={(datos) => establecerFirmas((previo) => ({ ...previo, [documento]: datos }))}
              {...(crearSuperficie === undefined ? {} : { crearSuperficie })}
            />
          </section>
        );
      })}
      {/*
        `role="status"`, not `alert`: nothing has gone wrong, and this text
        changes as the técnico works through the list. An alert would
        interrupt a screen reader on every scroll.
      */}
      {pendientes.length > 0 && (
        <div role="status" aria-label="Qué falta para poder firmar" className={CLASE_PENDIENTES}>
          <p className={CLASE_PENDIENTES_TITULO}>Para firmar falta:</p>
          <ul>
            {pendientes.map((falta) => (
              <li key={falta}>{falta}</li>
            ))}
          </ul>
        </div>
      )}
      <Boton type="button" disabled={!listoParaFirmar} onClick={manejarFirmar}>
        Firmar
      </Boton>
    </div>
  );
}
