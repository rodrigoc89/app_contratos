import type { DatosContratoDetalle } from "@contratos/esquemas";
import { useState } from "react";

import { Boton } from "../atomos/Boton";

/**
 * The three post-signature transitions, as the office performs them
 * (DESIGN.md §3). Presentational: it collects the fields and calls back —
 * the request, its retry policy and the cache all live in the container.
 *
 * Only the transitions the contract's state allows are offered, which mirrors
 * the aggregate's rules on screen. The server stays the authority: the rules
 * are duplicated here to avoid offering an action that would answer 409, not
 * to decide anything. If the two ever disagree, the 409 is what wins, and it
 * is shown.
 *
 * Ending a contract is the destructive pair of this screen, so the same care
 * PR25 took over `Borrar`/`Firmar` applies: neither is a bare button. Each
 * opens a form that has to be filled in and confirmed, the reason is
 * mandatory, and `Anular` — the one that says a signed contract should never
 * have existed in this form — is marked destructive by name rather than by
 * position.
 */

export interface PropiedadesAccionesDeContrato {
  readonly contrato: DatosContratoDetalle;
  readonly onDarDeBaja: (datos: { motivo: string; fecha: string }) => void;
  readonly onAnular: (datos: { motivo: string; fecha: string }) => void;
  readonly onRegistrarRestitucion: (datos: { fecha: string }) => void;
  readonly enCurso?: boolean;
}

type FormularioAbierto = "baja" | "anulacion" | "restitucion" | null;

const TITULO: Record<Exclude<FormularioAbierto, null>, string> = {
  baja: "Dar de baja el contrato",
  anulacion: "Anular el contrato",
  restitucion: "Registrar la restitución de los equipos",
};

export function AccionesDeContrato({
  contrato,
  onDarDeBaja,
  onAnular,
  onRegistrarRestitucion,
  enCurso = false,
}: PropiedadesAccionesDeContrato) {
  const [abierto, establecerAbierto] = useState<FormularioAbierto>(null);
  const [motivo, establecerMotivo] = useState("");
  const [fecha, establecerFecha] = useState("");

  const esVigente = contrato.estado === "vigente";
  const admiteRestitucion = contrato.equiposPendientesDeRestitucion;

  function cerrar(): void {
    establecerAbierto(null);
    establecerMotivo("");
    establecerFecha("");
  }

  function confirmar(evento: React.FormEvent): void {
    evento.preventDefault();
    if (abierto === "baja") onDarDeBaja({ motivo, fecha });
    if (abierto === "anulacion") onAnular({ motivo, fecha });
    if (abierto === "restitucion") onRegistrarRestitucion({ fecha });
    cerrar();
  }

  if (!esVigente && !admiteRestitucion) {
    return (
      <section className="detalle-contrato__seccion">
        <h2>Acciones</h2>
        {/* Honest rather than empty: an office user who expected a button
            should read why there is none. */}
        <p>
          {contrato.estado === "borrador"
            ? "Este contrato todavía no se firmó."
            : "Este contrato ya está cerrado: no hay acciones pendientes."}
        </p>
      </section>
    );
  }

  return (
    <section className="detalle-contrato__seccion">
      <h2>Acciones</h2>

      {abierto === null ? (
        <div className="detalle-contrato__acciones">
          {esVigente && (
            <>
              <Boton type="button" onClick={() => establecerAbierto("baja")}>
                Dar de baja
              </Boton>
              {/* Marked destructive by NAME, never by position — the same
                  rule `convencionesDeEstilos.spec.ts` enforces for the
                  signature pad's Borrar/Firmar pair. */}
              <Boton
                type="button"
                className="boton--destructivo"
                onClick={() => establecerAbierto("anulacion")}
              >
                Anular
              </Boton>
            </>
          )}
          {admiteRestitucion && (
            <Boton type="button" onClick={() => establecerAbierto("restitucion")}>
              Registrar restitución
            </Boton>
          )}
        </div>
      ) : (
        <form className="detalle-contrato__formulario" onSubmit={confirmar}>
          <h3>{TITULO[abierto]}</h3>

          {abierto === "anulacion" && (
            <p role="note" className="detalle-contrato__advertencia">
              Anular es para un contrato firmado con datos equivocados. El
              contrato queda archivado con su PDF, y hay que firmar uno nuevo
              con el cliente.
            </p>
          )}

          {abierto !== "restitucion" && (
            <p className="campo">
              <label htmlFor="motivo-transicion">Motivo</label>
              <input
                id="motivo-transicion"
                className="campo-texto"
                type="text"
                required
                maxLength={500}
                value={motivo}
                onChange={(evento) => establecerMotivo(evento.target.value)}
              />
            </p>
          )}

          <p className="campo">
            <label htmlFor="fecha-transicion">Fecha</label>
            <input
              id="fecha-transicion"
              className="campo-texto"
              type="date"
              required
              value={fecha}
              onChange={(evento) => establecerFecha(evento.target.value)}
            />
          </p>

          <div className="detalle-contrato__acciones">
            <Boton type="submit" disabled={enCurso}>
              {enCurso ? "Guardando…" : "Confirmar"}
            </Boton>
            <Boton type="button" onClick={cerrar} disabled={enCurso}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
