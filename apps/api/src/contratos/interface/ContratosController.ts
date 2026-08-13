import {
  EsquemaActualizarContrato,
  EsquemaAnular,
  EsquemaDarDeBaja,
  EsquemaRegistrarRestitucion,
  EsquemaConsultaDeContratos,
  EsquemaCrearContrato,
  EsquemaFirmarContrato,
  type DatosActualizarContrato,
  type DatosAnular,
  type DatosDarDeBaja,
  type DatosRegistrarRestitucion,
  type DatosConsultaDeContratos,
  type DatosContratoCreado,
  type DatosContratoDetalle,
  type DatosCrearContrato,
  type DatosFirmarContrato,
  type DatosListaContratos,
  type DatosPrevisualizacion,
  type TipoDocumentoFirmado,
} from "@contratos/esquemas";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../http/ZodValidationPipe";
import { Roles } from "../../identidad/interface/decorators/Roles";
import { UsuarioActual } from "../../identidad/interface/decorators/UsuarioActual";
import type { UsuarioAutenticado } from "../../identidad/interface/decorators/UsuarioActual";
import type { ActualizarBorrador } from "../application/ActualizarBorrador";
import type { AnularContrato } from "../application/AnularContrato";
import type { BuscarContratos } from "../application/BuscarContratos";
import type { DarDeBajaContrato } from "../application/DarDeBajaContrato";
import type { RegistrarRestitucion } from "../application/RegistrarRestitucion";
import type { ConsultarContrato } from "../application/ConsultarContrato";
import type { CrearBorrador } from "../application/CrearBorrador";
import type { DescargarDocumento } from "../application/DescargarDocumento";
import type { FirmarContrato } from "../application/FirmarContrato";
import type { DirectorioDeAutores } from "../application/ports/DirectorioDeAutores";
import type { Reloj } from "../application/ports/Reloj";
import type { PrevisualizarContrato } from "../application/PrevisualizarContrato";
import type { Contrato } from "../domain/Contrato";
import {
  ACTUALIZAR_BORRADOR,
  ANULAR_CONTRATO,
  BUSCAR_CONTRATOS,
  DAR_DE_BAJA_CONTRATO,
  REGISTRAR_RESTITUCION,
  CONSULTAR_CONTRATO,
  CREAR_BORRADOR,
  DESCARGAR_DOCUMENTO,
  DIRECTORIO_DE_AUTORES,
  FIRMAR_CONTRATO,
  PREVISUALIZAR_CONTRATO,
  RELOJ_CONTRATOS,
} from "../ContratosModule.tokens";
import {
  EsquemaIdDeContrato,
  EsquemaTipoDeDocumento,
} from "./dto/parametros";
import {
  contextoDeFirmaDesde,
  firmasDesde,
  RUTA_CONTRATOS,
  vistaDeContrato,
  vistaDeContratoCreado,
  vistaDeListaContratos,
  vistaDePrevisualizacion,
} from "./dto/vistas";

/**
 * The endpoints the tablet actually calls, in the order the signing flow uses
 * them (DESIGN.md §6): create a draft, correct it, read it on screen with the
 * customer, sign it, then download what was sealed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Three rules hold across every handler here.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * **Nothing the client says about itself is trusted.** The technician comes
 * from `@UsuarioActual()`, which reads the identity `AutenticacionGuard` put
 * on the request after verifying a signature. The IP and the user agent come
 * from the request. The signing instant comes from the server clock. All four
 * end up in `ContextoDeFirma` as forensic evidence, and evidence a client
 * chose for itself is worth nothing. Only the device id and the geolocation
 * come from the body, because there is nowhere else they could come from.
 *
 * **Roles are stated per route, deliberately** (DESIGN.md §9). The technician
 * owns the signing flow. The office reads contracts and their PDFs, and owns
 * the three post-signature transitions. `admin` READS — the list, the detail
 * and the PDFs — because the list had already granted that and refusing the
 * detail protected nothing (see §9's dated note); it writes none of them.
 * Ending someone's agreement is a different question from reading it, and
 * nothing about the read decision carries over to it.
 *
 * **The status codes come from the domain, not from here.** A signed contract
 * refusing an edit, or a retried signature, raises `ConflictoDeEstado` and
 * `respuestaDeError` answers 409. A contract id that names nothing raises
 * `RecursoNoEncontrado` and answers 404. This controller throws none of them.
 */
