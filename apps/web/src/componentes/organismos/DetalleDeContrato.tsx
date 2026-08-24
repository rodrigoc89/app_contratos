import type { DatosContratoDetalle, DatosDocumentoDisponible } from "@contratos/esquemas";

import { Boton } from "../atomos/Boton";
import { InsigniaDeEstado } from "./estadoDeContrato";

/**
 * The office's contract detail — presentational only. It takes the contract
 * and a download callback; fetching the PDF lives in the container, because
 * `componentes/` may not import `datos/` (`convencionDeCapas.spec.ts`).
 *
 * This is also the screen `darDeBaja`, `anular` and `registrarRestitucion`
 * will land on: they are implemented and tested in the domain today and
 * reachable from nowhere. The layout leaves them a place rather than
 * pretending the screen is finished.
 */

const NOMBRE_DOCUMENTO: Record<DatosDocumentoDisponible["documento"], string> = {
  comodato: "Comodato",
  condiciones_generales: "Condiciones generales",
};

const SIN_VALOR = "—";

/**
 * The wire's `tipo` is an enum for machines. Nobody reads `equipos_restituidos`
 * off a screen and thinks in those terms, so every state the API can name gets
 * a Spanish phrase here — UI copy, like the rest of what the office reads.
 */
const NOMBRE_EVENTO: Record<DatosContratoDetalle["eventos"][number]["tipo"], string> = {
  creado: "Creado",
  firmado: "Firmado",
  dado_de_baja: "Dado de baja",
  anulado: "Anulado",
  equipos_restituidos: "Equipos restituidos",
};

export interface PropiedadesDetalleDeContrato {
  readonly contrato: DatosContratoDetalle;
  readonly onDescargar: (documento: DatosDocumentoDisponible) => void;
  /** The document currently being fetched, if any — one download at a time. */
  readonly descargando?: DatosDocumentoDisponible["documento"] | undefined;
}

/**
 * design-system-migration PR17b (D4) — office-panel section shape, ported
 * from the retired `.detalle-contrato__*` rules (panel.css) and redesigned
 * in TablaDeContratos' (PR15) language: quiet uppercase section labels with
 * a rule under them, muted metadata, rounded-base cards. Local `CLASE_*`
 * constants, same shape PR15/PR17 used for their own JSX call sites.
 */
const CLASE_CABECERA = "mb-4 flex flex-wrap items-center gap-3 border-b-2 border-primario pb-3";
const CLASE_TITULO = "m-0 text-[1.75rem] font-bold tracking-tight";
const CLASE_PENDIENTE =
  "mb-4 rounded-base border border-estado-baja-texto bg-estado-baja-fondo p-3 font-semibold text-estado-baja-texto";
const CLASE_SECCION = "mb-5";
const CLASE_TITULO_SECCION = "mb-3 text-xs font-bold uppercase tracking-wide text-texto-suave";
const CLASE_DATOS = "m-0 grid gap-3 tableta:grid-cols-2 tableta:gap-x-5 escritorio:grid-cols-3";
const CLASE_DATO_ETIQUETA = "text-[0.8125rem] font-semibold text-texto-suave";
const CLASE_DATO_VALOR = "m-0 font-semibold";
const CLASE_DOCUMENTOS = "m-0 flex list-none flex-wrap gap-3 p-0";
const CLASE_HISTORIAL = "m-0 list-none p-0";
const CLASE_EVENTO = "border-t border-borde-suave py-3 first:border-t-0 first:pt-0";
const CLASE_EVENTO_LINEA = "m-0 flex flex-wrap items-baseline gap-2";
const CLASE_EVENTO_HECHO = "font-bold";
const CLASE_EVENTO_META = "text-[0.8125rem] text-texto-suave";
const CLASE_EVENTO_DETALLE = "mt-1 border-l-2 border-borde-suave pl-3 text-texto-suave";

function Dato({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }) {
  return (
    <div>
      <dt className={CLASE_DATO_ETIQUETA}>{etiqueta}</dt>
      <dd className={CLASE_DATO_VALOR}>{valor}</dd>
    </div>
  );
}

