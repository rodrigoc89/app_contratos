import type { FormEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";

/**
 * Step 2 of the `borrador` form — `EsquemaEquipos`'s four fields
 * (packages/esquemas/src/contrato.ts). `antenaMac` is manual entry only in
 * this slice; camera scanning ships in slice 12 (DESIGN.md D6) as an assist
 * beside this same field, never a replacement for it.
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
  readonly onCrear: () => void;
  readonly error: string | null;
  readonly deshabilitado: boolean;
}

export function FormularioEquipos({
  valores,
  onCambiar,
  onCambiarPoe,
  onCrear,
  error,
  deshabilitado,
}: PropiedadesFormularioEquipos) {
  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onCrear();
  }

  return (
    <form onSubmit={manejarEnvio}>
      <h2>Equipos entregados</h2>
      <Etiqueta htmlFor="antenaModelo">Modelo de antena</Etiqueta>
      <CampoTexto
        id="antenaModelo"
        value={valores.antenaModelo}
        onCambiar={(valor) => onCambiar("antenaModelo", valor)}
        disabled={deshabilitado}
      />
      <Etiqueta htmlFor="antenaMac">Dirección MAC de la antena</Etiqueta>
      <CampoTexto
        id="antenaMac"
        value={valores.antenaMac}
        onCambiar={(valor) => onCambiar("antenaMac", valor)}
        disabled={deshabilitado}
        placeholder="AC:8B:A9:12:34:56"
      />
      <fieldset>
        <legend>¿Se entregó inyector PoE?</legend>
        <Etiqueta>
          <input
            type="radio"
            name="poe"
            checked={valores.poe === true}
            onChange={() => onCambiarPoe(true)}
            disabled={deshabilitado}
          />
          Sí
        </Etiqueta>
        <Etiqueta>
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
      <Boton type="submit" disabled={deshabilitado}>
        Crear borrador
      </Boton>
    </form>
  );
}
