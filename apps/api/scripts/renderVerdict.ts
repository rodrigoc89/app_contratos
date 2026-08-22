/**
 * Pure parser for the three-layer render verdict (design.md D2).
 *
 * Each layer proves ONE thing about a produced PDF and explicitly does NOT
 * prove the others — labelled here and in `deploy/README.md` so nobody reads
 * a pass as more than it is:
 *
 *   1. Family resolution (`fc-match`)  — the requested font family resolves
 *      to ITSELF, not to a silent fontconfig substitute. Proves nothing
 *      about the produced PDF.
 *   2. Glyph embedding (`pdffonts`)    — a real, known-good font (Liberation
 *      or its documented DejaVu fallback) is actually embedded in the
 *      produced PDF. Proves nothing about glyph shapes.
 *   3. Text round-trip (`pdftotext`)   — the PDF's `ToUnicode` map carries
 *      the right codepoints. Proves NOTHING about rasterization: a PDF full
 *      of tofu boxes can still extract the correct characters, because
 *      `pdftotext` reads `ToUnicode`, never the rendered ink. This is why
 *      layer 3 alone is never sufficient — layers 1-2 exist precisely to
 *      catch what layer 3 cannot.
 *
 * Every function below is a pure string-in, verdict-out parser: no process
 * spawning, no filesystem, no network. That is what lets this module be unit
 * tested from fixtures without `fc-match`/`pdffonts`/`pdftotext` actually
 * installed — only `verificarRender.ts` (the driver) needs them on PATH.
 */

export type RenderVerdictLayer =
  | "family-resolution"
  | "glyph-embedding"
  | "text-round-trip";

export interface LayerVerdict {
  readonly layer: RenderVerdictLayer;
  readonly pass: boolean;
  readonly reason: string;
}

export interface RenderVerdict {
  readonly pass: boolean;
  readonly layers: readonly LayerVerdict[];
}

export interface FontFamilyRequest {
  /** The family the template's CSS declares first. */
  readonly primary: string;
  /** The one documented fallback that same declaration also lists. */
  readonly fallback: string;
}

/**
 * The template's two declared font families, each with its one documented
 * fallback — from `apps/api/prisma/plantillas/v1-comodato.html`
 * (identical in `v1-condiciones-generales.html`):
 *
 *   line 25: font-family: "Liberation Serif", "DejaVu Serif", serif;
 *   line 34: font-family: "Liberation Sans", "DejaVu Sans", sans-serif;
 *
 * Both must be checked, not one: a verdict that only probes the serif face
 * passes while every heading (which uses the sans face) could still render
 * as tofu.
 */
export const REQUESTED_FONT_FAMILIES: readonly FontFamilyRequest[] = [
  { primary: "Liberation Serif", fallback: "DejaVu Serif" },
  { primary: "Liberation Sans", fallback: "DejaVu Sans" },
];

const ALL_LAYERS: readonly RenderVerdictLayer[] = [
  "family-resolution",
  "glyph-embedding",
  "text-round-trip",
];

/**
 * A verdict over a subset of the layers is not a verdict. `[].every()` is
 * `true`, so without this an empty or partial layer set reports `pass: true`
 * — a render nobody checked, indistinguishable from a render that is fine.
 * Each layer proves one thing the others cannot (see this module's header),
 * so a missing one is a hole, not a smaller verdict. `verificarRestauracion.ts`
 * refuses the same way when it verifies zero documents.
 *
 * This is a programming error in the caller, not a host condition, so it
 * throws rather than returning a failing verdict: the driver already turns a
 * thrown error into a non-zero exit with the message attached.
 */
export function buildRenderVerdict(
  layers: readonly LayerVerdict[],
): RenderVerdict {
  const present = layers.map((verdict) => verdict.layer);
  const missing = ALL_LAYERS.filter((layer) => !present.includes(layer));
  const duplicated = [
    ...new Set(present.filter((layer, index) => present.indexOf(layer) !== index)),
  ];

  if (missing.length > 0 || duplicated.length > 0) {
    throw new Error(
      `a render verdict must carry each of the three layers exactly once — missing: [${missing.join(", ")}], duplicated: [${duplicated.join(", ")}]`,
    );
  }

  return {
    pass: layers.every((layer) => layer.pass),
    layers,
  };
}