@Controller(RUTA_CONTRATOS)
export class ContratosController {
  constructor(
    @Inject(CREAR_BORRADOR) private readonly crearBorrador: CrearBorrador,
    @Inject(ACTUALIZAR_BORRADOR)
    private readonly actualizarBorrador: ActualizarBorrador,
    @Inject(PREVISUALIZAR_CONTRATO)
    private readonly previsualizarContrato: PrevisualizarContrato,
    @Inject(FIRMAR_CONTRATO) private readonly firmarContrato: FirmarContrato,
    @Inject(CONSULTAR_CONTRATO)
    private readonly consultarContrato: ConsultarContrato,
    @Inject(DESCARGAR_DOCUMENTO)
    private readonly descargarDocumento: DescargarDocumento,
    @Inject(RELOJ_CONTRATOS) private readonly reloj: Reloj,
    @Inject(BUSCAR_CONTRATOS) private readonly buscarContratos: BuscarContratos,
    @Inject(DAR_DE_BAJA_CONTRATO)
    private readonly darDeBajaContrato: DarDeBajaContrato,
    @Inject(ANULAR_CONTRATO) private readonly anularContrato: AnularContrato,
    @Inject(REGISTRAR_RESTITUCION)
    private readonly registrarRestitucionDeEquipos: RegistrarRestitucion,
    @Inject(DIRECTORIO_DE_AUTORES)
    private readonly autores: DirectorioDeAutores,
  ) {}

  /**
   * Every route that answers a contract detail goes through here, so the
   * event history can never ship with its actors unresolved.
   *
   * The lookup lives in this layer rather than inside the use cases because
   * it is presentation: the aggregate's rules do not depend on what an id is
   * called, and threading a second return value through six use cases to
   * decorate a screen would put a display concern in the middle of the
   * domain's collaborators. `vistaDeContrato` demands the map rather than
   * defaulting it, which is what makes "went through here" a compile-time
   * fact instead of a convention.
   */
  private async detalleDe(contrato: Contrato): Promise<DatosContratoDetalle> {
    const ids = contrato.eventos
      .map((evento) => evento.usuarioId)
      .filter((usuarioId): usuarioId is string => usuarioId !== null);

    return vistaDeContrato(contrato, await this.autores.nombresPorId(ids));
  }

  /**
   * Step 2 of the flow: the technician has the customer's data and the
   * equipment. Nothing here has legal value yet — no number, no date, no
   * signature — which is what makes the tablet's autosave safe to call as
   * often as it likes.
   */
  @Roles("tecnico")
  @Post()
  async crear(
    @Body(new ZodValidationPipe(EsquemaCrearContrato))
    datos: DatosCrearContrato,
  ): Promise<DatosContratoCreado> {
    const contrato = await this.crearBorrador.ejecutar(datos);

    return vistaDeContratoCreado(contrato);
  }

  /**
   * Corrections while it is still a draft.
   *
   * `PATCH`, because either half may arrive on its own: the customer's data
   * is captured at the door and the equipment once the install is finished.
   *
   * On a signed contract this answers **409**, not 403 — the aggregate
   * refuses the edit itself (`ConflictoDeEstado`), so the rule holds no matter
   * which caller, role or future endpoint asks. A signed contract with wrong
   * data is annulled and re-signed from scratch (DESIGN.md §3).
   */
  @Roles("tecnico")
  @Patch(":id")
  async actualizar(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Body(new ZodValidationPipe(EsquemaActualizarContrato))
    datos: DatosActualizarContrato,
  ): Promise<DatosContratoDetalle> {
    const contrato = await this.actualizarBorrador.ejecutar({
      contratoId: id,
      ...(datos.comodatario === undefined
        ? {}
        : { comodatario: datos.comodatario }),
      ...(datos.equipos === undefined ? {} : { equipos: datos.equipos }),
    });

    return await this.detalleDe(contrato);
  }

