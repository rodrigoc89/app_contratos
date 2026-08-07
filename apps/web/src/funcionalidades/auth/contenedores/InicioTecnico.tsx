import { FormularioBorrador } from "../../borrador/contenedores/FormularioBorrador";

/**
 * Técnico home. Mounts the `borrador` form (PR6) so a técnico session can
 * actually reach it. Autosave, review gate and signing flow (D3, D5, D6,
 * D9–D14) land in later slices.
 */
export function InicioTecnico() {
  return <FormularioBorrador />;
}
