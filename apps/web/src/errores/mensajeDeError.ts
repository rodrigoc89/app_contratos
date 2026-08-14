import type { ErrorDeApi } from "../datos/clienteHttp";

/**
 * DESIGN.md D7 — one error map, the only place in the client that branches
 * on `codigo`. Input is the client's own `ErrorDeApi` (DESIGN.md D3a), so
 * "verbatim" rows can read the server's own message and, for
 * `error_interno`, its correlation `referencia`.
 */
export interface MensajeDeError {
  readonly titulo: string;
  readonly mensaje: string;
  readonly accion: string;
}

const MENSAJE_GENERICO = "Ocurrió un error inesperado. Volvé a intentar.";

export function mensajeDeError(error: ErrorDeApi): MensajeDeError {
  switch (error.codigo) {
    case "conflicto_de_concurrencia":
      // The ordinary case — one writer collided with another — is retried
      // transparently by `conReintentoDeConcurrencia` and never reaches
      // this map at all. Reaching here means the retry *also* failed.
      return {
        titulo: "No se pudo guardar",
        mensaje: "El contrato se guardó desde otro lado. Actualizá los datos antes de continuar.",
        accion: "Actualizar los datos y reintentar el guardado",
      };

    case "conflicto_de_estado":
      // Context-dependent — see DESIGN.md D3a before changing this row.
      // This default message assumes the ordinary case: an autosave `PATCH`
      // arriving after the contract was already signed elsewhere.
      // `resultadoDeFirma.ts` (a later slice) intercepts this exact code
      // right after a `POST :id/firmar` call and, if a refetch shows the
      // contract `vigente`, treats it as **success** — that request never
      // reaches this map. The two 409 codes are kept as separate map
      // entries on purpose: same status, opposite remedies.
      return {
        titulo: "Este contrato ya está firmado",
        mensaje: "El contrato cambió de estado. Actualizá para ver su estado actual.",
        accion: "Actualizar y no reintentar el guardado",
      };

    case "credenciales_invalidas":
      return {
        titulo: "No se pudo iniciar sesión",
        mensaje: error.message,
        accion: "Permanecer en el inicio de sesión",
      };

    case "no_autenticado":
    case "sesion_invalida":
      return {
        titulo: "Sesión expirada",
        mensaje: "Su sesión expiró.",
        accion: "Volver al inicio de sesión",
      };

    case "sin_permiso":
      return {
        titulo: "Acción no disponible",
        mensaje: "No tiene permiso para esta acción.",
        accion: "Ocultar la acción",
      };

    case "no_encontrado":
      return {
        titulo: "Contrato no encontrado",
        mensaje: "Ese contrato no existe.",
        accion: "Volver al listado",
      };

    case "demasiadas_peticiones":
      return {
        titulo: "Demasiados intentos",
        mensaje: error.message,
        accion: "Esperar antes de reintentar",
      };

    case "validacion":
      return {
        titulo: "Revisá los datos",
        mensaje: error.message,
        accion: "Corregir el primer campo con error",
      };

    case "regla_de_negocio":
      return {
        titulo: "No se pudo completar",
        mensaje: error.message,
        accion: "Corregir y reintentar",
      };

    case "cuerpo_demasiado_grande":
      return {
        titulo: "Firma demasiado grande",
        mensaje: "La firma capturada es demasiado grande.",
        accion: "Volver a firmar",
      };

    case "error_interno":
      return {
        titulo: "Error del sistema",
        mensaje: `${MENSAJE_GENERICO} Referencia: ${error.referencia ?? "desconocida"}.`,
        accion: "Reintentar. Si persiste, informar la referencia a la oficina",
      };

    case "cuerpo_invalido":
    case "http":
    default:
      // `CuerpoDeError["error"]["codigo"]` admits any string on purpose
      // (packages/esquemas/src/respuestas.ts) — the server can answer with a
      // code this map has never seen. This default branch is the reason that
      // is safe: an unknown code still produces a usable message instead of a
      // crash or a blank screen.
      return {
        titulo: "Error inesperado",
        mensaje: MENSAJE_GENERICO,
        accion: "Reintentar",
      };
  }
}
