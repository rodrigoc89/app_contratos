import {
  EsquemaComodatario,
  EsquemaCrearContrato,
  EsquemaEquipos,
  type DatosContratoCreado,
} from "@contratos/esquemas";
import { useState } from "react";

import { FormularioComodatario, type ValoresComodatario } from "../../../componentes/organismos/FormularioComodatario";
import { FormularioEquipos, type ValoresEquipos } from "../../../componentes/organismos/FormularioEquipos";
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
  const [paso, establecerPaso] = useState<Paso>("comodatario");
  const [comodatario, establecerComodatario] = useState<ValoresComodatario>(COMODATARIO_VACIO);
  const [equipos, establecerEquipos] = useState<ValoresEquipos>(EQUIPOS_VACIO);
  const [error, establecerError] = useState<string | null>(null);
  const [enviando, establecerEnviando] = useState(false);
  const [creado, establecerCreado] = useState<DatosContratoCreado | null>(null);

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
