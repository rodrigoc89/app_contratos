import { EsquemaLogin } from "@contratos/esquemas";
import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { CampoTexto } from "../../../componentes/atomos/CampoTexto";
import { Etiqueta } from "../../../componentes/atomos/Etiqueta";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import type { MotivoCierreDeSesion } from "../../../datos/sesion/estadoSesion";
import { iniciarSesion } from "../../../datos/sesion/sesion";
import { mensajeDeError } from "../../../errores/mensajeDeError";
import { rutaInicialPara } from "../logica/rutaInicialPara";

/**
 * Task 21, spec `web-auth-session` — "Session expires mid-form": the
 * técnico-facing reason shown on arrival, distinguishing a mid-visit
 * expiry from an explicit logout (`GuardiaDeSesion` carries this as router
 * `state.motivo`, never through storage).
 */
const MENSAJE_POR_MOTIVO: Record<MotivoCierreDeSesion, string> = {
  sesion_expirada: "Tu sesión expiró. Iniciá sesión nuevamente para continuar con la visita.",
  cierre_explicito: "Cerraste tu sesión correctamente.",
};

function motivoDesdeEstado(estado: unknown): MotivoCierreDeSesion | null {
  if (typeof estado !== "object" || estado === null || !("motivo" in estado)) {
    return null;
  }
  const { motivo } = estado;
  return motivo === "sesion_expirada" || motivo === "cierre_explicito" ? motivo : null;
}

/**
 * The login screen. Validates against the shared `EsquemaLogin` before any
 * network call (spec `web-auth-session` — "Client-side login validation"),
 * then routes through `rutaInicialPara` (DESIGN.md D9) — the same pure
 * mapping the route guards use — rather than relying only on the next
 * render's guard to catch it.
 */
export function PaginaLogin() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const motivo = motivoDesdeEstado(ubicacion.state);
  const [nombreUsuario, establecerNombreUsuario] = useState("");
  const [contrasena, establecerContrasena] = useState("");
  const [error, establecerError] = useState<string | null>(null);
  const [enviando, establecerEnviando] = useState(false);
  /**
   * Hidden by default, and deliberately NOT reset when a login is rejected: a
   * rejected login is the one moment the técnico most needs to read what they
   * typed, and hiding it again would take away the evidence of the typo they
   * are about to fix. The técnico opted in, holds the tablet, and the state
   * dies with the screen — a successful login navigates away and unmounts it.
   */
  const [contrasenaVisible, establecerContrasenaVisible] = useState(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const validacion = EsquemaLogin.safeParse({ nombreUsuario, contrasena });
    if (!validacion.success) {
      establecerError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    establecerError(null);
    establecerEnviando(true);
    try {
      const sesion = await iniciarSesion(validacion.data);
      // `void` because under `RouterProvider` (a data router, see
      // `rutas/enrutador.tsx`) `navegar` returns `Promise<void>` that settles
      // once the destination's loaders have run. Awaiting it would keep the
      // submit button disabled until the next screen's data arrived, since
      // `establecerEnviando(false)` lives in the `finally` below — so the
      // result is deliberately ignored and the form releases immediately.
      void navegar(rutaInicialPara(sesion.usuario.rol), { replace: true });
    } catch (motivo) {
      establecerError(
        motivo instanceof ErrorDeApi ? mensajeDeError(motivo).mensaje : "No se pudo iniciar sesión.",
      );
    } finally {
      establecerEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(evento: FormEvent<HTMLFormElement>) => void manejarEnvio(evento)}
      className="formulario"
    >
      <h1>Ingresar</h1>
      {motivo !== null && <p role="status">{MENSAJE_POR_MOTIVO[motivo]}</p>}
      <Etiqueta htmlFor="nombreUsuario">Usuario</Etiqueta>
      <CampoTexto id="nombreUsuario" value={nombreUsuario} onCambiar={establecerNombreUsuario} />
      {/*
        Wrapped so the toggle is not a direct child of `.formulario`, whose
        `> .boton` rule reserves 24px of air above the step's PRIMARY action.
        Same shape as `EscanerDeMac`: field, then its own button beside it in
        normal flow. `Boton` already carries the guarded 48px touch target.
      */}
      <div>
        <Etiqueta htmlFor="contrasena">Contraseña</Etiqueta>
        <CampoTexto
          id="contrasena"
          type={contrasenaVisible ? "text" : "password"}
          value={contrasena}
          onCambiar={establecerContrasena}
        />
        {/*
          The label carries the state, so there is no `aria-pressed` here and
          no modifier class — unlike the estado filter chips, whose labels
          name a filter and therefore cannot change. Announcing "Ocultar
          contraseña, presionado" would state the same fact twice, in opposite
          directions. There is no icon set in this app, so this is text.
        */}
        <Boton
          type="button"
          className="boton--secundario"
          onClick={() => establecerContrasenaVisible((visible) => !visible)}
        >
          {contrasenaVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
        </Boton>
      </div>
      {error !== null && <p role="alert">{error}</p>}
      <Boton type="submit" disabled={enviando}>
        Ingresar
      </Boton>
    </form>
  );
}
