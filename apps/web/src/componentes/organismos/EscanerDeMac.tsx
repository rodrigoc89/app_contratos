import { useEffect, useRef, useState } from "react";

import {
  abrirCamaraReal,
  verificarDisponibilidadDeEscaneo,
} from "../../funcionalidades/borrador/infraestructura/camaraDeEscaneo";
import {
  macDesdeCodigoEscaneado,
  type AbrirCamara,
  type ControladorDeCamara,
} from "../../funcionalidades/borrador/logica/escanerDeMac";
import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";

type Disponibilidad = "comprobando" | "disponible" | "no_disponible";
type EstadoEscaner = "cerrado" | "abriendo" | "escaneando" | "error";

export interface PropiedadesEscanerDeMac {
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly deshabilitado?: boolean;
  /** Injection seam (DESIGN.md D6). Defaults to the real browser check. */
  readonly comprobarDisponibilidad?: () => Promise<boolean>;
  /** Injection seam (DESIGN.md D6). Defaults to the real camera/decode loop. */
  readonly abrirCamara?: AbrirCamara;
}

/**
 * DESIGN.md D6 — "the manual field is the primary control ... the camera is
 * a button beside it, never a modal that must be dismissed." This component
 * has no `onEnviar`/`onAvanzar` prop at all — `onCambiar` is the only
 * callback it can call — so a decode structurally cannot submit the form or
 * advance a step (spec `mac-scanning`, "Scanned value requires visible
 * confirmation before use"). The manual `CampoTexto` below is rendered
 * unconditionally, outside every state branch, so it stays reachable while
 * the scanner is open, failing, or was denied — never behind an error that
 * has to be dismissed first.
 */
export function EscanerDeMac({
  valor,
  onCambiar,
  deshabilitado = false,
  comprobarDisponibilidad,
  abrirCamara,
}: PropiedadesEscanerDeMac) {
  const [disponibilidad, establecerDisponibilidad] = useState<Disponibilidad>("comprobando");
  const [estado, establecerEstado] = useState<EstadoEscaner>("cerrado");
  const [mensajeError, establecerMensajeError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controladorRef = useRef<ControladorDeCamara | null>(null);

  useEffect(() => {
    let cancelado = false;
    (comprobarDisponibilidad ?? verificarDisponibilidadDeEscaneo)()
      .then((disponible) => {
        if (!cancelado) {
          establecerDisponibilidad(disponible ? "disponible" : "no_disponible");
        }
      })
      .catch(() => {
        if (!cancelado) {
          establecerDisponibilidad("no_disponible");
        }
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera tracks must never outlive the component (DESIGN.md D6 / the
  // teardown proof this slice exists for) — unmounting mid-scan closes it.
  useEffect(() => {
    return () => {
      controladorRef.current?.cerrar();
    };
  }, []);

  function manejarDecodificado(crudo: string) {
    controladorRef.current?.cerrar();
    controladorRef.current = null;
    establecerEstado("cerrado");
    const mac = macDesdeCodigoEscaneado(crudo);
    if (mac !== null) {
      // Replaces, never appends (spec "Re-scan replaces, not appends") —
      // this is a plain overwrite, there is no previous value in scope here.
      onCambiar(mac);
    }
  }

  function manejarErrorDeCamara(mensaje: string) {
    controladorRef.current?.cerrar();
    controladorRef.current = null;
    establecerEstado("error");
    establecerMensajeError(mensaje);
  }

  async function manejarAbrir() {
    establecerMensajeError(null);
    establecerEstado("abriendo");
    const video = videoRef.current;
    if (video === null) {
      manejarErrorDeCamara("No se pudo abrir la cámara.");
      return;
    }
    // Guards against the real `abrirCamara` reporting an error (e.g. no
    // `BarcodeDetector`) before it resolves — without this, the plain
    // `establecerEstado("escaneando")` below would silently overwrite the
    // error state the moment the promise settles.
    let huboError = false;
    try {
      const controlador = await (abrirCamara ?? abrirCamaraReal)(video, {
        onDecodificado: manejarDecodificado,
        onError: (mensaje) => {
          huboError = true;
          manejarErrorDeCamara(mensaje);
        },
      });
      controladorRef.current = controlador;
      if (!huboError) {
        establecerEstado("escaneando");
      }
    } catch (error) {
      manejarErrorDeCamara(error instanceof Error ? error.message : "No se pudo abrir la cámara.");
    }
  }

  function manejarCancelar() {
    controladorRef.current?.cerrar();
    controladorRef.current = null;
    establecerEstado("cerrado");
  }

  const puedeOfrecerBoton =
    disponibilidad === "disponible" && (estado === "cerrado" || estado === "error");

  return (
    <div>
      <Etiqueta htmlFor="antenaMac">Dirección MAC de la antena</Etiqueta>
      <CampoTexto
        id="antenaMac"
        value={valor}
        onCambiar={onCambiar}
        disabled={deshabilitado}
        placeholder="AC:8B:A9:12:34:56"
      />
      {puedeOfrecerBoton && (
        <Boton type="button" onClick={() => void manejarAbrir()} disabled={deshabilitado}>
          Escanear código de la antena
        </Boton>
      )}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Vista de la cámara"
        hidden={estado !== "escaneando" && estado !== "abriendo"}
      />
      {estado === "abriendo" && <p>Abriendo cámara…</p>}
      {estado === "escaneando" && (
        <Boton type="button" onClick={manejarCancelar}>
          Cancelar
        </Boton>
      )}
      {estado === "error" && mensajeError !== null && <p role="alert">{mensajeError}</p>}
    </div>
  );
}
