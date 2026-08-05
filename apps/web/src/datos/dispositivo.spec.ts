import { afterEach, describe, expect, it } from "vitest";

import { obtenerDispositivoId } from "./dispositivo";

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
