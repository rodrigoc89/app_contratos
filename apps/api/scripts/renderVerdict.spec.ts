import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUESTED_FONT_FAMILIES,
  buildRenderVerdict,
  evaluateFamilyResolution,
  evaluateGlyphEmbedding,
  evaluateTextRoundTrip,
  type FontFamilyRequest,
  type LayerVerdict,
} from "./renderVerdict";

/**
 * Fixtures below are captured or modelled from REAL `fc-match`/`pdffonts`/
 * `pdftotext` stdout — see this PR's report for the exact commands run
 * against a real Puppeteer render on the implementing machine (fontconfig
 * 2.17.1, poppler 26.01.0). Nothing here is invented output shape; only the
 * specific substituted font names in the "fallback"/"missing" fixtures are
 * synthesized to exercise a defect this dev machine does not currently have.
 */

const PLANTILLAS = ["v1-comodato.html", "v1-condiciones-generales.html"];

/**
 * Reads `font-family: "<primary>", "<fallback>", <generic>;` declarations
 * straight out of a template, in source order.
 */
function familiasDeclaradas(plantilla: string): FontFamilyRequest[] {
  const html = readFileSync(
    join(import.meta.dirname, "../prisma/plantillas", plantilla),
    "utf-8",
  );

  return [...html.matchAll(/font-family:\s*"([^"]+)",\s*"([^"]+)"/g)].map(
    (coincidencia) => ({
      primary: coincidencia[1]!,
      fallback: coincidencia[2]!,
    }),
  );
}

describe("REQUESTED_FONT_FAMILIES", () => {
  it("is derived from what the templates actually declare, not from a copy of itself", () => {
    // Asserting the constant against a hand-written duplicate of the same
    // literal would stay green after someone changes the template's CSS —
    // and the verdict would then check a family the PDF never requests,
    // passing all three layers while every glyph renders as tofu.
    expect(familiasDeclaradas("v1-comodato.html")).toEqual([
      ...REQUESTED_FONT_FAMILIES,
    ]);
  });

  it("holds for every template, not just the one that was checked", () => {
    for (const plantilla of PLANTILLAS) {
      expect(familiasDeclaradas(plantilla), plantilla).toEqual([
        ...REQUESTED_FONT_FAMILIES,
      ]);
    }
  });
});

describe("evaluateFamilyResolution (layer 1 — fc-match)", () => {
  it("passes when fc-match resolves every requested family to itself (present)", () => {
    const verdict = evaluateFamilyResolution([
      { family: REQUESTED_FONT_FAMILIES[0]!, stdout: "Liberation Serif\n" },
      { family: REQUESTED_FONT_FAMILIES[1]!, stdout: "Liberation Sans\n" },
    ]);

    expect(verdict.layer).toBe("family-resolution");
    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("resolved to itself");
  });

  it("fails, naming the missing package, when fc-match silently substitutes the documented DejaVu fallback (fallback)", () => {
    // fc-match NEVER errors on a missing family — it returns whatever it
    // considers closest. Substituting the documented fallback is the exact
    // trap this layer exists to catch: "fc-match returned a font" is not a
    // pass, only "fc-match returned the SAME font" is.
    const verdict = evaluateFamilyResolution([
      { family: REQUESTED_FONT_FAMILIES[0]!, stdout: "DejaVu Serif\n" },
      { family: REQUESTED_FONT_FAMILIES[1]!, stdout: "Liberation Sans\n" },
    ]);

    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain(
      'substituted with its documented fallback "DejaVu Serif"',
    );
    expect(verdict.reason).toContain("fonts-liberation is most likely not installed");
  });

  it("fails, naming the unrecognized substitute, when fc-match resolves to neither the family nor its documented fallback (missing)", () => {
    // Empirically observed on the implementing machine: `fc-match
    // "Nonexistent Font XYZ 123"` returns "Noto Sans", not an error —
    // fontconfig always resolves to *something*.
    const verdict = evaluateFamilyResolution([
      { family: REQUESTED_FONT_FAMILIES[0]!, stdout: "Noto Serif\n" },
      { family: REQUESTED_FONT_FAMILIES[1]!, stdout: "Noto Sans\n" },
    ]);

    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain('unrecognized font ("Noto Serif")');
    expect(verdict.reason).toContain('unrecognized font ("Noto Sans")');
  });
});

  it("fails when a requested family was never probed at all", () => {
    // This module's own header warns that a verdict probing only the serif
    // face passes while every heading renders as tofu. `[].every()` is
    // `true`, so without this the warning describes a hole the code leaves
    // open.
    const soloSerif = evaluateFamilyResolution([
      {
        family: REQUESTED_FONT_FAMILIES[0]!,
        stdout: "Liberation Serif\n",
      },
    ]);

    expect(soloSerif.pass).toBe(false);
    expect(soloSerif.reason).toContain("Liberation Sans");
  });

  it("fails when nothing was probed, instead of passing vacuously", () => {
    const nada = evaluateFamilyResolution([]);

    expect(nada.pass).toBe(false);
    expect(nada.reason).not.toBe("");
  });

