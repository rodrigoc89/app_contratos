import { describe, expect, it } from "vitest";

import { rutaInicialPara } from "./rutaInicialPara";

/**
 * R-3.1 — one pure function answers "where does this role live". No
 * rendering, no session store, no router: exercised as a plain function.
 */
describe("rutaInicialPara", () => {
  it("sends tecnico home to the tablet root", () => {
    expect(rutaInicialPara("tecnico")).toBe("/");
  });

  it("sends oficina to the contract list", () => {
    expect(rutaInicialPara("oficina")).toBe("/panel");
  });

  it("sends admin to the contract list too", () => {
    expect(rutaInicialPara("admin")).toBe("/panel");
  });

  it("sends an unrecognized role to the fallback screen, never crashing", () => {
    expect(rutaInicialPara("desconocido")).toBe("/panel-no-disponible");
  });
});
