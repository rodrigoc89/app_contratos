import { afterEach, describe, expect, it } from "vitest";

import { EsquemaFirmarContrato } from "@contratos/esquemas";

import { obtenerDispositivoId } from "./dispositivo";

const PNG_DE_PRUEBA = "data:image/png;base64,iVBORw0KGgo=";
const TRAZO_DE_PRUEBA = Array.from({ length: 14 }, (_, i) => ({ x: i, y: i % 4, t: i * 16 }));

/**
 * DESIGN.md D8/R8 — `dispositivoId` is the one piece of `ContextoDeFirma`
 * forensic evidence the client legitimately supplies (the technician
 * identity comes from the verified token instead, never the request body —
 * see `ContratosController.firmar`). A `crypto.randomUUID()` persisted in
 * `localStorage` survives an app kill but not a reinstall or a storage
 * clear — an accepted tradeoff, not a claim of stronger identity.
 */

const CLAVE_DISPOSITIVO_ID = "contratos.dispositivo.id";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("obtenerDispositivoId", () => {
  afterEach(() => {
    localStorage.removeItem(CLAVE_DISPOSITIVO_ID);
  });

  it("generates and persists a UUID the first time it is called", () => {
    expect(localStorage.getItem(CLAVE_DISPOSITIVO_ID)).toBeNull();

    const id = obtenerDispositivoId();

    expect(id).toMatch(REGEX_UUID);
    expect(localStorage.getItem(CLAVE_DISPOSITIVO_ID)).toBe(id);
  });

  it("returns the same id on a second call — one tablet keeps one id", () => {
    const primero = obtenerDispositivoId();
    const segundo = obtenerDispositivoId();

    expect(segundo).toBe(primero);
  });

  it("reads back a previously stored id instead of generating a new one", () => {
    localStorage.setItem(CLAVE_DISPOSITIVO_ID, "id-ya-guardado");

    expect(obtenerDispositivoId()).toBe("id-ya-guardado");
  });
});

/**
 * `crypto.randomUUID` exists ONLY in a secure context. Measured in Chromium
 * against the running dev server:
 *
 *   http://localhost:5173     isSecureContext=true   randomUUID=function
 *   http://192.168.1.5:5173   isSecureContext=false  randomUUID=undefined
 *
 * So calling it from a phone on the LAN threw `TypeError: crypto.randomUUID
 * is not a function` — inside the assembly of the signing request, before the
 * `fetch`. The técnico got "Error inesperado. No se pudo firmar el contrato",
 * the request never left the device, and the API log was clean because
 * nothing ever reached it.
 *
 * `EsquemaFirmarContrato` already states the principle this violated, about
 * the neighbouring field: *"a denied location permission must never stop an
 * installation from being closed."* A device identifier is the same kind of
 * evidence, and it must not be the thing that stops a signature either.
 *
 * `crypto.getRandomValues` is NOT secure-context restricted — verified
 * `function` and working on both origins above — so the fallback is still
 * cryptographically strong, just without the convenience wrapper.
 */
describe("obtenerDispositivoId — sin contexto seguro", () => {
  const original = globalThis.crypto.randomUUID;

  afterEach(() => {
    localStorage.removeItem(CLAVE_DISPOSITIVO_ID);
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  function quitarRandomUUID(): void {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }

  it("still produces an id when randomUUID does not exist", () => {
    quitarRandomUUID();

    const id = obtenerDispositivoId();

    expect(id).not.toBe("");
    expect(id.length).toBeLessThanOrEqual(100);
  });

  it("does not throw — a signature is never lost over a device identifier", () => {
    quitarRandomUUID();

    expect(() => obtenerDispositivoId()).not.toThrow();
  });

  it("persists the fallback id, so one tablet still keeps one id", () => {
    quitarRandomUUID();

    const primero = obtenerDispositivoId();
    const segundo = obtenerDispositivoId();

    expect(segundo).toBe(primero);
    expect(localStorage.getItem(CLAVE_DISPOSITIVO_ID)).toBe(primero);
  });

  /** Two devices must not collide, or the evidence is worth nothing. */
  it("draws the fallback from real randomness, not a constant", () => {
    quitarRandomUUID();

    const primero = obtenerDispositivoId();
    localStorage.removeItem(CLAVE_DISPOSITIVO_ID);
    const segundo = obtenerDispositivoId();

    expect(segundo).not.toBe(primero);
  });

  /**
   * The exact payload the failing request carries. If this parses, the
   * fallback id is one the server will accept.
   */
  it("produces an id the signing schema accepts", () => {
    quitarRandomUUID();

    const analisis = EsquemaFirmarContrato.safeParse({
      firmas: [
        { documento: "condiciones_generales", imagenPng: PNG_DE_PRUEBA, trazos: [TRAZO_DE_PRUEBA] },
        { documento: "comodato", imagenPng: PNG_DE_PRUEBA, trazos: [TRAZO_DE_PRUEBA] },
      ],
      dispositivoId: obtenerDispositivoId(),
    });

    expect(analisis.success).toBe(true);
  });
});
