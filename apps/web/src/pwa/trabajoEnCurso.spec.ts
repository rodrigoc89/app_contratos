import { afterEach, describe, expect, it } from "vitest";

import { hayTrabajoEnCurso, limpiarTrabajoEnCurso, marcarTrabajoEnCurso } from "./trabajoEnCurso";

/**
 * DESIGN.md D9 — "any contract open, any signature captured, any unflushed
 * autosave" is not one boolean owned by one caller; it is a small set of
 * independent callers (`ColaDeGuardado`, `EnvioDeFirma`) each marking their
 * own concern active or inactive. This registry is the single place their
 * signals combine: work is "in progress" while at least one caller says so,
 * and only becomes false once every caller has cleared its own key.
 */
describe("trabajoEnCurso", () => {
  afterEach(() => {
    limpiarTrabajoEnCurso();
  });

  it("starts with no work in progress", () => {
    expect(hayTrabajoEnCurso()).toBe(false);
  });

  it("becomes true once a caller marks its own key active", () => {
    marcarTrabajoEnCurso("autosave:c1", true);

    expect(hayTrabajoEnCurso()).toBe(true);
  });

  it("returns to false once that same key is marked inactive again", () => {
    marcarTrabajoEnCurso("autosave:c1", true);

    marcarTrabajoEnCurso("autosave:c1", false);

    expect(hayTrabajoEnCurso()).toBe(false);
  });

  it("stays true while ANY key is still active, even after another one clears", () => {
    marcarTrabajoEnCurso("autosave:c1", true);
    marcarTrabajoEnCurso("firma:c1", true);

    marcarTrabajoEnCurso("autosave:c1", false);

    expect(hayTrabajoEnCurso()).toBe(true);
  });

  it("marking the same key active twice does not require two clears", () => {
    marcarTrabajoEnCurso("firma:c1", true);
    marcarTrabajoEnCurso("firma:c1", true);

    marcarTrabajoEnCurso("firma:c1", false);

    expect(hayTrabajoEnCurso()).toBe(false);
  });

  it("limpiarTrabajoEnCurso() clears every key at once, regardless of how many are active", () => {
    marcarTrabajoEnCurso("autosave:c1", true);
    marcarTrabajoEnCurso("firma:c1", true);

    limpiarTrabajoEnCurso();

    expect(hayTrabajoEnCurso()).toBe(false);
  });
});
