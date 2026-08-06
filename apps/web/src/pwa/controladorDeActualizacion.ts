import { crearControladorDeActualizacion } from "./actualizacion";
import { hayTrabajoEnCurso } from "./trabajoEnCurso";

/**
 * The one real, app-wide instance — same module-singleton pattern as
 * `datos/sesion/estadoSesion.ts`. Kept separate from `crearControladorDeActualizacion`
 * itself so that factory stays a pure, dependency-free function for
 * `actualizacion.spec.ts` to test directly.
 */
export const controladorDeActualizacion = crearControladorDeActualizacion(hayTrabajoEnCurso);
