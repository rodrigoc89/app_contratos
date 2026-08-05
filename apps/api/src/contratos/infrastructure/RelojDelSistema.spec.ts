import { describe, expect, it } from "vitest";

import { RelojDelSistema } from "./RelojDelSistema";

describe("RelojDelSistema", () => {
  it("returns the current instant", () => {
    const antes = Date.now();
    const ahora = new RelojDelSistema().ahora().getTime();
    const despues = Date.now();

    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(despues);
  });

  it("returns a fresh Date on every call, never a frozen instant", () => {
    const reloj = new RelojDelSistema();

    const primera = reloj.ahora();
    // Mutating what ahora() returned must never affect a later reading.
    primera.setFullYear(2000);

    expect(reloj.ahora().getFullYear()).not.toBe(2000);
  });
});
