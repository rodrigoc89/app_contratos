/**
 * design.md D7 — the `dist/` size ceiling. Run as `pnpm --filter
 * @contratos/web size`, after `vite build`, in the `bundle` CI job — this
 * repository runs no `vite build` anywhere else.
 *
 * The measured set is the WHOLE `dist/` directory, never `dist/assets/`
 * alone and never `dist/assets/` plus `sw.js`'s precache manifest (D7's
 * double-count trap: the precache set already contains the assets, so
 * summing both reports ~958 KiB on a build that is fine). There is no
 * manifest parsing at all — measuring the directory removes that trap along
 * with the code path that could fall into it.
 *
 * This is the second of the three "passes by doing nothing" mechanisms
 * `tasks.md`'s preamble names: a missing or empty `dist/` sums to 0 bytes,
 * which trivially satisfies "≤ 665,600". `erroresDePrecondicion` fails
 * closed on exactly that, before `evaluarTecho` ever runs.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 650 KiB, raw bytes — never gzip (D7's unit trap: exploration's ecosystem figures are gzip). */
export const TECHO_BYTES = 665_600;

/**
 * Fail-closed floor on file count, independent of the byte ceiling — a
 * `dist/` missing most of a real build must not pass just because it is
 * small. A real build has produced 12+ files throughout this migration; 8
 * leaves margin while still catching an obviously incomplete build.
 */
export const PISO_DE_ARCHIVOS = 8;

/**
 * The migration's true branch point — `master` @ `5c72a69`, before any
 * slice landed — measured with a clean `pnpm build` + `du -sb`. design.md
 * D7's baseline table records this exact figure.
 */
export const PUNTO_DE_RAMA_MIGRACION_BYTES = 515_412;

export interface ArchivoMedido {
  readonly ruta: string;
  readonly bytes: number;
}

/**
 * `design-system-foundation`'s "an absent or empty dist/ fails the gate
 * rather than passing on zero" scenario, plus a non-empty file-count floor.
 */
export function erroresDePrecondicion(
  archivos: readonly ArchivoMedido[],
  piso: number = PISO_DE_ARCHIVOS,
): string[] {
  if (archivos.length === 0) {
    return ["dist/ is missing or empty — nothing was built"];
  }

  if (archivos.length < piso) {
    return [
      `dist/ holds only ${archivos.length} file(s), fewer than the committed floor of ${piso} — the build is likely incomplete`,
    ];
  }

  return [];
}

export interface ResultadoTecho {
  readonly aprueba: boolean;
  readonly usados: number;
  readonly techo: number;
  /** Positive = headroom under the ceiling; negative = overage. */
  readonly holguraORebase: number;
}

/** `design-system-foundation`'s "a build under/over the ceiling passes/fails" scenarios. */
export function evaluarTecho(usados: number, techo: number = TECHO_BYTES): ResultadoTecho {
  return { aprueba: usados <= techo, usados, techo, holguraORebase: techo - usados };
}

export function sumarBytes(archivos: readonly ArchivoMedido[]): number {
  return archivos.reduce((total, archivo) => total + archivo.bytes, 0);
}

/**
 * design.md D7 — "Slice A's re-measure is now falsifiable": a clean build
 * at the true branch point has a known expected value. A ONE-TIME check of
 * that recorded number, not a per-build gate — `dist/` legitimately grows
 * from PR1 onward, so this is never wired into the CLI driver below. See
 * this PR's evidence for the worktree rebuild that reproduced it exactly.
 */
export function erroresDeLineaBase(
  medido: number,
  esperado: number = PUNTO_DE_RAMA_MIGRACION_BYTES,
): string[] {
  if (medido !== esperado) {
    return [
      `branch point changed before migration start — measured ${medido} B, expected ${esperado} B (delta ${medido - esperado} B)`,
    ];
  }

  return [];
}

// ── CLI entry point ─────────────────────────────────────────────────────

function listarArchivos(directorioRaiz: string): ArchivoMedido[] {
  let entradas: string[];

  try {
    entradas = readdirSync(directorioRaiz, { recursive: true }) as string[];
  } catch {
    return [];
  }

  const archivos: ArchivoMedido[] = [];
  for (const entrada of entradas) {
    const rutaAbsoluta = join(directorioRaiz, entrada);
    const info = statSync(rutaAbsoluta);
    if (info.isFile()) {
      archivos.push({ ruta: relative(directorioRaiz, rutaAbsoluta), bytes: info.size });
    }
  }

  return archivos;
}

function formatoKiB(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}

function imprimirResultado(resultado: ResultadoTecho): void {
  console.log("=== dist/ size ceiling (design.md D7) ===");
  console.log(`used:     ${resultado.usados} B (${formatoKiB(resultado.usados)} KiB)`);
  console.log(`ceiling:  ${resultado.techo} B (${formatoKiB(resultado.techo)} KiB)`);
  console.log(
    resultado.aprueba
      ? `headroom: ${resultado.holguraORebase} B (${formatoKiB(resultado.holguraORebase)} KiB)`
      : `over by:  ${-resultado.holguraORebase} B (${formatoKiB(-resultado.holguraORebase)} KiB)`,
  );
  console.log(`verdict:  ${resultado.aprueba ? "PASS" : "FAIL"}`);
}

// Only run as a CLI entry point — importing the pure functions for a test
// must not also walk a real filesystem as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  const directorioDist = join(import.meta.dirname, "..", "dist");
  const archivos = listarArchivos(directorioDist);
  const erroresDePrecondicionEncontrados = erroresDePrecondicion(archivos);

  if (erroresDePrecondicionEncontrados.length > 0) {
    console.error("dist/ size ceiling failed a precondition:");
    for (const error of erroresDePrecondicionEncontrados) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
  } else {
    const resultado = evaluarTecho(sumarBytes(archivos));
    imprimirResultado(resultado);

    if (!resultado.aprueba) {
      process.exitCode = 1;
    }
  }
}