// ── Layer 1: family resolution (fc-match) ──────────────────────────────────

export interface FcMatchResult {
  readonly family: FontFamilyRequest;
  /** Raw stdout of `fc-match -f '%{family}\n' "<family.primary>"`. */
  readonly stdout: string;
}

/**
 * `fc-match` NEVER errors on a missing family — it always resolves to
 * whatever it considers closest. So "fc-match returned a font" is NOT a
 * pass; only "fc-match returned the SAME font it was asked for" is. This is
 * the entire reason this layer exists as its own layer, separate from
 * "did fc-match exit 0" (which proves nothing).
 */
export function evaluateFamilyResolution(
  results: readonly FcMatchResult[],
): LayerVerdict {
  // The header above warns that a verdict probing only the serif face passes
  // while every heading still renders as tofu. `[].every()` is `true`, so
  // that warning would otherwise describe a hole this function leaves open:
  // an unprobed family has to fail, exactly like a substituted one.
  const sinProbar = REQUESTED_FONT_FAMILIES.filter(
    (wanted) =>
      !results.some((result) => result.family.primary === wanted.primary),
  );

  if (sinProbar.length > 0) {
    return {
      layer: "family-resolution",
      pass: false,
      reason: `${sinProbar.length} of ${REQUESTED_FONT_FAMILIES.length} requested families were never probed: ${sinProbar.map((family) => `"${family.primary}"`).join(", ")}`,
    };
  }

  const findings = results.map(classifyFamilyResolution);

  return {
    layer: "family-resolution",
    pass: findings.every((finding) => finding.pass),
    reason: findings.map((finding) => finding.detail).join("; "),
  };
}

function classifyFamilyResolution(result: FcMatchResult): {
  readonly pass: boolean;
  readonly detail: string;
} {
  const returned = result.stdout.trim();
  const { primary, fallback } = result.family;

  if (returned === primary) {
    return { pass: true, detail: `"${primary}" resolved to itself` };
  }

  if (returned === fallback) {
    return {
      pass: false,
      detail: `"${primary}" was substituted with its documented fallback "${fallback}" instead of resolving to itself — fonts-liberation is most likely not installed`,
    };
  }

  return {
    pass: false,
    detail: `"${primary}" was substituted with an unrecognized font ("${returned}") — neither the requested family nor its documented fallback "${fallback}" is installed`,
  };
}

// ── Layer 2: glyph embedding (pdffonts) ─────────────────────────────────────

interface PdffontsColumn {
  readonly start: number;
  readonly end: number;
}

interface PdffontsRow {
  readonly name: string;
  readonly embedded: boolean;
}

const PDFFONTS_SEPARATOR_LINE = /^-+(\s+-+)+$/;

/**
 * `pdffonts` prints a fixed-width table. Column boundaries are derived from
 * the dashed separator line itself rather than hardcoded, because that is
 * the one part of the format `pdffonts` documents as stable (the header text
 * has changed across poppler versions; the dash widths mark real columns).
 */
function parsePdffontsRows(stdout: string): readonly PdffontsRow[] {
  const lines = stdout.split("\n");
  const separatorIndex = lines.findIndex((line) =>
    PDFFONTS_SEPARATOR_LINE.test(line),
  );

  if (separatorIndex === -1) {
    return [];
  }

  const columns = columnsFromSeparator(lines[separatorIndex]!);
  const nameColumn = columns[0];
  // pdffonts' fixed column order is: name, type, encoding, emb, sub, uni,
  // object ID — "emb" is always the 4th group.
  const embColumn = columns[3];

  if (nameColumn === undefined || embColumn === undefined) {
    return [];
  }

  return lines
    .slice(separatorIndex + 1)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      name: line.slice(nameColumn.start, nameColumn.end).trim(),
      embedded: line.slice(embColumn.start, embColumn.end).trim() === "yes",
    }));
}

