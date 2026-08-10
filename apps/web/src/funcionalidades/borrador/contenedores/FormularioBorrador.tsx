import {
  EsquemaComodatario,
  EsquemaCrearContrato,
  EsquemaEquipos,
  type DatosContratoCreado,
} from "@contratos/esquemas";
import { useEffect, useState } from "react";

import { Spinner } from "../../../componentes/atomos/Spinner";
import { Toast } from "../../../componentes/moleculas/Toast";
import { FormularioComodatario, type ValoresComodatario } from "../../../componentes/organismos/FormularioComodatario";
import { FormularioEquipos, type ValoresEquipos } from "../../../componentes/organismos/FormularioEquipos";
import {
  guardarBorradorLocal,
  leerBorradorLocal,
  limpiarBorradorLocal,
  type DatosBorradorLocal,
} from "../../../almacenamiento/borradorLocal";
import type { ColaDeGuardado } from "../../../datos/borrador/colaDeGuardado";
import { obtenerContrato } from "../../../datos/consultas/obtenerContrato";
import { crearBorrador } from "../../../datos/borrador/crearBorrador";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { mensajeDeError } from "../../../errores/mensajeDeError";
import { tonoWebAudio } from "../infraestructura/tonoWebAudio";
import type { TonoDeConfirmacion } from "../logica/tonoDeConfirmacion";

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
  /**
   * PR26 — injection seam for the confirmation tone (design.md "The tone"),
   * same shape as `SuperficieDeFirma`/`ObservadorDeDocumento`. Production
   * leaves this unset and gets the real WebAudio implementation.
   */
  readonly tono?: TonoDeConfirmacion;
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
 * succeeds.
 *
 * Task 20.1 (overrules task 19.1's own "stop writing once created" choice —
 * see apply-progress for the full "why"): local recovery of the in-progress
 * fields stays live for the WHOLE edit-before-signing window, not just
 * before creation. Once `POST /contratos` succeeds, the draft is rewritten
 * to carry the real `contratoId` instead of the previous hardcoded `null`,
 * and every later edit keeps refreshing it. This is what makes task 20.2's
 * resume-on-mount below possible — PR19's local draft had no `contratoId`
 * to resume from at all.
 */
