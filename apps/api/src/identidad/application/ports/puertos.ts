import type {
  MotivoDeRevocacion,
  TokenDeRefresco,
} from "../../domain/TokenDeRefresco";
import type { ResumenUsuario, RolUsuario, Usuario } from "../../domain/Usuario";

/**
 * Everything the identity use cases need from the outside world, as ports.
 *
 * The rule this file exists to keep: `identidad/domain` and
 * `identidad/application` never import argon2, `jsonwebtoken`, `node:crypto`,
 * Prisma or `@nestjs/*`. Those all live in `identidad/infrastructure`, behind
 * the interfaces below — the same arrangement `Reloj` and
 * `GeneradorDeDocumentos` already use for the contract domain.
 *
 * Each port carries an injection token beside it because a TypeScript
 * interface has no runtime value, so NestJS cannot inject one by type.
 */

// ------------------------------------------------------------------ usuarios

export interface UsuarioRepository {
  buscarPorId(id: string): Promise<Usuario | null>;
  /** The caller passes the raw input; the adapter normalises before querying. */
  buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null>;
  /** Insert or update, keyed by id. */
  guardar(usuario: Usuario): Promise<void>;
}

export const USUARIO_REPOSITORY = Symbol("USUARIO_REPOSITORY");

// -------------------------------------------------------- tokens de refresco

export interface TokenDeRefrescoRepository {
  guardar(token: TokenDeRefresco): Promise<void>;
  buscarPorHash(hash: string): Promise<TokenDeRefresco | null>;
  /**
   * Revokes every token in the family that is still live, in one statement.
   *
   * A family-wide revocation is issued when a tablet is lost, when someone
   * logs out, and when a rotated token is presented a second time — all cases
   * where walking the chain one row at a time would leave a window open.
   * Returns how many tokens it actually took down, which is what the security
   * log reports.
   */
  revocarFamilia(
    familiaId: string,
    motivo: MotivoDeRevocacion,
    instante: Date,
  ): Promise<number>;
}

export const TOKEN_DE_REFRESCO_REPOSITORY = Symbol(
  "TOKEN_DE_REFRESCO_REPOSITORY",
);

// ------------------------------------------------------------------- hashing

export interface HashDeContrasena {
  hashear(contrasena: string): Promise<string>;
  /**
   * Constant-time-ish verification. Must not throw on a malformed digest —
   * the login use case feeds it a decoy hash on purpose (see `IniciarSesion`)
   * and needs `false`, not an exception.
   */
  verificar(hash: string, contrasena: string): Promise<boolean>;
  /**
   * A digest of no real account, for the unknown-user branch of login. Doing
   * the same work on a miss is what stops response time from answering "does
   * this username exist?".
   */
  hashSenuelo(): string;
}

export const HASH_DE_CONTRASENA = Symbol("HASH_DE_CONTRASENA");

// -------------------------------------------------------------------- tokens

/** The claims the access token carries — and the only ones anything trusts. */
export interface ClaimsDeAcceso {
  readonly usuarioId: string;
  readonly rol: RolUsuario;
}

export interface EmisorDeTokenDeAcceso {
  emitir(claims: ClaimsDeAcceso): Promise<string>;
  /** Rejects (throws) an expired, tampered or foreign-signed token. */
  verificar(token: string): Promise<ClaimsDeAcceso>;
}

export const EMISOR_DE_TOKEN_DE_ACCESO = Symbol("EMISOR_DE_TOKEN_DE_ACCESO");

export interface TokenDeRefrescoGenerado {
  /** Handed to the client exactly once, then forgotten. */
  readonly valor: string;
  /** The only half that is ever written down. */
  readonly hash: string;
}

export interface GeneradorDeTokenDeRefresco {
  generar(): TokenDeRefrescoGenerado;
  hashDe(valor: string): string;
}

export const GENERADOR_DE_TOKEN_DE_REFRESCO = Symbol(
  "GENERADOR_DE_TOKEN_DE_REFRESCO",
);

// -------------------------------------------------------------------- varios

/**
 * `contratos/application/ports/Reloj` says the same thing, and this port is
 * declared separately on purpose: `identidad` and `contratos` are independent
 * bounded contexts that happen to agree on what a clock is, and reaching
 * across for a one-method interface would couple them for nothing. Same
 * reasoning as `PrismaPlantillaRepository`'s redeclared timezone constant.
 */
export interface Reloj {
  ahora(): Date;
}

export const RELOJ_IDENTIDAD = Symbol("RELOJ_IDENTIDAD");

export interface IdentificadorUnico {
  nuevo(): string;
}

export const IDENTIFICADOR_UNICO = Symbol("IDENTIFICADOR_UNICO");

/**
 * The security audit trail.
 *
 * A port rather than a direct `console`/`Logger` call so the use cases stay
 * framework-free and so "did this actually get logged?" is something a unit
 * test can assert — token theft detection is not a feature you want to
 * discover was silently unwired.
 *
 * Implementations must never receive, and never print, a token, a password or
 * a digest.
 */
export interface RegistroDeSeguridad {
  advertir(mensaje: string, datos?: Record<string, string | number>): void;
  informar(mensaje: string, datos?: Record<string, string | number>): void;
}

export const REGISTRO_DE_SEGURIDAD = Symbol("REGISTRO_DE_SEGURIDAD");

// ------------------------------------------------------- casos de uso: forma

/** Token lifetimes, taken from `Configuracion` and passed in as plain numbers. */
export interface VidaDeTokens {
  readonly minutosDeAcceso: number;
  readonly diasDeRefresco: number;
}

/**
 * What login and refresh both answer with.
 *
 * The refresh token appears here — and only here — in plaintext: this is the
 * one moment it exists outside the client. Nothing may log this object.
 */
export interface SesionEmitida {
  readonly tokenDeAcceso: string;
  readonly expiraEnSegundos: number;
  readonly tokenDeRefresco: string;
  readonly refrescoExpiraEnSegundos: number;
  readonly usuario: ResumenUsuario;
}

/**
 * The three session use cases share one dependency bundle.
 *
 * They take it as a single constructor argument rather than as decorated
 * parameters so that `identidad/application` never imports `@nestjs/common`.
 * The module wires it with a `useFactory` provider; a unit test hands over
 * `bancoDePruebas()`.
 */
export interface DependenciasDeSesion {
  readonly usuarios: UsuarioRepository;
  readonly tokens: TokenDeRefrescoRepository;
  readonly hasher: HashDeContrasena;
  readonly emisor: EmisorDeTokenDeAcceso;
  readonly generador: GeneradorDeTokenDeRefresco;
  readonly reloj: Reloj;
  readonly ids: IdentificadorUnico;
  readonly registro: RegistroDeSeguridad;
  readonly vida: VidaDeTokens;
}

export const DEPENDENCIAS_DE_SESION = Symbol("DEPENDENCIAS_DE_SESION");
