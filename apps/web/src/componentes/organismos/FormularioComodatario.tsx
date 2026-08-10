import type { FormEvent } from "react";

import { Boton } from "../atomos/Boton";
import { CampoTexto } from "../atomos/CampoTexto";
import { Etiqueta } from "../atomos/Etiqueta";

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
    <form onSubmit={manejarEnvio} className="formulario">
      <h2>Datos del cliente</h2>
      {CAMPOS.map(({ campo, etiqueta }) => (
        <div key={campo} className="formulario__campo">
          <Etiqueta htmlFor={campo}>{etiqueta}</Etiqueta>
          <CampoTexto
            id={campo}
            value={valores[campo]}
            onCambiar={(valor) => onCambiar(campo, valor)}
            disabled={deshabilitado}
          />
        </div>
      ))}
      {error !== null && <p role="alert">{error}</p>}
      <Boton type="submit" disabled={deshabilitado}>
        Continuar
      </Boton>
    </form>
  );
}