export function DetalleDeContrato({
  contrato,
  onDescargar,
  descargando,
}: PropiedadesDetalleDeContrato) {
  const { comodatario, equipos, plazo } = contrato;

  return (
    <article>
      <header className={CLASE_CABECERA}>
        <h1 className={CLASE_TITULO}>
          {contrato.numero === null ? "Contrato sin número" : `Contrato N° ${contrato.numero}`}
        </h1>
        <InsigniaDeEstado estado={contrato.estado} />
      </header>

      {/*
        The one operational flag on this screen: company hardware still at the
        home of someone who is no longer a customer (DESIGN.md §3). It is an
        alert rather than another row of data because it is the only thing
        here that asks anyone to do something.
      */}
      {contrato.equiposPendientesDeRestitucion && (
        <p role="alert" className={CLASE_PENDIENTE}>
          El equipo todavía no fue restituido.
        </p>
      )}

      <section className={CLASE_SECCION}>
        <h2 className={CLASE_TITULO_SECCION}>Comodatario</h2>
        <dl className={CLASE_DATOS}>
          <Dato etiqueta="Nombre completo" valor={comodatario.nombreCompleto} />
          <Dato etiqueta="DNI" valor={comodatario.dni} />
          <Dato etiqueta="Domicilio" valor={`${comodatario.domicilioCalle}, ${comodatario.ciudad}`} />
          <Dato etiqueta="Provincia" valor={comodatario.provincia} />
          <Dato etiqueta="WhatsApp" valor={comodatario.whatsapp} />
        </dl>
      </section>

      <section className={CLASE_SECCION}>
        <h2 className={CLASE_TITULO_SECCION}>Equipos</h2>
        <dl className={CLASE_DATOS}>
          <Dato etiqueta="Antena" valor={equipos.antenaModelo} />
          <Dato etiqueta="MAC" valor={equipos.antenaMac} />
          <Dato etiqueta="PoE" valor={equipos.poe ? "Sí" : "No"} />
          <Dato etiqueta="Caño" valor={`${equipos.canoMetros} m`} />
        </dl>
      </section>

      <section className={CLASE_SECCION}>
        <h2 className={CLASE_TITULO_SECCION}>Plazo</h2>
        <dl className={CLASE_DATOS}>
          <Dato etiqueta="Fecha de firma" valor={contrato.fechaFirma ?? SIN_VALOR} />
          <Dato etiqueta="Duración" valor={plazo === null ? SIN_VALOR : `${plazo.meses} meses`} />
          <Dato etiqueta="Vencimiento" valor={plazo?.fechaVencimiento ?? SIN_VALOR} />
        </dl>
      </section>

      <section className={CLASE_SECCION}>
        <h2 className={CLASE_TITULO_SECCION}>Documentos</h2>
        {contrato.documentos.length === 0 ? (
          /*
            A draft has no sealed PDFs and the domain forbids it from having
            any, so this is the honest state rather than an empty list or a
            download that would answer 409.
          */
          <p>Todavía no hay documentos firmados. Se generan cuando el contrato se firma.</p>
        ) : (
          <ul className={CLASE_DOCUMENTOS}>
            {contrato.documentos.map((documento) => (
              <li key={documento.documento}>
                <Boton
                  type="button"
                  onClick={() => onDescargar(documento)}
                  disabled={descargando !== undefined}
                >
                  {descargando === documento.documento
                    ? `Descargando ${NOMBRE_DOCUMENTO[documento.documento]}…`
                    : `Descargar ${NOMBRE_DOCUMENTO[documento.documento]}`}
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        What happened to this contract, in the order it happened. It is the
        only section here that answers a question about the past, and the only
        one that names an employee.

        Absent rather than empty when there is nothing to tell: an "Historial"
        heading over a blank box reads as a screen that failed to load, and a
        contract with zero events is not a state the API produces — creating
        one records `creado`.

        Dates stay in the API's ISO form, the same as "Fecha de firma" above.
        A second date format on one screen is worse than an unfamiliar one.
      */}
      {contrato.eventos.length > 0 && (
        <section className={CLASE_SECCION} aria-labelledby="titulo-historial">
          <h2 id="titulo-historial" className={CLASE_TITULO_SECCION}>
            Historial
          </h2>
          <ol className={CLASE_HISTORIAL}>
            {contrato.eventos.map((evento, indice) => (
              // Events are append-only and never reorder, so the position is
              // a stable key — and two events of the same tipo on one
              // contract (two restitutions, say) are exactly why the tipo
              // alone is not.
              <li key={`${evento.tipo}-${indice}`} className={CLASE_EVENTO}>
                <p className={CLASE_EVENTO_LINEA}>
                  <span className={CLASE_EVENTO_HECHO}>
                    {/*
                      An unknown tipo means a server newer than this bundle.
                      Showing its raw code is ugly; dropping the event from a
                      legal history would be worse.
                    */}
                    {NOMBRE_EVENTO[evento.tipo] ?? evento.tipo}
                  </span>
                  {evento.fecha !== null && <span className={CLASE_EVENTO_META}>{evento.fecha}</span>}
                  {/*
                    Only where there is a name. `creado` and `firmado` have no
                    author and never will, and "por —" beside them would
                    invent a missing value where nothing is missing.
                  */}
                  {evento.usuario !== null && evento.usuario !== undefined && (
                    <span className={CLASE_EVENTO_META}>por {evento.usuario}</span>
                  )}
                </p>
                {evento.detalle !== null && evento.detalle !== undefined && (
                  <p className={CLASE_EVENTO_DETALLE}>{evento.detalle}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
