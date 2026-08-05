import { DomainError } from "../../shared/domain/DomainError";
import { textoRequerido } from "../../shared/domain/texto";

/**
 * Why a refresh token was taken out of circulation.
 *
 * `rotacion` is the ordinary case — every successful refresh burns the token
 * it was given. The other three are the ones an operator actually reads in a
 * log when something went wrong.
 */
export const MOTIVOS_DE_REVOCACION = [
  "rotacion",
  "cierre_de_sesion",
  "reuso_detectado",
  "usuario_inactivo",
] as const;

export type MotivoDeRevocacion = (typeof MOTIVOS_DE_REVOCACION)[number];

export interface DatosEmisionToken {
  id: string;
  usuarioId: string;
  /**
   * All the tokens descended from one login share a family. Rotation replaces
   * a link in the chain; revoking the family kills the whole device.
   */
  familiaId: string;
  /** A digest of the token. The token itself never reaches this class. */
  hash: string;
  emitidoEn: Date;
  expiraEn: Date;
}

export interface EstadoTokenPersistido extends DatosEmisionToken {
  revocadoEn: Date | null;
  motivoDeRevocacion: MotivoDeRevocacion | null;
  reemplazadoPor: string | null;
}

/**
 * One long-lived refresh token, as stored.
 *
 * The plaintext token is never held here and never reaches the database: only
 * a digest of it does. That is what makes a lost tablet recoverable — the
 * office revokes that family and every other tablet keeps working, because
 * nothing global had to change.
 *
 * Rotation and reuse detection are two halves of one rule. Every refresh burns
 * the token it consumed and issues a successor; so a token that is presented
 * *after* it was rotated cannot have come from the legitimate device, which
 * moved on to the successor. It came from a copy, and the whole family goes.
 */
export class TokenDeRefresco {
  private _revocadoEn: Date | null = null;
  private _motivoDeRevocacion: MotivoDeRevocacion | null = null;
  private _reemplazadoPor: string | null = null;

  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly familiaId: string,
    readonly hash: string,
    private readonly emitidoEnMs: number,
    private readonly expiraEnMs: number,
  ) {}

  static emitir(datos: DatosEmisionToken): TokenDeRefresco {
    const emitidoEn = TokenDeRefresco.instanteValido(
      datos.emitidoEn,
      "emisión del token",
    );
    const expiraEn = TokenDeRefresco.instanteValido(
      datos.expiraEn,
      "vencimiento del token",
    );

    if (expiraEn <= emitidoEn) {
      throw new DomainError(
        "El vencimiento del token de refresco tiene que ser posterior a su emisión.",
      );
    }

    return new TokenDeRefresco(
      textoRequerido(datos.id, "identificador del token"),
      textoRequerido(datos.usuarioId, "usuario del token"),
      textoRequerido(datos.familiaId, "familia del token"),
      textoRequerido(datos.hash, "huella del token"),
      emitidoEn,
      expiraEn,
    );
  }

  /**
   * Rebuilds a token from stored state. **Only the persistence adapter may
   * call this.** It skips the transitions but not the invariants: a row that
   * says "revoked" with no reason is corrupt, and failing here beats handing
   * the refresh use case a token whose history nobody can read.
   */
  static rehidratar(estado: EstadoTokenPersistido): TokenDeRefresco {
    const token = TokenDeRefresco.emitir(estado);

    if (estado.revocadoEn === null) {
      if (estado.motivoDeRevocacion !== null) {
        throw new DomainError(
          `El token almacenado ${estado.id} es inconsistente: tiene motivo de revocación pero no fecha.`,
        );
      }
      token._reemplazadoPor = estado.reemplazadoPor;
      return token;
    }

    if (estado.motivoDeRevocacion === null) {
      throw new DomainError(
        `El token almacenado ${estado.id} es inconsistente: está revocado y no registra por qué.`,
      );
    }

    token._revocadoEn = new Date(
      TokenDeRefresco.instanteValido(estado.revocadoEn, "revocación del token"),
    );
    token._motivoDeRevocacion = estado.motivoDeRevocacion;
    token._reemplazadoPor = estado.reemplazadoPor;

    return token;
  }

  private static instanteValido(valor: Date, que: string): number {
    const ms = valor?.getTime?.();

    if (ms === undefined || Number.isNaN(ms)) {
      throw new DomainError(`La fecha de ${que} no es válida.`);
    }

    return ms;
  }

  // ------------------------------------------------------------- transitions

  revocar(motivo: MotivoDeRevocacion, instante: Date): void {
    if (this._revocadoEn !== null) {
      throw new DomainError(
        `El token ${this.id} ya fue revocado por "${this._motivoDeRevocacion}".`,
      );
    }

    this._revocadoEn = new Date(
      TokenDeRefresco.instanteValido(instante, "revocación del token"),
    );
    this._motivoDeRevocacion = motivo;
  }

  /** Burns this token and points at the successor that replaced it. */
  rotarPor(sucesorId: string, instante: Date): void {
    const sucesor = textoRequerido(sucesorId, "token sucesor");

    this.revocar("rotacion", instante);
    this._reemplazadoPor = sucesor;
  }

  // ----------------------------------------------------------------- queries

  get estaRevocado(): boolean {
    return this._revocadoEn !== null;
  }

  get motivoDeRevocacion(): MotivoDeRevocacion | null {
    return this._motivoDeRevocacion;
  }

  get reemplazadoPor(): string | null {
    return this._reemplazadoPor;
  }

  /** A fresh Date on every read, so stored instants cannot be moved. */
  get emitidoEn(): Date {
    return new Date(this.emitidoEnMs);
  }

  get expiraEn(): Date {
    return new Date(this.expiraEnMs);
  }

  get revocadoEn(): Date | null {
    return this._revocadoEn === null ? null : new Date(this._revocadoEn);
  }

  estaVencidoEn(instante: Date): boolean {
    return instante.getTime() > this.expiraEnMs;
  }

  esUsableEn(instante: Date): boolean {
    return !this.estaRevocado && !this.estaVencidoEn(instante);
  }

  /**
   * Serialising this entity must never carry the digest.
   *
   * The digest is what the refresh endpoint looks a token up by: leaked, it
   * tells an attacker which stolen token is still live. Same precedent as
   * `Usuario.toJSON()` and `FirmanteComodante.toJSON()` — the entity refuses
   * rather than trusting callers.
   */
  toJSON(): ResumenTokenDeRefresco {
    return {
      id: this.id,
      usuarioId: this.usuarioId,
      familiaId: this.familiaId,
      expiraEn: this.expiraEn.toISOString(),
      revocado: this.estaRevocado,
      motivoDeRevocacion: this._motivoDeRevocacion,
    };
  }
}

export interface ResumenTokenDeRefresco {
  readonly id: string;
  readonly usuarioId: string;
  readonly familiaId: string;
  readonly expiraEn: string;
  readonly revocado: boolean;
  readonly motivoDeRevocacion: MotivoDeRevocacion | null;
}