  /**
   * Step 3: the customer reads the documents before signing them.
   *
   * The digital equivalent of *"previa lectura y ratificación"* in the closing
   * clause, and the design insists it must be a real step rather than a
   * checkbox. It renders from the same template version and the same values
   * the signature will seal moments later — see `PrevisualizarContrato` for
   * how that agreement is kept.
   */
  @Roles("tecnico")
  @Get(":id/previsualizacion")
  async previsualizar(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
  ): Promise<DatosPrevisualizacion> {
    return vistaDePrevisualizacion(
      await this.previsualizarContrato.ejecutar({ contratoId: id }),
    );
  }

  /**
   * Steps 4 to 6: both signatures arrive, and the server seals the contract.
   *
   * `200`, not `201`: nothing is created here. The contract already existed as
   * a draft and this transition changes its state.
   *
   * A retried request — the tablet is on a field connection and a timeout does
   * not mean the server did nothing — answers **409**. It does not double-sign
   * and does not burn a second contract number; `FirmarContrato` refuses
   * before allocating either.
   */
  @Roles("tecnico")
  @Post(":id/firmar")
  @HttpCode(200)
  async firmar(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Body(new ZodValidationPipe(EsquemaFirmarContrato))
    datos: DatosFirmarContrato,
    @UsuarioActual() tecnico: UsuarioAutenticado,
    @Ip() ip: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<DatosContratoDetalle> {
    const contrato = await this.firmarContrato.ejecutar({
      contratoId: id,
      firmas: firmasDesde(datos),
      contexto: contextoDeFirmaDesde(datos, {
        // From the verified token. Never from the body — see the class note.
        tecnicoId: tecnico.usuarioId,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        capturadoEn: this.reloj.ahora(),
      }),
    });

    return await this.detalleDe(contrato);
  }

  /**
   * The office list and search (DESIGN.md D4/D6). `oficina` and `admin` see
   * every contract, unscoped — `tecnico` is excluded from this endpoint
   * entirely, so DESIGN.md §9's deferred technician row-scoping stays open
   * and unaffected. This unscoped decision must not be generalized to
   * `tecnico` (R-2.8).
   *
   * An empty match is still 200 with `elementos: []` (R-2.7) — never 404,
   * never an error. Query-string shape and bounds are validated once by
   * `EsquemaConsultaDeContratos`, so `tamanoPagina` above 100 is rejected
   * outright rather than silently clamped.
   */
  @Roles("oficina", "admin")
  @Get()
  async listar(
    @Query(new ZodValidationPipe(EsquemaConsultaDeContratos))
    consulta: DatosConsultaDeContratos,
  ): Promise<DatosListaContratos> {
    const resultado = await this.buscarContratos.ejecutar({
      ...(consulta.termino === undefined ? {} : { termino: consulta.termino }),
      estados: consulta.estados,
      pagina: consulta.pagina,
      tamanoPagina: consulta.tamanoPagina,
    });

    return vistaDeListaContratos(resultado, consulta.pagina, consulta.tamanoPagina);
  }

  /**
   * One contract, for the tablet after signing and for the office panel.
   *
   * DESIGN.md §9 also says a technician sees only *their own* contracts. That
   * filter is not implemented: a draft records no author today (the only
   * technician a contract stores is the one in `ContextoDeFirma`, which does
   * not exist until it is signed), so enforcing it needs a schema change and
   * belongs with the office panel in Phase 2.
   */
  @Roles("tecnico", "oficina", "admin")
  @Get(":id")
  async detalle(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
  ): Promise<DatosContratoDetalle> {
    return await this.detalleDe(await this.consultarContrato.ejecutar(id));
  }

  /**
   * The three post-signature transitions (DESIGN.md §3), all `oficina` only.
   *
   * `admin` is excluded on purpose. It reads contracts — the list, the detail
   * and the PDFs — and writes none: the read boundary moved because the list
   * had already moved it, and none of that argument applies to ending
   * someone's agreement. `tecnico` is excluded too; the tablet's job is
   * creating and signing, and the replacement for an annulled contract is
   * created there as an ordinary new contract.
   *
   * **The actor never comes from the body.** It is read from the verified
   * token through `@UsuarioActual()`, exactly as the signing técnico is, and
   * the request schemas refuse a `usuarioId` field outright — a caller able
   * to name its own author would make the audit trail worth nothing.
   *
   * Each answers the updated contract, so the office screen renders the new
   * state from the response instead of re-reading it and racing itself.
   *
   * Status codes come from the domain and are not re-derived here: a
   * transition the state forbids is `ConflictoDeEstado` → 409, and a date the
   * state permits but the rule rejects is `DomainError` → 400. That
   * distinction is deliberate — 400 means a different value works, 409 means
   * no value ever will.
   */
  @Roles("oficina")
  @Post(":id/baja")
  @HttpCode(200)
  async darDeBaja(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Body(new ZodValidationPipe(EsquemaDarDeBaja)) datos: DatosDarDeBaja,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DatosContratoDetalle> {
    return await this.detalleDe(
      await this.darDeBajaContrato.ejecutar({
        contratoId: id,
        motivo: datos.motivo,
        fecha: datos.fecha,
        usuarioId: usuario.usuarioId,
      }),
    );
  }

  @Roles("oficina")
  @Post(":id/anulacion")
  @HttpCode(200)
  async anular(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Body(new ZodValidationPipe(EsquemaAnular)) datos: DatosAnular,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DatosContratoDetalle> {
    return await this.detalleDe(
      await this.anularContrato.ejecutar({
        contratoId: id,
        motivo: datos.motivo,
        fecha: datos.fecha,
        usuarioId: usuario.usuarioId,
      }),
    );
  }

  @Roles("oficina")
  @Post(":id/restitucion")
  @HttpCode(200)
  async registrarRestitucion(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Body(new ZodValidationPipe(EsquemaRegistrarRestitucion))
    datos: DatosRegistrarRestitucion,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DatosContratoDetalle> {
    return await this.detalleDe(
      await this.registrarRestitucionDeEquipos.ejecutar({
        contratoId: id,
        fecha: datos.fecha,
        usuarioId: usuario.usuarioId,
      }),
    );
  }

  /**
   * One of the two sealed PDFs.
   *
   * `:tipo` never becomes a path. It is parsed against the two-value enum
   * here, matched against the documents the aggregate actually carries in the
   * use case, and the path finally handed to the store is one the aggregate
   * validated when the contract was sealed. `AlmacenDeDocumentosEnDisco`
   * checks containment once more before reading.
   */
  @Roles("tecnico", "oficina", "admin")
  @Get(":id/documentos/:tipo")
  async descargar(
    @Param("id", new ZodValidationPipe(EsquemaIdDeContrato)) id: string,
    @Param("tipo", new ZodValidationPipe(EsquemaTipoDeDocumento))
    tipo: TipoDocumentoFirmado,
  ): Promise<StreamableFile> {
    const descarga = await this.descargarDocumento.ejecutar({
      contratoId: id,
      documento: tipo,
    });

    return new StreamableFile(descarga.contenido, {
      type: "application/pdf",
      // `attachment`, so a browser saves the legal document instead of
      // rendering it in a tab where it looks like a web page.
      disposition: `attachment; filename="${descarga.nombreArchivo}"`,
      length: descarga.contenido.byteLength,
    });
  }
}