describe("evaluateGlyphEmbedding (layer 2 — pdffonts)", () => {
  // Real `pdffonts` header, captured against a probe PDF rendered by
  // GeneradorDeDocumentosPuppeteer with this exact CSS, on the implementing
  // machine.
  const HEADER =
    "name                                 type              encoding         emb sub uni object ID\n" +
    "------------------------------------ ----------------- ---------------- --- --- --- ---------\n";

  it("passes when both Liberation faces are embedded — real captured pdffonts output (present)", () => {
    const stdout =
      HEADER +
      "AAAAAA+LiberationSans-Bold           CID TrueType      Identity-H       yes yes yes      4  0\n" +
      "BAAAAA+LiberationSerif               CID TrueType      Identity-H       yes yes yes      5  0\n";

    const verdict = evaluateGlyphEmbedding(stdout);

    expect(verdict.layer).toBe("glyph-embedding");
    expect(verdict.pass).toBe(true);
  });

  it("passes when the documented DejaVu fallback is embedded instead — still a real, known-good font (fallback)", () => {
    const stdout =
      HEADER +
      "CAAAAA+DejaVuSans-Bold               CID TrueType      Identity-H       yes yes yes      4  0\n" +
      "DAAAAA+DejaVuSerif                   CID TrueType      Identity-H       yes yes yes      5  0\n";

    const verdict = evaluateGlyphEmbedding(stdout);

    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("DejaVuSans-Bold");
    expect(verdict.reason).toContain("DejaVuSerif");
  });

  it("fails, naming both missing families, when neither Liberation nor DejaVu is embedded (missing)", () => {
    const stdout =
      HEADER +
      "Helvetica                            Type 1            WinAnsiEncoding  no  no  no       6  0\n";

    const verdict = evaluateGlyphEmbedding(stdout);

    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain(
      'neither "Liberation Serif" nor its fallback "DejaVu Serif" is embedded',
    );
    expect(verdict.reason).toContain(
      'neither "Liberation Sans" nor its fallback "DejaVu Sans" is embedded',
    );
  });
});

describe("evaluateTextRoundTrip (layer 3 — pdftotext)", () => {
  it("passes when every required accented character round-trips — real captured pdftotext output (present)", () => {
    const verdict = evaluateTextRoundTrip("PRUEBA\nñáéíóúÑ\n");

    expect(verdict.layer).toBe("text-round-trip");
    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("all required accented characters");
  });

  it("fails, naming exactly what is missing, on a partial round-trip (fallback)", () => {
    const verdict = evaluateTextRoundTrip("PRUEBA\nñáéíóú\n"); // Ñ missing

    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain("1 of 7");
    expect(verdict.reason).toContain("Ñ");
  });

  it("fails, stating the ToUnicode map is entirely wrong, when nothing round-trips (missing)", () => {
    const verdict = evaluateTextRoundTrip("PRUEBA\n");

    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain(
      "none of the required accented characters",
    );
  });

  it("never mistakes rasterized-but-wrong text for a pass — a tofu PDF with a corrupted ToUnicode map still fails here", () => {
    // The whole reason this layer alone is not falsifiable for tofu: it reads
    // the ToUnicode map, never the ink. This fixture models a WRONG map
    // (mojibake) rather than an absent one — still a fail, different reason.
    const verdict = evaluateTextRoundTrip("PRUEBA\n�������\n");

    expect(verdict.pass).toBe(false);
  });
});

describe("buildRenderVerdict", () => {
  const capa = (
    layer: LayerVerdict["layer"],
    pass: boolean,
  ): LayerVerdict => ({ layer, pass, reason: pass ? "ok" : "nope" });

  const lasTres = (...fallan: LayerVerdict["layer"][]): LayerVerdict[] =>
    (["family-resolution", "glyph-embedding", "text-round-trip"] as const).map(
      (layer) => capa(layer, !fallan.includes(layer)),
    );

  it("passes only when every layer passes", () => {
    expect(buildRenderVerdict(lasTres()).pass).toBe(true);
    expect(buildRenderVerdict(lasTres("glyph-embedding")).pass).toBe(false);
    expect(buildRenderVerdict(lasTres("family-resolution")).pass).toBe(false);
    expect(buildRenderVerdict(lasTres("text-round-trip")).pass).toBe(false);
  });

  it("refuses an incomplete layer set instead of reporting a pass over it", () => {
    // A verdict over a subset of the layers is not a verdict. Without this,
    // a driver that drops a layer — or `[]` outright — reports `pass: true`:
    // a render nobody checked, reported as a render that is fine.
    expect(() => buildRenderVerdict([])).toThrow(/family-resolution/);
    expect(() =>
      buildRenderVerdict([capa("family-resolution", true)]),
    ).toThrow(/glyph-embedding/);
  });

  it("refuses a duplicated layer, which would hide the one it replaced", () => {
    expect(() =>
      buildRenderVerdict([
        capa("family-resolution", true),
        capa("family-resolution", true),
        capa("glyph-embedding", true),
      ]),
    ).toThrow(/family-resolution/);
  });

  it("carries every layer verdict through untouched, for the driver to print", () => {
    const layers: LayerVerdict[] = [
      { layer: "family-resolution", pass: true, reason: "a" },
      { layer: "glyph-embedding", pass: true, reason: "b" },
      { layer: "text-round-trip", pass: true, reason: "c" },
    ];

    expect(buildRenderVerdict(layers).layers).toEqual(layers);
  });
});
