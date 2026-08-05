import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { textoRequerido } from "../../shared/domain/texto";
import type { Comodatario } from "./Comodatario";
import type { ContextoDeFirma } from "./ContextoDeFirma";
import type { Equipos } from "./Equipos";
import type { FirmaCapturada, TipoDocumentoFirmado } from "./FirmaCapturada";
import { Plazo, PLAZO_ESTANDAR_MESES } from "./Plazo";

const SHA256 = /^[0-9a-f]{64}$/i;

const DOCUMENTOS_DEL_CONTRATO: readonly TipoDocumentoFirmado[] = [
  "condiciones_generales",
  "comodato",
];

const NOMBRE_DOCUMENTO: Record<TipoDocumentoFirmado, string> = {
  condiciones_generales: "las condiciones generales de uso",
  comodato: "el contrato de comodato",
};

/** A rendered PDF, frozen and hashed — the contract's actual evidence. */
export interface DocumentoContrato {
  readonly documento: TipoDocumentoFirmado;
  readonly ruta: string;
  readonly sha256: string;
}

export type EstadoContrato =
  | "borrador"
  | "vigente"
  | "dado_de_baja"
  | "anulado";

export type TipoEventoContrato =
  | "creado"
  | "firmado"
  | "dado_de_baja"
  | "anulado"
  | "equipos_restituidos";

export interface EventoContrato {
  readonly tipo: TipoEventoContrato;
  readonly fecha: FechaCalendario | null;
  readonly detalle: string | null;
}

export interface DatosBorrador {
  id: string;
  comodatario: Comodatario;
  equipos: Equipos;
  reemplazaA?: string;
}

export interface DatosFirma {
  numero: number;
  plantillaVersionId: string;
  firmanteId: string;
  fechaFirma: FechaCalendario;
  firmas: readonly FirmaCapturada[];
  contexto: ContextoDeFirma;
  plazoMeses?: number;
}

export interface DatosBaja {
  motivo: string;
  fecha: FechaCalendario;
}

export interface DatosAnulacion {
  motivo: string;
  fecha: FechaCalendario;
}

export interface DatosRestitucion {
  fecha: FechaCalendario;
}

/**
 * The comodato agreement — the aggregate root.
 *
 * Its central rule: **once signed, the contract is never edited.** The signed
 * PDF and its hash are the company's evidence that specific equipment was
 * handed to a specific person on a specific date. Everything that happens
 * afterwards — termination, annulment, restitution — is recorded *beside* the
 * signed data as state and events, never on top of it.
 *
 * A contract signed with wrong data is annulled and a new one is signed from
 * scratch. That costs a second visit to the customer, and that cost is the
 * price of the signature meaning anything.
 */
export class Contrato {
  private _estado: EstadoContrato = "borrador";
  private _numero: number | null = null;
  private _plazo: Plazo | null = null;
  private _fechaFirma: FechaCalendario | null = null;
  private _plantillaVersionId: string | null = null;
  private _firmanteId: string | null = null;
  private _motivoBaja: string | null = null;
  private _fechaBaja: FechaCalendario | null = null;
  private _motivoAnulacion: string | null = null;
  private _fechaAnulacion: FechaCalendario | null = null;
  private _fechaRestitucion: FechaCalendario | null = null;
  private _firmas: readonly FirmaCapturada[] = [];
  private _contexto: ContextoDeFirma | null = null;
  private _documentos: readonly DocumentoContrato[] = [];
  private readonly _eventos: EventoContrato[] = [];

  private constructor(
    readonly id: string,
    private _comodatario: Comodatario,
    private _equipos: Equipos,
    readonly reemplazaA: string | null,
  ) {}

  static crearBorrador(datos: DatosBorrador): Contrato {
    const contrato = new Contrato(
      textoRequerido(datos.id, "identificador del contrato"),
      datos.comodatario,
      datos.equipos,
      datos.reemplazaA ?? null,
    );
    contrato.registrar("creado", null, null);

    return contrato;
  }