export function FormularioBorrador({
  onCreado,
  onContinuarAFirma,
  cola = null,
  tono = tonoWebAudio,
}: PropiedadesFormularioBorrador) {
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
  // PR26 — design.md "Toast" category: separate from `creado` on purpose.
  // `creado` keeps its existing meaning everywhere else (drives the
  // equipos-step submit label, is read on every debounced local-draft
  // write); this only tracks whether the transient confirmation toast is
  // still showing, so dismissing it never touches anything else.
  const [avisoBorradorVisible, establecerAvisoBorradorVisible] = useState(false);

  // Task 20.2 — a stored draft naming a `contratoId` is not trusted blindly:
  // it is verified against the server before it is ever shown as editable
  // again (non-negotiable — never resurrect a contract that already left
  // `borrador`, e.g. signed elsewhere while the técnico was away). `true`
  // only when there is something to verify; a brand-new visit skips this
  // state entirely and renders the form immediately, same as before.
  const [resumiendo, establecerResumiendo] = useState(
    borradorLocal !== null && borradorLocal.contratoId !== null,
  );

  useEffect(() => {
    const contratoIdARecuperar = borradorLocal?.contratoId ?? null;
    if (contratoIdARecuperar === null) {
      return;
    }
    let cancelado = false;
    const reiniciarEnBlanco = () => {
      limpiarBorradorLocal();
      establecerPaso("comodatario");
      establecerComodatario(COMODATARIO_VACIO);
      establecerEquipos(EQUIPOS_VACIO);
      establecerResumiendo(false);
    };
    void (async () => {
      try {
        const contrato = await obtenerContrato(contratoIdARecuperar);
        if (cancelado) {
          return;
        }
        if (contrato.estado !== "borrador") {
          // The contract moved on without this tablet knowing — most
          // plausibly signed from another device. Reopening it for editing
          // would be the worst outcome this task can produce.
          reiniciarEnBlanco();
          return;
        }
        const contratoRecuperado: DatosContratoCreado = { id: contrato.id, estado: contrato.estado };
        establecerCreado(contratoRecuperado);
        establecerAvisoBorradorVisible(true);
        onCreado?.(contratoRecuperado);
        establecerResumiendo(false);
      } catch {
        // Gone (`no_encontrado`), unreachable, or any other failure —
        // guessing "it is probably still fine" is exactly what the
        // constraint above forbids. Same fresh-start fallback.
        if (!cancelado) {
          reiniciarEnBlanco();
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // Runs once per mount — `borradorLocal` is read once, above, and never
    // changes for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DESIGN.md D8, "Written when: debounced on form change" — only once the
  // merged state actually parses as a full `DatosCrearContrato`
  // (`EsquemaEquipos.poe` is a required boolean, so a still-empty equipos
  // step cannot type-check yet; see apply-progress for the reasoning). This
  // is what makes `leerBorradorLocal` above ever find something to restore
  // — `guardarBorradorLocal` had no production caller anywhere before this.
  //
  // Task 20.1: no longer gated on `creado === null` — writes for the whole
  // edit-before-signing window, carrying `creado`'s real `contratoId` once
  // one exists. Gated on `!resumiendo` instead: while the mount-time
  // verification above is still in flight, the old draft's own `contratoId`
  // must not be prematurely overwritten with `null` by this debounce firing
  // first (the resume it is trying to prove would be destroyed by the very
  // write meant to preserve it).
  useEffect(() => {
    if (resumiendo) {
      return;
    }
    const temporizador = setTimeout(() => {
      const analisis = EsquemaCrearContrato.safeParse({ comodatario, equipos });
      if (analisis.success) {
        guardarBorradorLocal({ contratoId: creado?.id ?? null, paso, valores: analisis.data });
      }
    }, RETRASO_GUARDADO_LOCAL_MS);
    return () => clearTimeout(temporizador);
  }, [comodatario, equipos, paso, creado, resumiendo]);

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
      // Task 20.1 (overrules task 19.1's own choice, see apply-progress):
      // rewritten with the real `contratoId` instead of cleared. Written
      // synchronously here, not left to the debounced effect above, so an
      // app kill in the instant right after this succeeds still leaves a
      // resumable draft — not a window where neither the old write (already
      // superseded) nor the next debounced one (not yet due) has happened.
      guardarBorradorLocal({ contratoId: contrato.id, paso, valores: validacionCompleta.data });
      establecerCreado(contrato);
      establecerAvisoBorradorVisible(true);
      // DESIGN.md "The tone" — a discreet confirmation, only on an actual
      // creation (never on the resume path above). Fire-and-forget, and
      // called only after the toast state above is already set: the port
      // contract guarantees `reproducir` never throws, but this ordering
      // means even a contract-violating fake cannot hide the toast (see
      // FormularioBorrador.spec.tsx's verification-by-breaking test).
      tono.reproducir();
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

  // Task 20.2 — never renders the blank "Crear borrador" step (or a stale
  // step 2 the técnico did not actually confirm) while the stored
  // `contratoId` above is still being verified against the server.
  if (resumiendo) {
    return (
      <div role="status" className="progreso">
        <span aria-hidden="true">
          <Spinner etiqueta="Recuperando el borrador guardado" />
        </span>
        Recuperando el borrador guardado…
      </div>
    );
  }

  return (
    <>
      {creado !== null && avisoBorradorVisible && (
        <Toast
          mensaje={`Borrador creado. ID: ${creado.id}`}
          onDescartar={() => establecerAvisoBorradorVisible(false)}
        />
      )}
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
