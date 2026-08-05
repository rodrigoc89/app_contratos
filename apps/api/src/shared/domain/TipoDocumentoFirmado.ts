/**
 * The two documents a contract is made of.
 *
 * Lives in shared because it is not owned by any one module: the contract
 * captures a signature per document, and a template version carries the legal
 * text of each. Keeping it here is what lets `plantillas` stay independent of
 * `contratos`.
 */
export type TipoDocumentoFirmado = "condiciones_generales" | "comodato";

export const DOCUMENTOS_DEL_CONTRATO: readonly TipoDocumentoFirmado[] = [
  "condiciones_generales",
  "comodato",
];

export const NOMBRE_DOCUMENTO: Record<TipoDocumentoFirmado, string> = {
  condiciones_generales: "las condiciones generales de uso",
  comodato: "el contrato de comodato",
};