  // ---------------------------------------------------------------- drafting

  actualizarComodatario(comodatario: Comodatario): void {
    this.exigirBorrador();
    this._comodatario = comodatario;
  }

  actualizarEquipos(equipos: Equipos): void {
    this.exigirBorrador();
    this._equipos = equipos;
  }

  private exigirBorrador(): void {
    if (this._estado !== "borrador") {
      throw new DomainError(
        "Un contrato firmado no se modifica: si tiene un dato mal cargado, se anula y se firma uno nuevo.",
      );
    }
  }

  // ----------------------------------------------------------------- signing

  firmar(datos: DatosFirma): void {
    if (this._estado !== "borrador") {
      throw new DomainError(
        `El contrato no se puede firmar porque ya está ${this._estado}.`,
      );
    }
    if (!Number.isInteger(datos.numero) || datos.numero <= 0) {
      throw new DomainError(
        `El número de contrato ${datos.numero} no es válido: lo asigna el servidor y tiene que ser un entero positivo.`,
      );
    }

    Contrato.exigirUnaPorDocumento(
      datos.firmas,
      (documento) => `Falta la firma de ${NOMBRE_DOCUMENTO[documento]}.`,
      "Hay más de una firma para el mismo documento.",
    );

    this._firmas = Object.freeze([...datos.firmas]);
    this._contexto = datos.contexto;
    this._numero = datos.numero;
    this._plantillaVersionId = textoRequerido(
      datos.plantillaVersionId,
      "versión de plantilla",
    );
    this._firmanteId = textoRequerido(datos.firmanteId, "firmante comodante");
    this._fechaFirma = datos.fechaFirma;
    this._plazo = Plazo.crear(
      datos.fechaFirma,
      datos.plazoMeses ?? PLAZO_ESTANDAR_MESES,
    );
    this._estado = "vigente";

    this.registrar("firmado", datos.fechaFirma, `Nº ${datos.numero}`);
  }

  /**
   * Attaches the rendered PDFs and their hashes, sealing the contract.
   *
   * Runs once, right after signing, inside the same use case: the documents
   * can only be rendered from an already-numbered and dated contract, but the
   * contract is not complete evidence until they exist. Re-sealing is refused
   * because it would swap the very artifact the hash was meant to protect.
   */
  registrarDocumentos(documentos: readonly DocumentoContrato[]): void {
    if (!this.estaFirmado) {
      throw new DomainError(
        "No se pueden registrar documentos de un borrador: todavía no hay contrato firmado.",
      );
    }
    if (this._documentos.length > 0) {
      throw new DomainError(
        "Los documentos de este contrato ya fueron registrados: volver a sellarlo reemplazaría la evidencia.",
      );
    }

    Contrato.exigirUnaPorDocumento(
      documentos,
      (documento) => `Falta el PDF de ${NOMBRE_DOCUMENTO[documento]}.`,
      "Hay más de un PDF para el mismo documento.",
    );

    for (const documento of documentos) {
      textoRequerido(documento.ruta, "ruta del documento");
      if (!SHA256.test(documento.sha256)) {
        throw new DomainError(
          `El hash "${documento.sha256}" no es un SHA-256 válido.`,
        );
      }
    }

    this._documentos = Object.freeze(
      documentos.map((documento) => Object.freeze({ ...documento })),
    );
  }

  /** Both documents of the contract must be present exactly once. */
  private static exigirUnaPorDocumento<
    T extends { documento: TipoDocumentoFirmado },
  >(
    items: readonly T[],
    faltante: (documento: TipoDocumentoFirmado) => string,
    duplicado: string,
  ): void {
    for (const documento of DOCUMENTOS_DEL_CONTRATO) {
      const encontrados = items.filter((item) => item.documento === documento);

      if (encontrados.length === 0) {
        throw new DomainError(faltante(documento));
      }
      if (encontrados.length > 1) {
        throw new DomainError(duplicado);
      }
    }
  }

