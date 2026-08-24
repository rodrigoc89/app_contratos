import type { ChangeEvent, InputHTMLAttributes } from "react";

import { cn } from "../../utils/cn";

interface PropiedadesCampoTexto extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  readonly onCambiar: (valor: string) => void;
}

/**
 * design-system-migration PR7 (guard 6, D6) — same `outline-none` +
 * `focus-visible:ring-*` pairing as `Boton`: focus is never silently
 * removed, only replaced by a ring that appears on `focus-visible:`, has
 * non-zero width, and resolves `--color-foco`. `min-h-toque` (D3's
 * `--spacing-toque` token) keeps the field at the touch floor, the same
 * height `atomos.css`'s retired `.campo-texto` rule declared.
 */
const CLASES_CAMPO_TEXTO =
  "block w-full min-h-toque rounded-base border-2 border-borde bg-fondo px-3 py-2 mb-4 font-sans text-base text-texto outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foco disabled:bg-borde-suave disabled:text-texto-suave";

export function CampoTexto({ onCambiar, type = "text", className, ...resto }: PropiedadesCampoTexto) {
  function manejarCambio(evento: ChangeEvent<HTMLInputElement>) {
    onCambiar(evento.target.value);
  }

  return (
    <input type={type} {...resto} className={cn(CLASES_CAMPO_TEXTO, className)} onChange={manejarCambio} />
  );
}
