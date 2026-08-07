import { EsquemaLogin } from "@contratos/esquemas";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { CampoTexto } from "../../../componentes/atomos/CampoTexto";
import { Etiqueta } from "../../../componentes/atomos/Etiqueta";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { iniciarSesion } from "../../../datos/sesion/sesion";
import { mensajeDeError } from "../../../errores/mensajeDeError";

/**
 * The login screen. Validates against the shared `EsquemaLogin` before any
 * network call (spec `web-auth-session` — "Client-side login validation"),
 * then routes by role: `tecnico` reaches the guarded route tree, anyone
 * else reaches `/panel-no-disponible` directly (DESIGN.md D10) rather than
 * relying only on `GuardiaDeRolTecnico` to catch it on the next render.
 */
export function PaginaLogin() {
  const navegar = useNavigate();
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
    <form onSubmit={(evento: FormEvent<HTMLFormElement>) => void manejarEnvio(evento)}>
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
