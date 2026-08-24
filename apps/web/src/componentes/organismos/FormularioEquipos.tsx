import type { FormEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";
import { IndicadorDePaso, PASOS_DEL_BORRADOR } from "../moleculas/IndicadorDePaso";
import {
  CLASE_ACCIONES_FORMULARIO,
  CLASE_ETIQUETA_OPCION,
  CLASE_FIELDSET_FORMULARIO,
  CLASE_FORMULARIO,
  CLASE_LEYENDA_FORMULARIO,
  CLASE_TITULO_FORMULARIO,
} from "../../estilos/formulario";
import { EscanerDeMac } from "./EscanerDeMac";

/**
 * Step 2 of the `borrador` form — `EsquemaEquipos`'s four fields
 * (packages/esquemas/src/contrato.ts). `antenaMac` is offered through
 * `EscanerDeMac` (PR16/PR18, DESIGN.md D6): the manual field stays the
 * primary, always-reachable control, and the camera scan is an assist
 * beside it, never a replacement for it.
 *
 * `poe` has no schema default on purpose — "a `false` the client never chose
 * is a statement about company equipment that nobody made." Two radios force
 * an explicit choice; an untouched field stays `undefined`, which
 * `EsquemaEquipos` refuses just like an empty text field.
 */
export interface ValoresEquipos {
  readonly antenaModelo: string;
  readonly antenaMac: string;
  readonly poe: boolean | undefined;
  readonly canoMetros: string;
}

type CampoTextoEquipos = "antenaModelo" | "antenaMac" | "canoMetros";

interface PropiedadesFormularioEquipos {
  readonly valores: ValoresEquipos;
  readonly onCambiar: (campo: CampoTextoEquipos, valor: string) => void;
  readonly onCambiarPoe: (valor: boolean) => void;
  /**
   * Task 19.1 — the only way back to the comodatario step. Editing
   * `comodatario` after the draft exists (spec's debounced-autosave
   * scenario) needs a real path there; before this task no step had one.
   */
  readonly onVolver: () => void;
  /**
   * Fires on submit. Before the draft exists this creates it (`POST
   * /contratos`); once it exists, the same submit moves into signing
   * instead — the container decides which, this organism only renders
   * whichever `etiquetaEnvio` it is given (task 19.1).
   */
  readonly onEnviar: () => void;
  readonly etiquetaEnvio: string;
  readonly error: string | null;
  readonly deshabilitado: boolean;
}

export function FormularioEquipos({
  valores,
  onCambiar,
  onCambiarPoe,
  onVolver,
  onEnviar,
  etiquetaEnvio,
  error,
  deshabilitado,
}: PropiedadesFormularioEquipos) {
  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onEnviar();
  }

  return (
    <form onSubmit={manejarEnvio} className={CLASE_FORMULARIO} data-formulario>
      <IndicadorDePaso pasos={PASOS_DEL_BORRADOR} actual={2} />
      <h1 className={CLASE_TITULO_FORMULARIO}>Nuevo contrato</h1>
      <Etiqueta htmlFor="antenaModelo">Modelo de antena</Etiqueta>
      <CampoTexto
        id="antenaModelo"
        value={valores.antenaModelo}
        onCambiar={(valor) => onCambiar("antenaModelo", valor)}
        disabled={deshabilitado}
      />
      <EscanerDeMac
        valor={valores.antenaMac}
        onCambiar={(valor) => onCambiar("antenaMac", valor)}
        deshabilitado={deshabilitado}
      />
      <fieldset className={CLASE_FIELDSET_FORMULARIO}>
        <legend className={CLASE_LEYENDA_FORMULARIO}>¿Se entregó inyector PoE?</legend>
        <Etiqueta className={CLASE_ETIQUETA_OPCION}>
          <input
            type="radio"
            name="poe"
            checked={valores.poe === true}
            onChange={() => onCambiarPoe(true)}
            disabled={deshabilitado}
          />
          Sí
        </Etiqueta>
        <Etiqueta className={CLASE_ETIQUETA_OPCION}>
          <input
            type="radio"
            name="poe"
            checked={valores.poe === false}
            onChange={() => onCambiarPoe(false)}
            disabled={deshabilitado}
          />
          No
        </Etiqueta>
      </fieldset>
      <Etiqueta htmlFor="canoMetros">Metros de caño</Etiqueta>
      <CampoTexto
        id="canoMetros"
        value={valores.canoMetros}
        onCambiar={(valor) => onCambiar("canoMetros", valor)}
        disabled={deshabilitado}
      />
      {error !== null && <p role="alert">{error}</p>}
      <div className={CLASE_ACCIONES_FORMULARIO}>
        {/*
          Going back and committing are not the same act, and they used to be
          the same button. The secondary one loses the fill rather than the
          primary gaining one: PR #53's note holds — a filled button carries
          more presence than an outlined one on a tablet in direct sun, so
          the fill belongs to the action that matters.
        */}
        <Boton type="button" variante="secundario" onClick={onVolver} disabled={deshabilitado}>
          Volver
        </Boton>
        <Boton type="submit" disabled={deshabilitado}>
          {etiquetaEnvio}
        </Boton>
      </div>
    </form>
  );
}
