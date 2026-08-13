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

function Dato({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }) {
  return (
    <div className="detalle-contrato__dato">
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
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
    <article className="detalle-contrato">
      <header className="detalle-contrato__cabecera">
        <h1>
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
        <p role="alert" className="detalle-contrato__pendiente">
          El equipo todavía no fue restituido.
        </p>
      )}

      <section className="detalle-contrato__seccion">
        <h2>Comodatario</h2>
        <dl className="detalle-contrato__datos">
          <Dato etiqueta="Nombre completo" valor={comodatario.nombreCompleto} />
          <Dato etiqueta="DNI" valor={comodatario.dni} />
          <Dato etiqueta="Domicilio" valor={`${comodatario.domicilioCalle}, ${comodatario.ciudad}`} />
          <Dato etiqueta="Provincia" valor={comodatario.provincia} />
          <Dato etiqueta="WhatsApp" valor={comodatario.whatsapp} />
        </dl>
      </section>

      <section className="detalle-contrato__seccion">
        <h2>Equipos</h2>
        <dl className="detalle-contrato__datos">
          <Dato etiqueta="Antena" valor={equipos.antenaModelo} />
          <Dato etiqueta="MAC" valor={equipos.antenaMac} />
          <Dato etiqueta="PoE" valor={equipos.poe ? "Sí" : "No"} />
          <Dato etiqueta="Caño" valor={`${equipos.canoMetros} m`} />
        </dl>
      </section>

      <section className="detalle-contrato__seccion">
        <h2>Plazo</h2>
        <dl className="detalle-contrato__datos">
          <Dato etiqueta="Fecha de firma" valor={contrato.fechaFirma ?? SIN_VALOR} />
          <Dato etiqueta="Duración" valor={plazo === null ? SIN_VALOR : `${plazo.meses} meses`} />
          <Dato etiqueta="Vencimiento" valor={plazo?.fechaVencimiento ?? SIN_VALOR} />
        </dl>
      </section>

      <section className="detalle-contrato__seccion">
        <h2>Documentos</h2>
        {contrato.documentos.length === 0 ? (
          /*
            A draft has no sealed PDFs and the domain forbids it from having
            any, so this is the honest state rather than an empty list or a
            download that would answer 409.
          */
          <p>Todavía no hay documentos firmados. Se generan cuando el contrato se firma.</p>
        ) : (
          <ul className="detalle-contrato__documentos">
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
        <section className="detalle-contrato__seccion" aria-labelledby="titulo-historial">
          <h2 id="titulo-historial">Historial</h2>
          <ol className="detalle-contrato__historial">
            {contrato.eventos.map((evento, indice) => (
              // Events are append-only and never reorder, so the position is
              // a stable key — and two events of the same tipo on one
              // contract (two restitutions, say) are exactly why the tipo
              // alone is not.
              <li key={`${evento.tipo}-${indice}`} className="detalle-contrato__evento">
                <p className="detalle-contrato__evento-linea">
                  <span className="detalle-contrato__evento-hecho">
                    {/*
                      An unknown tipo means a server newer than this bundle.
                      Showing its raw code is ugly; dropping the event from a
                      legal history would be worse.
                    */}
                    {NOMBRE_EVENTO[evento.tipo] ?? evento.tipo}
                  </span>
                  {evento.fecha !== null && (
                    <span className="detalle-contrato__evento-fecha">{evento.fecha}</span>
                  )}
                  {/*
                    Only where there is a name. `creado` and `firmado` have no
                    author and never will, and "por —" beside them would
                    invent a missing value where nothing is missing.
                  */}
                  {evento.usuario !== null && evento.usuario !== undefined && (
                    <span className="detalle-contrato__evento-autor">por {evento.usuario}</span>
                  )}
                </p>
                {evento.detalle !== null && evento.detalle !== undefined && (
                  <p className="detalle-contrato__evento-detalle">{evento.detalle}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
