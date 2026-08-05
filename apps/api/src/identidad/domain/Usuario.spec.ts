import { describe, expect, it } from "vitest";

import { DomainError } from "../../shared/domain/DomainError";
import { Usuario } from "./Usuario";

const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGVhZG8";

function datos(overrides: Partial<Parameters<typeof Usuario.crear>[0]> = {}) {
  return {
    id: "usuario-1",
    nombreUsuario: "jperez",
    nombreCompleto: "Juan Pérez",
    rol: "tecnico" as const,
    activo: true,
    hashDeContrasena: HASH,
    ...overrides,
  };
}

describe("Usuario", () => {
  it("builds a technician from valid data", () => {
    const usuario = Usuario.crear(datos());

    expect(usuario.id).toBe("usuario-1");
    expect(usuario.nombreUsuario).toBe("jperez");
    expect(usuario.nombreCompleto).toBe("Juan Pérez");
    expect(usuario.rol).toBe("tecnico");
    expect(usuario.activo).toBe(true);
    expect(usuario.hashDeContrasena).toBe(HASH);
  });

  // Two accounts that differ only in capitalisation are the same account to
  // every human who types them, so they must be the same account here too.
  it("normalises the login name to lowercase and trims it", () => {
    expect(Usuario.crear(datos({ nombreUsuario: "  JPerez " })).nombreUsuario).toBe(
      "jperez",
    );
  });

  it("rejects a login name with spaces inside it", () => {
    expect(() => Usuario.crear(datos({ nombreUsuario: "juan perez" }))).toThrow(
      DomainError,
    );
  });

  it("rejects an empty login name, full name, id or hash", () => {
    expect(() => Usuario.crear(datos({ nombreUsuario: "   " }))).toThrow(DomainError);
    expect(() => Usuario.crear(datos({ nombreCompleto: "" }))).toThrow(DomainError);
    expect(() => Usuario.crear(datos({ id: "" }))).toThrow(DomainError);
    expect(() => Usuario.crear(datos({ hashDeContrasena: "" }))).toThrow(DomainError);
  });

  it("rejects a role outside the three the system knows", () => {
    expect(() =>
      Usuario.crear(datos({ rol: "gerente" as unknown as "admin" })),
    ).toThrow(DomainError);
  });

  it("accepts the three roles from DESIGN.md §9", () => {
    for (const rol of ["tecnico", "oficina", "admin"] as const) {
      expect(Usuario.crear(datos({ rol })).rol).toBe(rol);
    }
  });

  // Same class of leak as FirmanteComodante's signature image: rather than
  // trusting every future controller to strip the field, the entity refuses.
  it("never serialises the password hash", () => {
    const usuario = Usuario.crear(datos());

    const serializado = JSON.stringify(usuario);

    expect(serializado).not.toContain(HASH);
    expect(serializado).not.toContain("hashDeContrasena");
    expect(JSON.parse(serializado)).toEqual({
      id: "usuario-1",
      nombreUsuario: "jperez",
      nombreCompleto: "Juan Pérez",
      rol: "tecnico",
      activo: true,
    });
  });

  it("survives being nested inside another serialised object", () => {
    const serializado = JSON.stringify({ sesion: { usuario: Usuario.crear(datos()) } });

    expect(serializado).not.toContain(HASH);
  });

  it("exposes the same public summary through resumenPublico()", () => {
    const usuario = Usuario.crear(datos());

    expect(usuario.resumenPublico()).toEqual(JSON.parse(JSON.stringify(usuario)));
  });

  it("marks a deactivated user as unable to authenticate", () => {
    expect(Usuario.crear(datos({ activo: false })).puedeAutenticarse).toBe(false);
    expect(Usuario.crear(datos({ activo: true })).puedeAutenticarse).toBe(true);
  });

  it("re-hashes into a new instance without mutating the original", () => {
    const usuario = Usuario.crear(datos());
    const nuevo = usuario.conNuevoHash("$argon2id$otro");

    expect(nuevo.hashDeContrasena).toBe("$argon2id$otro");
    expect(usuario.hashDeContrasena).toBe(HASH);
    expect(nuevo.id).toBe(usuario.id);
  });

  it("desactivar() yields an inactive copy, leaving the original alone", () => {
    const usuario = Usuario.crear(datos());
    const dado = usuario.desactivar();

    expect(dado.activo).toBe(false);
    expect(usuario.activo).toBe(true);
  });
});
