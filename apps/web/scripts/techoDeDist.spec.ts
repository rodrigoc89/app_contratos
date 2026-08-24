import { describe, expect, it } from "vitest";

import {
  PISO_DE_ARCHIVOS,
  PUNTO_DE_RAMA_MIGRACION_BYTES,
  TECHO_BYTES,
  erroresDeLineaBase,
  erroresDePrecondicion,
  evaluarTecho,
  sumarBytes,
  type ArchivoMedido,
} from "./techoDeDist";

/**
 * design.md D7 — the second of the three "passes by doing nothing"
 * mechanisms `tasks.md`'s preamble names: an absent/empty `dist/` sums to 0
 * bytes, which trivially satisfies "≤ 665,600". Task 4.1 requires proving
 * the RED assertion itself — not just the implementation — catches that,
 * by first running a naive stub that would trivially pass.
 */
describe("naive-stub falsification (task 4.1)", () => {
  /** The exact stub task 4.1 names: sums whatever exists (0 on a missing
   * dir), exits 0 if ≤ 665600. Written inline so this test IS the proof. */
  function stubIngenuo(archivos: readonly ArchivoMedido[]): {
    readonly pass: boolean;
    readonly usados: number;
  } {
    const usados = archivos.reduce((total, archivo) => total + archivo.bytes, 0);
    return { pass: usados <= 665_600, usados };
  }

  it("the naive stub falsely reports a pass on a missing dist/ — 0 bytes trivially satisfies the ceiling", () => {
    const resultadoDelStub = stubIngenuo([]);

    expect(resultadoDelStub.usados).toBe(0);
    // This is the false pass task 4.1 exists to prove the real code rejects.
    expect(resultadoDelStub.pass).toBe(true);
  });

  it("the real precondition check catches exactly what the stub let through", () => {
    const errores = erroresDePrecondicion([]);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("missing or empty");
  });
});

describe("erroresDePrecondicion", () => {
  it("fails closed when dist/ is entirely absent or empty", () => {
    expect(erroresDePrecondicion([])).toEqual([
      "dist/ is missing or empty — nothing was built",
    ]);
  });

  it("fails closed when dist/ holds fewer files than the committed floor", () => {
    const pocos: ArchivoMedido[] = Array.from(
      { length: PISO_DE_ARCHIVOS - 1 },
      (_, indice) => ({ ruta: `archivo-${indice}.txt`, bytes: 10 }),
    );
    const errores = erroresDePrecondicion(pocos);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain(String(PISO_DE_ARCHIVOS - 1));
  });

  it("passes preconditions once dist/ meets the committed floor", () => {
    const suficientes: ArchivoMedido[] = Array.from(
      { length: PISO_DE_ARCHIVOS },
      (_, indice) => ({ ruta: `archivo-${indice}.txt`, bytes: 10 }),
    );

    expect(erroresDePrecondicion(suficientes)).toEqual([]);
  });
});

describe("evaluarTecho", () => {
  it("passes a build under the ceiling", () => {
    const resultado = evaluarTecho(500_000);

    expect(resultado.aprueba).toBe(true);
    expect(resultado.holguraORebase).toBe(TECHO_BYTES - 500_000);
  });

  it("fails a build over the ceiling, naming the measured byte count (task 4.2)", () => {
    const resultado = evaluarTecho(700_000);

    expect(resultado.aprueba).toBe(false);
    expect(resultado.usados).toBe(700_000);
  });

  it("treats exactly the ceiling as a pass — the scenario is '≤', not '<'", () => {
    expect(evaluarTecho(TECHO_BYTES).aprueba).toBe(true);
    expect(evaluarTecho(TECHO_BYTES + 1).aprueba).toBe(false);
  });
});

describe("sumarBytes", () => {
  it("sums the whole file list handed to it", () => {
    const archivos: ArchivoMedido[] = [
      { ruta: "index.html", bytes: 1_000 },
      { ruta: "assets/index.js", bytes: 400_000 },
      { ruta: "sw.js", bytes: 2_000 },
    ];

    expect(sumarBytes(archivos)).toBe(403_000);
  });

  it("sums to 0 over an empty list — the exact value the naive-stub trap above exploits", () => {
    expect(sumarBytes([])).toBe(0);
  });
});

/**
 * design.md D7 — a clean build at the true branch point (master @ 5c72a69,
 * before any slice landed) has a known expected value. One-time check, not
 * a per-PR gate — dist/ legitimately grows from PR1 onward.
 *
 * Reproduced during this PR: `git worktree add --detach <dir> 5c72a69`,
 * `pnpm install --frozen-lockfile`, `pnpm --filter @contratos/web build`,
 * `du -sb apps/web/dist` measured exactly 515,412 B — an exact match.
 */
describe("erroresDeLineaBase — migration branch-point re-measure (task 4.5)", () => {
  it("reports a mismatch by name instead of silently accepting a different number", () => {
    // 553,559 B is the real figure after PR1 landed Tailwind/shadcn — a
    // fixture proving a real, expected divergence is still named, not
    // silently accepted as the pre-migration number.
    const errores = erroresDeLineaBase(553_559);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("branch point changed before migration start");
    expect(errores[0]).toContain("553559");
  });

  it("passes silently when the branch point reproduces the recorded baseline exactly", () => {
    expect(erroresDeLineaBase(PUNTO_DE_RAMA_MIGRACION_BYTES)).toEqual([]);
  });

  it("the committed baseline constant is the exact value design.md D7 recorded", () => {
    expect(PUNTO_DE_RAMA_MIGRACION_BYTES).toBe(515_412);
  });
});
