import { describe, expect, it } from "vitest";

import type { RolUsuario } from "../../domain/Usuario";
import { filaDesdeUsuario, usuarioDesdeFila } from "./UsuarioMapper";

describe("usuarioDesdeFila", () => {
  it("maps a stored row to the domain Usuario", () => {
    const usuario = usuarioDesdeFila({
      id: "usuario-1",
      nombreUsuario: "jperez",
      nombreCompleto: "Juan Pérez",
      rol: "tecnico",
      activo: true,
      hashContrasena: "hash-argon2id",
    });

    expect(usuario.id).toBe("usuario-1");
    expect(usuario.nombreUsuario).toBe("jperez");
    expect(usuario.nombreCompleto).toBe("Juan Pérez");
    expect(usuario.rol).toBe("tecnico");
    expect(usuario.activo).toBe(true);
    expect(usuario.hashDeContrasena).toBe("hash-argon2id");
  });

  it.each<RolUsuario>(["tecnico", "oficina", "admin"])(
    "round-trips the %s role through filaDesdeUsuario and back",
    (rol) => {
      const usuario = usuarioDesdeFila({
        id: "usuario-1",
        nombreUsuario: "jperez",
        nombreCompleto: "Juan Pérez",
        rol,
        activo: true,
        hashContrasena: "hash-argon2id",
      });

      const fila = filaDesdeUsuario(usuario);
      expect(fila.rol).toBe(rol);

      const rehidratado = usuarioDesdeFila(fila);
      expect(rehidratado.rol).toBe(rol);
    },
  );

  it("filaDesdeUsuario produces the plain row for a create/update", () => {
    const usuario = usuarioDesdeFila({
      id: "usuario-1",
      nombreUsuario: "jperez",
      nombreCompleto: "Juan Pérez",
      rol: "oficina",
      activo: false,
      hashContrasena: "hash-argon2id",
    });

    expect(filaDesdeUsuario(usuario)).toEqual({
      id: "usuario-1",
      nombreUsuario: "jperez",
      nombreCompleto: "Juan Pérez",
      rol: "oficina",
      activo: false,
      hashContrasena: "hash-argon2id",
    });
  });
});
