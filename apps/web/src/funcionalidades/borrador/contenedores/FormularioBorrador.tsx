import {
  EsquemaComodatario,
  EsquemaCrearContrato,
  EsquemaEquipos,
  type DatosContratoCreado,
} from "@contratos/esquemas";
import { useEffect, useState } from "react";

import { FormularioComodatario, type ValoresComodatario } from "../../../componentes/organismos/FormularioComodatario";
import { FormularioEquipos, type ValoresEquipos } from "../../../componentes/organismos/FormularioEquipos";
import {
  guardarBorradorLocal,
  leerBorradorLocal,
  limpiarBorradorLocal,
  type DatosBorradorLocal,
} from "../../../almacenamiento/borradorLocal";
import { crearBorrador } from "../../../datos/borrador/crearBorrador";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { mensajeDeError } from "../../../errores/mensajeDeError";

const COMODATARIO_VACIO: ValoresComodatario = {
  nombreCompleto: "",
  dni: "",
  domicilioCalle: "",
  ciudad: "",
  whatsapp: "",
};

const EQUIPOS_VACIO: ValoresEquipos = {
  antenaModelo: "",
  antenaMac: "",
  poe: undefined,
  canoMetros: "",
};

type Paso = "comodatario" | "equipos";

/**
 * DESIGN.md D8 — "Written when: Debounced on form change." No exact value
 * is mandated for the local-draft write (unlike `ColaDeGuardado`'s 800 ms
 * server autosave, DESIGN.md D3); 500 ms is short enough that a kill
 * shortly after the last keystroke still has a recoverable draft, and long
 * enough that the underlying storage write does not run on every keystroke.
 */
const RETRASO_GUARDADO_LOCAL_MS = 500;

/**
 * `DatosCrearContrato["equipos"]["canoMetros"]` is `number | string`
 * (`EsquemaMetrosCano` accepts either shape and does not coerce), while this
 * form's own state always keeps it as the raw string an `<input>` yields.
 */
function equiposDesdeBorrador(valores: DatosBorradorLocal["valores"]["equipos"]): ValoresEquipos {
  return { ...valores, canoMetros: String(valores.canoMetros) };
}

export interface PropiedadesFormularioBorrador {
  /**
   * Fires once `POST /contratos` succeeds — the seam `InicioTecnico` (D10)
   * uses to move the técnico into the review step (task 7.3) without this
   * component knowing anything about what comes after it.
   */
  readonly onCreado?: (contrato: DatosContratoCreado) => void;
}

/**
 * Spec `borrador-form` — "Create draft" and "Server-side rejection after
 * client acceptance". Assembles the two presentational steps and owns
 * validation, navigation and the `POST /contratos` call — nothing here has
 * legal value yet (DESIGN.md, `ContratosController.crear`'s own comment), so
 * both steps stay entirely client-side until this submit.
 *
 * `EsquemaCrearContrato` requires both halves at once, so there is no
 * `contratoId` — and no server autosave — until this single request
 * succeeds. Local recovery of the in-progress fields is PR8's job; nothing
 * here persists anything before that request.
 */
