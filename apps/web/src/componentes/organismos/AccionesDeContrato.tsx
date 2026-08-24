import type { DatosContratoDetalle } from "@contratos/esquemas";
import { useState } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";

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

/**
 * design-system-migration PR17b (D4, guard 4) — ported from the retired
 * `.detalle-contrato__*` rules (panel.css). `CLASE_ACCIONES`'s `gap-8` is
 * guard 4's >=32px floor between Dar de baja and Anular, proven against this
 * real composition rather than only PR7's atom-level fixture.
 */
const CLASE_SECCION = "mb-5";
const CLASE_ACCIONES = "flex flex-wrap gap-8";
const CLASE_FORMULARIO = "max-w-[32rem] rounded-base border border-borde-suave bg-borde-suave/[0.12] p-4";
const CLASE_TITULO_FORMULARIO = "mb-3 text-[1rem] font-bold";
const CLASE_ADVERTENCIA =
  "mb-3 border-l-4 border-error bg-estado-anulado-fondo p-3 text-[0.9375rem] text-estado-anulado-texto";
const CLASE_CAMPO = "mb-3";
const CLASE_ACCIONES_CONFIRMAR = "flex flex-wrap gap-3";

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
      <section className={CLASE_SECCION}>
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
    <section className={CLASE_SECCION}>
      <h2>Acciones</h2>

      {abierto === null ? (
        <div className={CLASE_ACCIONES}>
          {esVigente && (
            <>
              <Boton type="button" onClick={() => establecerAbierto("baja")}>
                Dar de baja
              </Boton>
              {/* Marked destructive by NAME, never by position — the same
                  rule `convencionesDeEstilos.spec.ts` enforces for the
                  signature pad's Borrar/Firmar pair (guard 4). */}
              <Boton type="button" variante="destructivo" onClick={() => establecerAbierto("anulacion")}>
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
        <form className={CLASE_FORMULARIO} onSubmit={confirmar}>
          <h3 className={CLASE_TITULO_FORMULARIO}>{TITULO[abierto]}</h3>

          {abierto === "anulacion" && (
            <p role="note" className={CLASE_ADVERTENCIA}>
              Anular es para un contrato firmado con datos equivocados. El
              contrato queda archivado con su PDF, y hay que firmar uno nuevo
              con el cliente.
            </p>
          )}

          {abierto !== "restitucion" && (
            <div className={CLASE_CAMPO}>
              <Etiqueta htmlFor="motivo-transicion">Motivo</Etiqueta>
              <CampoTexto
                id="motivo-transicion"
                type="text"
                required
                maxLength={500}
                value={motivo}
                onCambiar={establecerMotivo}
              />
            </div>
          )}

          <div className={CLASE_CAMPO}>
            <Etiqueta htmlFor="fecha-transicion">Fecha</Etiqueta>
            <CampoTexto id="fecha-transicion" type="date" required value={fecha} onCambiar={establecerFecha} />
          </div>

          <div className={CLASE_ACCIONES_CONFIRMAR}>
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
