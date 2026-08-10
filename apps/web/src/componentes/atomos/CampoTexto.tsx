import type { ChangeEvent, InputHTMLAttributes } from "react";

interface PropiedadesCampoTexto extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  readonly onCambiar: (valor: string) => void;
}

export function CampoTexto({ onCambiar, type = "text", ...resto }: PropiedadesCampoTexto) {
  function manejarCambio(evento: ChangeEvent<HTMLInputElement>) {
    onCambiar(evento.target.value);
  }

  return <input type={type} {...resto} className="campo-texto" onChange={manejarCambio} />;
}
