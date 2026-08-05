import type { RolUsuario } from "../../domain/Usuario";
import { Usuario } from "../../domain/Usuario";

/** The `usuarios` row, as Prisma hands it back on a read. */
export interface FilaUsuario {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  rol: RolUsuario;
  activo: boolean;
  hashContrasena: string;
}

export function usuarioDesdeFila(fila: FilaUsuario): Usuario {
  return Usuario.crear({
    id: fila.id,
    nombreUsuario: fila.nombreUsuario,
    nombreCompleto: fila.nombreCompleto,
    rol: fila.rol,
    activo: fila.activo,
    hashDeContrasena: fila.hashContrasena,
  });
}

/**
 * `hashDeContrasena` -> `hashContrasena` is the only rename here: the domain
 * field is spelled out for readability, the column is the short SQL-friendly
 * form the migration already committed to.
 */
export function filaDesdeUsuario(usuario: Usuario): FilaUsuario {
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    rol: usuario.rol,
    activo: usuario.activo,
    hashContrasena: usuario.hashDeContrasena,
  };
}
