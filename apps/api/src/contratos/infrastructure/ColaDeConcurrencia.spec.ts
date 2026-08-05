import { describe, expect, it } from "vitest";

import { ColaDeConcurrencia } from "./ColaDeConcurrencia";

function diferido<T>(): {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
} {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

describe("ColaDeConcurrencia", () => {
  it("rejects a maximum below 1", () => {
    expect(() => new ColaDeConcurrencia(0)).toThrow(/entero mayor o igual a 1/);
  });

  it("rejects a non-integer maximum", () => {
    expect(() => new ColaDeConcurrencia(1.5)).toThrow(/entero mayor o igual a 1/);
  });

  it("runs a single task and returns its result", async () => {
    const cola = new ColaDeConcurrencia(1);

    await expect(cola.ejecutar(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it("propagates a task's rejection", async () => {
    const cola = new ColaDeConcurrencia(1);

    await expect(
      cola.ejecutar(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });

  it("never runs more tasks at once than the configured maximum", async () => {
    const cola = new ColaDeConcurrencia(2);
    let activos = 0;
    let picoDeActivos = 0;
    const bloqueos = [diferido<void>(), diferido<void>(), diferido<void>()];

    const tareas = bloqueos.map((bloqueo, indice) =>
      cola.ejecutar(async () => {
        activos += 1;
        picoDeActivos = Math.max(picoDeActivos, activos);
        await bloqueo.promesa;
        activos -= 1;
        return indice;
      }),
    );

    // Give the microtask queue a turn so the first two tasks actually start.
    await Promise.resolve();
    await Promise.resolve();

    expect(activos).toBe(2); // maximum respected, third task still queued

    bloqueos[0]!.resolver();
    await Promise.resolve();
    await Promise.resolve();

    bloqueos[1]!.resolver();
    bloqueos[2]!.resolver();

    const resultados = await Promise.all(tareas);

    expect(resultados).toEqual([0, 1, 2]);
    expect(picoDeActivos).toBe(2);
  });

  it("runs queued tasks even after an earlier task in the queue fails", async () => {
    const cola = new ColaDeConcurrencia(1);

    const primera = cola.ejecutar(() => Promise.reject(new Error("falla")));
    const segunda = cola.ejecutar(() => Promise.resolve("ok"));

    await expect(primera).rejects.toThrow("falla");
    await expect(segunda).resolves.toBe("ok");
  });

  it("serialises tasks one at a time when the maximum is 1", async () => {
    const cola = new ColaDeConcurrencia(1);
    const orden: number[] = [];
    const bloqueo = diferido<void>();

    const primera = cola.ejecutar(async () => {
      orden.push(1);
      await bloqueo.promesa;
      orden.push(2);
    });
    const segunda = cola.ejecutar(async () => {
      orden.push(3);
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(orden).toEqual([1]); // second task has not started yet

    bloqueo.resolver();
    await Promise.all([primera, segunda]);

    expect(orden).toEqual([1, 2, 3]);
  });
});
