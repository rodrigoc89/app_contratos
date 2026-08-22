import { describe, expect, it } from "vitest";

import {
  REQUESTED_FONT_FAMILIES,
  buildRenderVerdict,
  evaluateFamilyResolution,
  evaluateGlyphEmbedding,
  evaluateTextRoundTrip,
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

describe("REQUESTED_FONT_FAMILIES", () => {
  it("matches the exact families the templates request — v1-comodato.html lines 25 and 34 (identical in v1-condiciones-generales.html)", () => {
    expect(REQUESTED_FONT_FAMILIES).toEqual([
      { primary: "Liberation Serif", fallback: "DejaVu Serif" },
      { primary: "Liberation Sans", fallback: "DejaVu Sans" },
    ]);
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
  it("passes only when every layer passes", () => {
    const pass: LayerVerdict = {
      layer: "family-resolution",
      pass: true,
      reason: "ok",
    };
    const fail: LayerVerdict = {
      layer: "glyph-embedding",
      pass: false,
      reason: "nope",
    };

    expect(buildRenderVerdict([pass, pass]).pass).toBe(true);
    expect(buildRenderVerdict([pass, fail]).pass).toBe(false);
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