function columnsFromSeparator(separator: string): readonly PdffontsColumn[] {
  const columns: PdffontsColumn[] = [];
  const dashGroups = /-+/g;
  let match: RegExpExecArray | null;

  while ((match = dashGroups.exec(separator)) !== null) {
    columns.push({ start: match.index, end: match.index + match[0].length });
  }

  return columns;
}

/**
 * `pdffonts` strips spaces from family names and, for a subsetted font,
 * prepends a 6-uppercase-letter subset tag: e.g. "Liberation Sans" (bold
 * subset) prints as `AAAAAA+LiberationSans-Bold`.
 */
function matchesFamily(pdffontsName: string, wantedFamily: string): boolean {
  const normalized = pdffontsName.replace(/^[A-Z]{6}\+/, "");
  const wantedNoSpaces = wantedFamily.replace(/\s+/g, "");
  return normalized.startsWith(wantedNoSpaces);
}

/**
 * Unlike layer 1, this layer is lenient across the whole known-good set:
 * `deploy/provision.sh` installs both `fonts-liberation` and
 * `fonts-dejavu-core`, so either family embedding is proof that SOME real,
 * project-provisioned font landed in the PDF — proving glyph embedding
 * happened at all, which is this layer's one job. Layer 1 is the strict one,
 * checking specifically that the PRIMARY family did not silently fall back.
 */
export function evaluateGlyphEmbedding(pdffontsStdout: string): LayerVerdict {
  const rows = parsePdffontsRows(pdffontsStdout);

  const findings = REQUESTED_FONT_FAMILIES.map((family) => {
    const embeddedRow = rows.find(
      (row) =>
        row.embedded &&
        (matchesFamily(row.name, family.primary) ||
          matchesFamily(row.name, family.fallback)),
    );

    if (embeddedRow === undefined) {
      return {
        pass: false,
        detail: `neither "${family.primary}" nor its fallback "${family.fallback}" is embedded in the produced PDF`,
      };
    }

    return {
      pass: true,
      detail: `"${embeddedRow.name}" is embedded (satisfies "${family.primary}"/"${family.fallback}")`,
    };
  });

  return {
    layer: "glyph-embedding",
    pass: findings.every((finding) => finding.pass),
    reason: findings.map((finding) => finding.detail).join("; "),
  };
}

// ── Layer 3: text round-trip (pdftotext) ────────────────────────────────────

/**
 * The exact set design.md D2 names. Both cases of "ñ" are included: the
 * lowercase form appears in the probe's surname-style text, the uppercase
 * only at a word's start.
 */
const REQUIRED_ROUND_TRIP_CHARACTERS: readonly string[] = [
  "ñ",
  "á",
  "é",
  "í",
  "ó",
  "ú",
  "Ñ",
];

/**
 * Reads the `ToUnicode` map, NEVER the rendered ink — a PDF full of tofu
 * boxes can still extract the correct characters here. This layer alone is
 * never sufficient; it only ever runs alongside layers 1-2.
 */
export function evaluateTextRoundTrip(pdftotextStdout: string): LayerVerdict {
  const missing = REQUIRED_ROUND_TRIP_CHARACTERS.filter(
    (character) => !pdftotextStdout.includes(character),
  );

  if (missing.length === 0) {
    return {
      layer: "text-round-trip",
      pass: true,
      reason: `all required accented characters (${REQUIRED_ROUND_TRIP_CHARACTERS.join(" ")}) round-tripped correctly`,
    };
  }

  if (missing.length === REQUIRED_ROUND_TRIP_CHARACTERS.length) {
    return {
      layer: "text-round-trip",
      pass: false,
      reason: `none of the required accented characters (${REQUIRED_ROUND_TRIP_CHARACTERS.join(" ")}) were extracted — the ToUnicode map is most likely entirely wrong, or no matching font was embedded at all`,
    };
  }

  return {
    layer: "text-round-trip",
    pass: false,
    reason: `${missing.length} of ${REQUIRED_ROUND_TRIP_CHARACTERS.length} required accented characters did not round-trip: ${missing.join(" ")}`,
  };
}
