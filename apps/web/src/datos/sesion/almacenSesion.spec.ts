import { afterEach, describe, expect, it } from "vitest";

import {
  borrarTokenDeRefrescoGuardado,
  guardarTokenDeRefresco,
  obtenerTokenDeRefrescoGuardado,
} from "./almacenSesion";

/**
 * DESIGN.md D4: the refresh token survives an OS-level kill of the PWA by
 * living in `localStorage`, layered over `estadoSesion.ts`'s in-memory-only
 * holder. This module is the one place — beyond the allowlist entry it adds
 * itself to in `convencionDeAlmacenamiento.spec.ts` — that touches
 * `localStorage` directly. It stores nothing else: no access token, no
 * signature, no form data (D8).
 */
describe("almacenSesion", () => {
  afterEach(() => {
    borrarTokenDeRefrescoGuardado();
  });

  it("starts with no saved refresh token", () => {
    expect(obtenerTokenDeRefrescoGuardado()).toBeNull();
  });

  it("returns exactly the token that was saved", () => {
    guardarTokenDeRefresco("token-de-refresco-1");

    expect(obtenerTokenDeRefrescoGuardado()).toBe("token-de-refresco-1");
  });

  it("replaces the previous token rather than merging with it", () => {
    guardarTokenDeRefresco("token-1");
    guardarTokenDeRefresco("token-2");

    expect(obtenerTokenDeRefrescoGuardado()).toBe("token-2");
  });

  it("clears back to null", () => {
    guardarTokenDeRefresco("token-de-refresco-1");

    borrarTokenDeRefrescoGuardado();

    expect(obtenerTokenDeRefrescoGuardado()).toBeNull();
  });
});
