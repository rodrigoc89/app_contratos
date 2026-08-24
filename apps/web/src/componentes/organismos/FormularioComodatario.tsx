import type { FormEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";
import { IndicadorDePaso, PASOS_DEL_BORRADOR } from "../moleculas/IndicadorDePaso";
import {
  CLASE_CAMPO_FORMULARIO,
  CLASE_ETIQUETA_FORMULARIO,
  CLASE_FORMULARIO,
  CLASE_TITULO_FORMULARIO,
} from "../../estilos/formulario";

/**
 * Step 1 of the `borrador` form — `EsquemaComodatario`'s five fields
 * (packages/esquemas/src/contrato.ts). Presentational only (DESIGN.md D10):
 * takes controlled values and emits callbacks, never touches `datos/`. The
 * container validates against the real shared schema and owns navigation.
 */
export interface ValoresComodatario {
  readonly nombreCompleto: string;
  readonly dni: string;
  readonly domicilioCalle: string;
  readonly ciudad: string;
  readonly whatsapp: string;
}

type CampoComodatario = keyof ValoresComodatario;

interface PropiedadesFormularioComodatario {
  readonly valores: ValoresComodatario;
  readonly onCambiar: (campo: CampoComodatario, valor: string) => void;
  readonly onContinuar: () => void;
  readonly error: string | null;
  readonly deshabilitado: boolean;
}

const CAMPOS: ReadonlyArray<{ campo: CampoComodatario; etiqueta: string; tipo?: string }> = [
  { campo: "nombreCompleto", etiqueta: "Nombre y apellido" },
  { campo: "dni", etiqueta: "DNI" },
  { campo: "domicilioCalle", etiqueta: "Domicilio" },
  { campo: "ciudad", etiqueta: "Ciudad" },
  { campo: "whatsapp", etiqueta: "WhatsApp" },
];

export function FormularioComodatario({
  valores,
  onCambiar,
  onContinuar,
  error,
  deshabilitado,
}: PropiedadesFormularioComodatario) {
  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onContinuar();
  }

  return (
    <form onSubmit={manejarEnvio} className={CLASE_FORMULARIO} data-formulario>
      <IndicadorDePaso pasos={PASOS_DEL_BORRADOR} actual={1} />
      <h1 className={CLASE_TITULO_FORMULARIO}>Nuevo contrato</h1>
      {CAMPOS.map(({ campo, etiqueta }) => (
        <div key={campo} className={CLASE_CAMPO_FORMULARIO}>
          <Etiqueta htmlFor={campo} className={CLASE_ETIQUETA_FORMULARIO}>
            {etiqueta}
          </Etiqueta>
          <CampoTexto
            id={campo}
            value={valores[campo]}
            onCambiar={(valor) => onCambiar(campo, valor)}
            disabled={deshabilitado}
          />
        </div>
      ))}
      {error !== null && <p role="alert">{error}</p>}
      {/* `.formulario > .boton`'s 24px breathing room, ported directly since
          this is the step's only bare action (no `.formulario__acciones` row). */}
      <Boton type="submit" className="mt-6" disabled={deshabilitado}>
        Continuar
      </Boton>
    </form>
  );
}
