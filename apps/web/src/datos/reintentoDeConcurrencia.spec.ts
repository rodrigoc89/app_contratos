import { describe, expect, it, vi } from "vitest";

import { ErrorDeApi } from "./clienteHttp";
import { conReintentoDeConcurrencia } from "./reintentoDeConcurrencia";

/**
 * Scenario 6 (spec `borrador-form`, DESIGN.md D3a) — the PATCH half. The
 * `firmar` half is added in PR14 once `resultadoDeFirma.ts` exists; this
 * file is written so that extension only adds tests, not a second wrapper.
 */

function errorDeApi(codigo: string, estado = 409): ErrorDeApi {
  return new ErrorDeApi(estado, { error: { mensaje: "conflicto", codigo } });
}

describe("conReintentoDeConcurrencia", () => {
  it("returns the result on the first try when nothing conflicts", async () => {
    const ejecutar = vi.fn().mockResolvedValue({ ok: true });

    const resultado = await conReintentoDeConcurrencia(ejecutar);

    expect(resultado).toEqual({ ok: true });
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on conflicto_de_concurrencia and returns the retry's result", async () => {
    const ejecutar = vi
      .fn()
      .mockRejectedValueOnce(errorDeApi("conflicto_de_concurrencia"))
      .mockResolvedValueOnce({ ok: true });

    const resultado = await conReintentoDeConcurrencia(ejecutar);

    expect(resultado).toEqual({ ok: true });
    expect(ejecutar).toHaveBeenCalledTimes(2);
  });

  it("propagates the second failure without a third attempt", async () => {
    const ejecutar = vi
      .fn()
      .mockRejectedValueOnce(errorDeApi("conflicto_de_concurrencia"))
      .mockRejectedValueOnce(errorDeApi("conflicto_de_concurrencia"));

    await expect(conReintentoDeConcurrencia(ejecutar)).rejects.toMatchObject({
      codigo: "conflicto_de_concurrencia",
    });
    expect(ejecutar).toHaveBeenCalledTimes(2);
  });

  it("never retries conflicto_de_estado — the contract is already signed, retrying would be wrong", async () => {
    const ejecutar = vi.fn().mockRejectedValue(errorDeApi("conflicto_de_estado"));

    await expect(conReintentoDeConcurrencia(ejecutar)).rejects.toMatchObject({
      codigo: "conflicto_de_estado",
    });
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("never retries an error that is not an ErrorDeApi at all", async () => {
    const ejecutar = vi.fn().mockRejectedValue(new TypeError("network down"));

    await expect(conReintentoDeConcurrencia(ejecutar)).rejects.toThrow("network down");
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });
});