export function FormularioBorrador({ onCreado }: PropiedadesFormularioBorrador) {
  // Read exactly once, on mount (spec `borrador-form`, "Recovery scope after
  // reload or kill") — `leerBorradorLocal` already discards anything
  // expired, malformed or version-mismatched, and structurally cannot
  // return a `firmas` field (DESIGN.md D8; proven again below).
  const [borradorLocal] = useState<DatosBorradorLocal | null>(() => leerBorradorLocal());

  const [paso, establecerPaso] = useState<Paso>(borradorLocal?.paso ?? "comodatario");
  const [comodatario, establecerComodatario] = useState<ValoresComodatario>(
    borradorLocal?.valores.comodatario ?? COMODATARIO_VACIO,
  );
  const [equipos, establecerEquipos] = useState<ValoresEquipos>(
    borradorLocal === null ? EQUIPOS_VACIO : equiposDesdeBorrador(borradorLocal.valores.equipos),
  );
  const [error, establecerError] = useState<string | null>(null);
  const [enviando, establecerEnviando] = useState(false);
  const [creado, establecerCreado] = useState<DatosContratoCreado | null>(null);

  // DESIGN.md D8, "Written when: debounced on form change" — only once the
  // merged state actually parses as a full `DatosCrearContrato`
  // (`EsquemaEquipos.poe` is a required boolean, so a still-empty equipos
  // step cannot type-check yet; see apply-progress for the reasoning). This
  // is what makes `leerBorradorLocal` above ever find something to restore
  // — `guardarBorradorLocal` had no production caller anywhere before this.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      const analisis = EsquemaCrearContrato.safeParse({ comodatario, equipos });
      if (analisis.success) {
        guardarBorradorLocal({ contratoId: null, paso, valores: analisis.data });
      }
    }, RETRASO_GUARDADO_LOCAL_MS);
    return () => clearTimeout(temporizador);
  }, [comodatario, equipos, paso]);

  function manejarCambioComodatario(campo: keyof ValoresComodatario, valor: string) {
    establecerComodatario((previo) => ({ ...previo, [campo]: valor }));
  }

  function manejarContinuar() {
    const validacion = EsquemaComodatario.safeParse(comodatario);
    if (!validacion.success) {
      establecerError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    establecerError(null);
    establecerPaso("equipos");
  }

  function manejarCambioEquipos(campo: "antenaModelo" | "antenaMac" | "canoMetros", valor: string) {
    establecerEquipos((previo) => ({ ...previo, [campo]: valor }));
  }

  function manejarCambioPoe(valor: boolean) {
    establecerEquipos((previo) => ({ ...previo, poe: valor }));
  }

  async function manejarCrear() {
    const validacionEquipos = EsquemaEquipos.safeParse(equipos);
    if (!validacionEquipos.success) {
      establecerError(validacionEquipos.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    const validacionCompleta = EsquemaCrearContrato.safeParse({
      comodatario,
      equipos: validacionEquipos.data,
    });
    if (!validacionCompleta.success) {
      establecerError(validacionCompleta.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    establecerError(null);
    establecerEnviando(true);
    try {
      const contrato = await crearBorrador(validacionCompleta.data);
      // Not one of DESIGN.md D8's originally listed clearing triggers, but a
      // deliberate addition here: once a draft exists to restore, an app
      // kill right after this succeeds (before signing) would otherwise
      // restore these already-submitted values on the *next* launch and
      // invite a duplicate `POST /contratos`. Nothing downstream of this
      // point (`EnvioDeFirma`, `PasoFirmaDual`) reads this draft at all.
      limpiarBorradorLocal();
      establecerCreado(contrato);
      onCreado?.(contrato);
    } catch (motivo) {
      // The entered values are never cleared here — a business-rule
      // rejection (`regla_de_negocio`) must let the technician correct and
      // resubmit, not retype (spec "Server-side rejection after client
      // acceptance"). `mensajeDeError` reads the code the server sent
      // verbatim for that row (DESIGN.md D7), so no auto-retry happens for
      // anything but the transparent one already inside `crearBorrador`.
      establecerError(motivo instanceof ErrorDeApi ? mensajeDeError(motivo).mensaje : "No se pudo crear el borrador.");
    } finally {
      establecerEnviando(false);
    }
  }

  if (creado !== null) {
    return (
      <p>
        Borrador creado. ID: {creado.id}
      </p>
    );
  }

  return paso === "comodatario" ? (
    <FormularioComodatario
      valores={comodatario}
      onCambiar={manejarCambioComodatario}
      onContinuar={manejarContinuar}
      error={error}
      deshabilitado={enviando}
    />
  ) : (
    <FormularioEquipos
      valores={equipos}
      onCambiar={manejarCambioEquipos}
      onCambiarPoe={manejarCambioPoe}
      onCrear={() => void manejarCrear()}
      error={error}
      deshabilitado={enviando}
    />
  );
}
