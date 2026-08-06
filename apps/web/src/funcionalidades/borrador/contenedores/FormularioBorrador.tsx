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
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
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
   * Fires once `POST /contratos` succeeds. Unchanged in meaning since task
   * 7.3: it tells the parent a draft now exists — `InicioTecnico` uses it to
   * build the ONE `ColaDeGuardado` for this contract (task 19.2) and hand it
   * back down via `cola`, below. It no longer means "move the técnico into
   * the review step" — the maintainer overruled that single-click
   * auto-transition (task 7.3's own test asserted "the form is gone, not
   * merely hidden"); see `onContinuarAFirma`.
   */
  readonly onCreado?: (contrato: DatosContratoCreado) => void;
  /**
   * Fires when the technician taps the post-creation "Continuar" action on
   * the equipos step (task 19.1) — the explicit move into signing. A
   * technician standing in a customer's home who spots a typo right after
   * "Crear borrador" needs a way back before that move, not an automatic
   * one; this is that seam.
   */
  readonly onContinuarAFirma?: () => void;
  /**
   * DESIGN.md D3 — the ONE `ColaDeGuardado` for this contract, created by
   * `InicioTecnico` the moment `onCreado` fires and handed back down here
   * (task 19.2). `null` before the draft exists — there is no `contratoId`
   * to build a queue for yet — and, deliberately, on the very first render
   * after `onCreado` fires too: the parent's own state update reaches this
   * component one render later, and an edit made in that single window is
   * not enqueued rather than sent to a half-constructed queue. Sharing this
   * ONE instance with the review step (`PasoFirmaDual`, via `EnvioDeFirma`'s
   * `crearCola` seam) — instead of each building its own — is what makes an
   * edit typed here and not yet debounced the exact same pending patch the
   * review step's own `cola.vaciar()` flushes on entry, not a second, empty
   * queue that would let a stale preview render.
   */
  readonly cola?: ColaDeGuardado | null;
}

/**
 * Spec `borrador-form` — "Create draft", "Server-side rejection after client
 * acceptance", and the debounced-autosave scenario (task 18.3/19.1/19.2,
 * maintainer decision — see apply-progress for the full "why"). Assembles
 * the two presentational steps and owns validation, navigation, the `POST
 * /contratos` call, and — once the draft exists — every subsequent edit's
 * `ColaDeGuardado.encolar` call. Nothing here has legal value until
 * `POST /contratos` succeeds (DESIGN.md, `ContratosController.crear`'s own
 * comment); after that, correcting a field is a `PATCH`, never a second
 * `POST` — `manejarCrear` only ever runs from the pre-creation submit.
 *
 * `EsquemaCrearContrato` requires both halves at once, so there is no
 * `contratoId` — and no server autosave — until this single request
 * succeeds. Local recovery of the in-progress fields (PR8) is disabled once
 * the draft exists (see the write effect below) — the server, through every
 * successful `PATCH`, is the source of truth from that point on, and a
 * technician who reloads mid-edit resumes empty rather than risking a
 * duplicate `POST /contratos` from a resurfaced pre-creation draft (open
 * item 4, `tasks`).
 */
export function FormularioBorrador({ onCreado, onContinuarAFirma, cola = null }: PropiedadesFormularioBorrador) {
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
  //
  // Task 19.1/D8 decision: gated on `creado === null`. Once the draft
  // exists, the server (through every successful `PATCH` below) is the
  // recovery mechanism, not `localStorage` — writing a post-creation draft
  // here would resurrect open item 4 (a reload restoring already-submitted
  // values with a non-null `contratoId` this component never reads back,
  // inviting a duplicate `POST /contratos`) rather than closing it.
  useEffect(() => {
    if (creado !== null) {
      return;
    }
    const temporizador = setTimeout(() => {
      const analisis = EsquemaCrearContrato.safeParse({ comodatario, equipos });
      if (analisis.success) {
        guardarBorradorLocal({ contratoId: null, paso, valores: analisis.data });
      }
    }, RETRASO_GUARDADO_LOCAL_MS);
    return () => clearTimeout(temporizador);
  }, [comodatario, equipos, paso, creado]);

  // Task 18.3 — the whole updated half, never a single field (DESIGN.md D3,
  // "encolar merges ... whole comodatario/equipos halves"). Re-validated
  // here (not just relying on `ColaDeGuardado`'s own safety-net parse)
  // because `ValoresEquipos.poe` is `boolean | undefined` while
  // `DatosActualizarContrato["equipos"]["poe"]` is a required `boolean` —
  // the type gap `EsquemaEquipos.safeParse` closes. A half that does not
  // yet parse (e.g. mid-typing a DNI) is simply not enqueued; the next
  // keystroke that DOES parse restarts the debounce, so nothing is lost.
  function encolarComodatario(nuevo: ValoresComodatario): void {
    if (cola === null) {
      return;
    }
    const analisis = EsquemaComodatario.safeParse(nuevo);
    if (analisis.success) {
      cola.encolar({ comodatario: analisis.data });
    }
  }

  function encolarEquipos(nuevo: ValoresEquipos): void {
    if (cola === null) {
      return;
    }
    const analisis = EsquemaEquipos.safeParse(nuevo);
    if (analisis.success) {
      cola.encolar({ equipos: analisis.data });
    }
  }

  function manejarCambioComodatario(campo: keyof ValoresComodatario, valor: string) {
    const nuevo = { ...comodatario, [campo]: valor };
    establecerComodatario(nuevo);
    encolarComodatario(nuevo);
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
    const nuevo = { ...equipos, [campo]: valor };
    establecerEquipos(nuevo);
    encolarEquipos(nuevo);
  }

  function manejarCambioPoe(valor: boolean) {
    const nuevo = { ...equipos, poe: valor };
    establecerEquipos(nuevo);
    encolarEquipos(nuevo);
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

  // Task 19.1 — the explicit action that replaces task 7.3's single-click
  // auto-transition. Re-validates `equipos` (the step this action lives on)
  // before leaving; `comodatario` is already re-validated on its own
  // step's "Continuar" (`manejarContinuar`, unchanged). Does not itself
  // flush `cola` — `PasoFirmaDual`, the review step this leads to, already
  // does that on entry against this SAME shared instance (task 19.2).
  function manejarContinuarAFirma() {
    const validacionEquipos = EsquemaEquipos.safeParse(equipos);
    if (!validacionEquipos.success) {
      establecerError(validacionEquipos.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    establecerError(null);
    onContinuarAFirma?.();
  }

  return (
    <>
      {creado !== null && <p role="status">Borrador creado. ID: {creado.id}</p>}
      {paso === "comodatario" ? (
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
          onVolver={() => establecerPaso("comodatario")}
          onEnviar={creado === null ? () => void manejarCrear() : manejarContinuarAFirma}
          etiquetaEnvio={creado === null ? "Crear borrador" : "Continuar"}
          error={error}
          deshabilitado={enviando}
        />
      )}
    </>
  );
}
