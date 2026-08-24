import type { FormEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";
import { IndicadorDePaso, PASOS_DEL_BORRADOR } from "../moleculas/IndicadorDePaso";
import {
  CLASE_ACCIONES_FORMULARIO,
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
      {/*
        The 24px above the primary action, in the same shared row step 2 uses
        — not `mt-6` on a bare button, which is what this was and which did
        not measure 24px. `Boton` renders `inline-flex`, and an atomic
        inline-level box does not margin-collapse with the block sibling
        before it: at 390x844 (puppeteer, dev server) the last field wrapper's
        `mb-4` ended at 770.5px and the button began at 810.5px, both margins
        applying in full for a 40px gap. Step 2's identical relationship
        measured exactly 24px, because a block-level row is what lets the
        field's own margin collapse into the row's. One action still reads as
        one action inside it — the row only wraps when there are two.
      */}
      <div className={CLASE_ACCIONES_FORMULARIO}>
        <Boton type="submit" disabled={deshabilitado}>
          Continuar
        </Boton>
      </div>
    </form>
  );
}
