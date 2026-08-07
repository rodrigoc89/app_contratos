import { describe, expect, it } from "vitest";

import { ErrorDeApi } from "../datos/clienteHttp";
import { mensajeDeError } from "./mensajeDeError";

function error(codigo: string, mensaje = "mensaje de prueba", referencia?: string): ErrorDeApi {
  return new ErrorDeApi(400, {
    error: { mensaje, codigo, ...(referencia !== undefined ? { referencia } : {}) },
  });
}

describe("mensajeDeError", () => {
  it("maps conflicto_de_concurrencia to the retried-transparently-but-still-failed message", () => {
    const resultado = mensajeDeError(error("conflicto_de_concurrencia"));

    expect(resultado.mensaje).toMatch(/otro lado|otro dispositivo/i);
    expect(resultado.titulo.length).toBeGreaterThan(0);
    expect(resultado.accion.length).toBeGreaterThan(0);
  });

  it("maps conflicto_de_estado to the not-retried, contract-already-signed message by default", () => {
    const resultado = mensajeDeError(error("conflicto_de_estado"));

    expect(resultado.mensaje).toMatch(/firmad[oa]|estado/i);
  });

  it("passes credenciales_invalidas through verbatim, and stays on login", () => {
    const resultado = mensajeDeError(error("credenciales_invalidas", "Usuario o contraseña incorrectos."));

    expect(resultado.mensaje).toBe("Usuario o contraseña incorrectos.");
  });

  it.each(["no_autenticado", "sesion_invalida"])(
    "maps %s to a session-expired message that routes to login",
    (codigo) => {
      const resultado = mensajeDeError(error(codigo));

      expect(resultado.mensaje).toMatch(/sesión/i);
      expect(resultado.accion).toMatch(/inicio de sesión|login/i);
    },
  );

  it("maps sin_permiso to a permission message", () => {
    const resultado = mensajeDeError(error("sin_permiso"));

    expect(resultado.mensaje).toMatch(/permiso/i);
  });

  it("maps no_encontrado to a not-found message", () => {
    const resultado = mensajeDeError(error("no_encontrado"));

    expect(resultado.mensaje.length).toBeGreaterThan(0);
    expect(resultado.accion).toMatch(/listado|volver/i);
  });

  it("passes demasiadas_peticiones through verbatim — it is already technician-facing", () => {
    const resultado = mensajeDeError(
      error("demasiadas_peticiones", "Demasiados intentos seguidos. Espere un minuto y vuelva a intentar."),
    );

    expect(resultado.mensaje).toBe("Demasiados intentos seguidos. Espere un minuto y vuelva a intentar.");
  });

  it("passes validacion through verbatim, for field errors mapped elsewhere", () => {
    const resultado = mensajeDeError(error("validacion", "El DNI no es válido."));

    expect(resultado.mensaje).toBe("El DNI no es válido.");
  });

  it("passes regla_de_negocio through verbatim — the domain writes these for this exact reader", () => {
    const resultado = mensajeDeError(
      error("regla_de_negocio", "No se puede firmar un contrato ya anulado."),
    );

    expect(resultado.mensaje).toBe("No se puede firmar un contrato ya anulado.");
  });

  it("maps cuerpo_demasiado_grande to a re-sign message", () => {
    const resultado = mensajeDeError(error("cuerpo_demasiado_grande"));

    expect(resultado.mensaje).toMatch(/firma/i);
  });

  it.each(["cuerpo_invalido", "http"])("maps %s to a generic retry message", (codigo) => {
    const resultado = mensajeDeError(error(codigo));

    expect(resultado.mensaje.length).toBeGreaterThan(0);
    expect(resultado.accion.length).toBeGreaterThan(0);
  });

  it("includes the referencia verbatim for error_interno, for the technician to quote to the office", () => {
    const resultado = mensajeDeError(error("error_interno", "algo salió mal", "ref-42"));

    expect(resultado.mensaje).toContain("ref-42");
  });

  it("falls back to a usable generic message for a code it has never seen before", () => {
    const resultado = mensajeDeError(error("codigo_del_futuro_2030"));

    expect(resultado.titulo.length).toBeGreaterThan(0);
    expect(resultado.mensaje.length).toBeGreaterThan(0);
    expect(resultado.accion.length).toBeGreaterThan(0);
  });

  it("produces a distinct message per code — the map does not collapse different codes into one string", () => {
    const mensajes = new Set(
      [
        "conflicto_de_concurrencia",
        "conflicto_de_estado",
        "sin_permiso",
        "no_encontrado",
        "cuerpo_demasiado_grande",
      ].map((codigo) => mensajeDeError(error(codigo)).mensaje),
    );

    expect(mensajes.size).toBe(5);
  });
});
