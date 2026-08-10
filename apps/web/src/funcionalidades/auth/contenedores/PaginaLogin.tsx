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
  const { motivo } = estado as { motivo: unknown };
  return motivo === "sesion_expirada" || motivo === "cierre_explicito" ? motivo : null;
}

/**
 * The login screen. Validates against the shared `EsquemaLogin` before any
 * network call (spec `web-auth-session` — "Client-side login validation"),
 * then routes by role: `tecnico` reaches the guarded route tree, anyone
 * else reaches `/panel-no-disponible` directly (DESIGN.md D10) rather than
 * relying only on `GuardiaDeRolTecnico` to catch it on the next render.
 */
export function PaginaLogin() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const motivo = motivoDesdeEstado(ubicacion.state);
  const [nombreUsuario, establecerNombreUsuario] = useState("");
  const [contrasena, establecerContrasena] = useState("");
  const [error, establecerError] = useState<string | null>(null);
  const [enviando, establecerEnviando] = useState(false);

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
      navegar(sesion.usuario.rol === "tecnico" ? "/" : "/panel-no-disponible", { replace: true });
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
      {motivo !== null && <p role="status">{MENSAJE_POR_MOTIVO[motivo]}</p>}
      <Etiqueta htmlFor="nombreUsuario">Usuario</Etiqueta>
      <CampoTexto id="nombreUsuario" value={nombreUsuario} onCambiar={establecerNombreUsuario} />
      <Etiqueta htmlFor="contrasena">Contraseña</Etiqueta>
      <CampoTexto
        id="contrasena"
        type="password"
        value={contrasena}
        onCambiar={establecerContrasena}
      />
      {error !== null && <p role="alert">{error}</p>}
      <Boton type="submit" disabled={enviando}>
        Ingresar
      </Boton>
    </form>
  );
}
