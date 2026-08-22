import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { verificarRender } from "./verificarRender";

const execFileAsync = promisify(execFile);

async function esHerramientaDisponible(
  comando: string,
  argumentos: readonly string[],
): Promise<boolean> {
  try {
    await execFileAsync(comando, [...argumentos]);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

/**
 * Exercises the REAL pipeline end to end: a real probe document rendered by
 * `GeneradorDeDocumentosPuppeteer` (Chromium present in CI), then the real
 * `fc-match`/`pdffonts`/`pdftotext` binaries, if present on this host, run
 * against the produced PDF.
 *
 * `fc-match`/`pdffonts`/`pdftotext` are opportunistic system tools, not
 * project dependencies — same status `pdftotext` already has in
 * `GeneradorDeDocumentosPuppeteer.integration.spec.ts`. This test is written
 * to be correct whichever way tool availability falls on the machine running
 * it: it asserts a pass when a tool is present, and asserts the driver's
 * honest "tool missing" reason when it is not — never a silent skip either
 * way.
 *
 * **What this test can and cannot prove.** It proves the pipeline wiring is
 * correct on WHATEVER host runs it (this dev machine, CI). It does NOT prove
 * anything about the eventual production VPS: that host's actual installed
 * fonts are only verified by running `pnpm --filter @contratos/api
 * verify:render` there after `deploy/provision.sh`. Real host fonts remain
 * unverifiable pre-VPS — see `deploy/README.md`.
 */
describe("verificarRender (integration, real Chromium + real render verdict — design.md D2)", () => {
  it(
    "renders a real probe document and evaluates every layer whose tool is present, reporting the rest honestly as missing",
    async () => {
      const [fcMatchDisponible, pdffontsDisponible, pdftotextDisponible] =
        await Promise.all([
          esHerramientaDisponible("fc-match", ["-V"]),
          esHerramientaDisponible("pdffonts", ["-v"]),
          esHerramientaDisponible("pdftotext", ["-v"]),
        ]);

      const resultado = await verificarRender();

      expect(resultado.verdicto.layers).toHaveLength(3);

      const capaFamilia = resultado.verdicto.layers.find(
        (capa) => capa.layer === "family-resolution",
      );
      const capaEmbedding = resultado.verdicto.layers.find(
        (capa) => capa.layer === "glyph-embedding",
      );
      const capaRoundTrip = resultado.verdicto.layers.find(
        (capa) => capa.layer === "text-round-trip",
      );

      expect(capaFamilia).toBeDefined();
      expect(capaEmbedding).toBeDefined();
      expect(capaRoundTrip).toBeDefined();

      if (fcMatchDisponible) {
        expect(resultado.herramientasFaltantes).not.toContain("fc-match");
        expect(capaFamilia?.pass).toBe(true);
      } else {
        expect(resultado.herramientasFaltantes).toContain("fc-match");
        expect(capaFamilia?.pass).toBe(false);
        expect(capaFamilia?.reason).toContain("fc-match");
      }

      if (pdffontsDisponible) {
        expect(resultado.herramientasFaltantes).not.toContain("pdffonts");
        expect(capaEmbedding?.pass).toBe(true);
      } else {
        expect(resultado.herramientasFaltantes).toContain("pdffonts");
        expect(capaEmbedding?.pass).toBe(false);
        expect(capaEmbedding?.reason).toContain("pdffonts");
      }

      if (pdftotextDisponible) {
        expect(resultado.herramientasFaltantes).not.toContain("pdftotext");
        expect(capaRoundTrip?.pass).toBe(true);
      } else {
        expect(resultado.herramientasFaltantes).toContain("pdftotext");
        expect(capaRoundTrip?.pass).toBe(false);
        expect(capaRoundTrip?.reason).toContain("pdftotext");
      }
    },
    30_000,
  );
});
