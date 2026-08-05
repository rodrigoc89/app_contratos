import { DomainError } from "../../shared/domain/DomainError";
import { textoRequerido } from "../../shared/domain/texto";

/** DESIGN.md §9. Three roles, closed set — not a free-text column. */
export const ROLES_USUARIO = ["tecnico", "oficina", "admin"] as const;

export type RolUsuario = (typeof ROLES_USUARIO)[number];

export function esRolUsuario(valor: unknown): valor is RolUsuario {
  return (
    typeof valor === "string" &&
    (ROLES_USUARIO as readonly string[]).includes(valor)
  );
}

/**
 * A login name is typed on a tablet keyboard by a technician in a hurry. No
 * spaces, no accents, no capitals — so that the account someone types is
 * always the account they meant.
 */
const NOMBRE_USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/;

export interface DatosUsuario {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  rol: RolUsuario;
  activo: boolean;
  hashDeContrasena: string;
}

export interface ResumenUsuario {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombreCompleto: string;
  readonly rol: RolUsuario;
  readonly activo: boolean;
}

/**
 * A person who can log into the system.
 *
 * This class knows nothing about argon2, JWTs, Prisma or NestJS. It holds an
 * opaque `hashDeContrasena` string and never interprets it: which algorithm
 * produced it is entirely the business of the `HashDeContrasena` port, exactly
 * as `Reloj` and `GeneradorDeDocumentos` keep time and Chromium out of the
 * contract domain.
 */
export class Usuario {
  private constructor(
    readonly id: string,
    readonly nombreUsuario: string,
    readonly nombreCompleto: string,
    readonly rol: RolUsuario,
    readonly activo: boolean,
    /**
     * The argon2id digest. Public because the login use case and the mapper
     * genuinely need it, and hiding it behind a getter would only move the
     * leak; what actually protects it is `toJSON()` below.
     */
    readonly hashDeContrasena: string,
  ) {}

  static crear(datos: DatosUsuario): Usuario {
    const nombreUsuario = textoRequerido(
      datos.nombreUsuario,
      "nombre de usuario",
    ).toLowerCase();

    if (!NOMBRE_USUARIO_VALIDO.test(nombreUsuario)) {
      throw new DomainError(
        "El nombre de usuario solo puede tener letras minúsculas, números, punto, guion y guion bajo, y entre 3 y 40 caracteres.",
      );
    }

    if (!esRolUsuario(datos.rol)) {
      throw new DomainError(
        `El rol "${String(datos.rol)}" no existe. Los roles válidos son: ${ROLES_USUARIO.join(", ")}.`,
      );
    }

    return new Usuario(
      textoRequerido(datos.id, "identificador del usuario"),
      nombreUsuario,
      textoRequerido(datos.nombreCompleto, "nombre completo del usuario"),
      datos.rol,
      datos.activo,
      textoRequerido(datos.hashDeContrasena, "contraseña del usuario"),
    );
  }

  /**
   * Whether this account may exchange a password or a refresh token for a
   * session. Checked at login *and* at every refresh, so a technician
   * deactivated while their tablet is in the field loses access within one
   * access-token lifetime rather than at the end of the refresh window.
   */
  get puedeAutenticarse(): boolean {
    return this.activo;
  }

  /** Everything about this user except the secret. */
  resumenPublico(): ResumenUsuario {
    return {
      id: this.id,
      nombreUsuario: this.nombreUsuario,
      nombreCompleto: this.nombreCompleto,
      rol: this.rol,
      activo: this.activo,
    };
  }

  /**
   * Serialising this entity must never carry the password hash.
   *
   * Same reasoning as `FirmanteComodante.toJSON()`: an offline attack on an
   * argon2id digest is slow but not impossible, and the digest reaches a log
   * line or a response body the moment one controller returns the entity
   * instead of a DTO. Rather than trusting every future controller to
   * remember, the entity refuses to serialise it at all. Code that genuinely
   * needs the digest — the login use case, the persistence mapper — reads
   * `hashDeContrasena` explicitly, which is a deliberate act.
   */
  toJSON(): ResumenUsuario {
    return this.resumenPublico();
  }

  /** A copy carrying a freshly computed digest; the original is untouched. */
  conNuevoHash(hashDeContrasena: string): Usuario {
    return Usuario.crear({ ...this.resumenPublico(), hashDeContrasena });
  }

  /** A copy that can no longer authenticate; the original is untouched. */
  desactivar(): Usuario {
    return Usuario.crear({
      ...this.resumenPublico(),
      activo: false,
      hashDeContrasena: this.hashDeContrasena,
    });
  }
}
