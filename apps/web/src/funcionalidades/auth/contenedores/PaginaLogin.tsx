import { EsquemaLogin } from "@contratos/esquemas";
import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { CampoTexto } from "../../../componentes/atomos/CampoTexto";
import { Etiqueta } from "../../../componentes/atomos/Etiqueta";
import { MarcaProducto } from "../../../componentes/atomos/MarcaProducto";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { CLASE_FORMULARIO, CLASE_TITULO_FORMULARIO } from "../../../estilos/formulario";
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
    /*
      `/login` renders with no layout shell around it (`rutas.tsx`), so the
      form sat against the top edge with the screen empty below it.
      `CLASE_FORMULARIO` (`estilos/formulario.ts`) already centres
      horizontally, so this wrapper adds only the vertical axis; `min-h-dvh`
      uses the dynamic viewport unit so a phone's collapsing browser chrome
      does not leave the form drifting off-centre mid-scroll.
    */
    <div className="flex min-h-dvh items-center justify-center">
      <form
        onSubmit={(evento: FormEvent<HTMLFormElement>) => void manejarEnvio(evento)}
        className={CLASE_FORMULARIO}
        data-formulario
      >
        <MarcaProducto />
        <h1 className={CLASE_TITULO_FORMULARIO}>Ingresar</h1>
        {motivo !== null && <p role="status">{MENSAJE_POR_MOTIVO[motivo]}</p>}
        <Etiqueta htmlFor="nombreUsuario">Usuario</Etiqueta>
        <CampoTexto id="nombreUsuario" value={nombreUsuario} onCambiar={establecerNombreUsuario} />
        {/* No longer wrapped for `.formulario > .boton`'s sake (retired) —
            kept as the toggle's own group, no behaviour change. */}
        <div>
          <Etiqueta htmlFor="contrasena">Contraseña</Etiqueta>
          {/*
            The toggle sits inside the field's right edge rather than below
            it. `relative` is what the absolutely-positioned control is
            measured against, and `pr-28` keeps a long password from running
            underneath it.
          */}
          <div className="relative">
            <CampoTexto
              id="contrasena"
              type={contrasenaVisible ? "text" : "password"}
              value={contrasena}
              onCambiar={establecerContrasena}
              className="pr-28"
            />
            {/*
              The state lives in the ACCESSIBLE name, so there is no
              `aria-pressed` here and no modifier class — unlike the estado
              filter chips, whose labels name a filter and therefore cannot
              change. Announcing "Ocultar contraseña, presionado" would state
              the same fact twice, in opposite directions.

              The visible word shortens to fit inside the field; `aria-label`
              carries the full "Mostrar/Ocultar contraseña" and still flips
              with the state. `PaginaLogin.spec.tsx` queries both strings by
              accessible name, so shortening the visible text alone cannot
              silently drop the distinction.

              `fantasma` keeps the guarded 48px touch box while dropping the
              border and fill that would draw a second box inside the field.
            */}
            <Boton
              type="button"
              variante="fantasma"
              className="absolute inset-y-0 right-0 px-4"
              aria-label={contrasenaVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => establecerContrasenaVisible((visible) => !visible)}
            >
              {contrasenaVisible ? "Ocultar" : "Mostrar"}
            </Boton>
          </div>
        </div>
        {error !== null && <p role="alert">{error}</p>}
        <Boton type="submit" className="mt-6" disabled={enviando}>
          Ingresar
        </Boton>
      </form>
    </div>
  );
}