  // ------------------------------------------------------ post-signature life

  darDeBaja(datos: DatosBaja): void {
    if (this._estado !== "vigente") {
      throw new DomainError(
        `Solo se puede dar de baja un contrato vigente; este está ${this._estado}.`,
      );
    }

    this._motivoBaja = textoRequerido(datos.motivo, "motivo de baja");
    this._fechaBaja = datos.fecha;
    this._estado = "dado_de_baja";

    this.registrar("dado_de_baja", datos.fecha, this._motivoBaja);
  }

  anular(datos: DatosAnulacion): void {
    if (this._estado !== "vigente") {
      throw new DomainError(
        `Solo se puede anular un contrato vigente; este está ${this._estado}.`,
      );
    }

    this._motivoAnulacion = textoRequerido(datos.motivo, "motivo de anulación");
    this._fechaAnulacion = datos.fecha;
    this._estado = "anulado";

    this.registrar("anulado", datos.fecha, this._motivoAnulacion);
  }

  registrarRestitucion(datos: DatosRestitucion): void {
    if (!this.estaFirmado) {
      throw new DomainError(
        "No se puede registrar la restitución de un borrador: todavía no se entregó nada.",
      );
    }
    if (this._fechaRestitucion !== null) {
      throw new DomainError(
        "La restitución de los equipos ya fue registrada para este contrato.",
      );
    }

    this._fechaRestitucion = datos.fecha;
    this.registrar("equipos_restituidos", datos.fecha, null);
  }

  // ----------------------------------------------------------------- queries

  get estado(): EstadoContrato {
    return this._estado;
  }

  get estaFirmado(): boolean {
    return this._estado !== "borrador";
  }

  get comodatario(): Comodatario {
    return this._comodatario;
  }

  get equipos(): Equipos {
    return this._equipos;
  }

  get numero(): number | null {
    return this._numero;
  }

  get plazo(): Plazo | null {
    return this._plazo;
  }

  get fechaFirma(): FechaCalendario | null {
    return this._fechaFirma;
  }

  get plantillaVersionId(): string | null {
    return this._plantillaVersionId;
  }

  get firmanteId(): string | null {
    return this._firmanteId;
  }

  get motivoBaja(): string | null {
    return this._motivoBaja;
  }

  get fechaBaja(): FechaCalendario | null {
    return this._fechaBaja;
  }

  get motivoAnulacion(): string | null {
    return this._motivoAnulacion;
  }

  get fechaAnulacion(): FechaCalendario | null {
    return this._fechaAnulacion;
  }

  get fechaRestitucion(): FechaCalendario | null {
    return this._fechaRestitucion;
  }

  /** The two signatures the customer gave, with their raw stroke evidence. */
  get firmas(): readonly FirmaCapturada[] {
    return this._firmas;
  }

  get contexto(): ContextoDeFirma | null {
    return this._contexto;
  }

  get documentos(): readonly DocumentoContrato[] {
    return this._documentos;
  }

  get eventos(): readonly EventoContrato[] {
    return [...this._eventos];
  }

  /**
   * Company hardware still sitting at the home of someone who is no longer a
   * customer — the report that turns this system into recovered money.
   *
   * An annulled contract does not count: it was replaced by a new one that
   * covers the very same equipment, which never left the customer's roof.
   */
  get equiposPendientesDeRestitucion(): boolean {
    return this._estado === "dado_de_baja" && this._fechaRestitucion === null;
  }

  estaVencidoAl(fecha: FechaCalendario): boolean {
    return this._plazo?.estaVencidoAl(fecha) ?? false;
  }

  private registrar(
    tipo: TipoEventoContrato,
    fecha: FechaCalendario | null,
    detalle: string | null,
  ): void {
    this._eventos.push({ tipo, fecha, detalle });
  }
}
