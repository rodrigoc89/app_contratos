import { describe, it } from "vitest";

/**
 * design.md D2 — compiled-output guards 1, 2 and 16 (the overflow-hidden /
 * `[hidden]` / `sr-only` collision cluster). These scan real `dist/`
 * output, not `src/**\/*.css`, so Tailwind Preflight's own `[hidden]` rule
 * and any `.sr-only` usage — including one emitted by a vendored
 * component's internals — are visible. Runs in the `bundle` CI job (D7),
 * after `vite build`, via `pnpm test:compilado` — never as part of
 * `pnpm -r test`, where `dist/` does not exist on a clean checkout. Same
 * `*.integration.spec.ts` split `apps/api` already uses, for the same
 * reason (`vitest.config.ts`'s matching `exclude`,
 * `vitest.compilado.config.ts`).
 *
 * **PR3 scaffolds this file only** — empty `describe` blocks, no real
 * assertion yet. The real compiled-CSS scans land in PR6 (`styling-guards`
 * spec's collision-cluster requirement), the first PR to have a `dist/`
 * worth scanning against a Preflight-carrying build.
 */

describe("guard 1/16: compiled output declares no overflow: hidden / overflow: clip / clip-path reachable by shipped markup", () => {
  it.todo("scans dist/ for overflow:hidden|clip and clip-path rules reachable by shipped markup (PR6)");
});

describe("guard 2: Preflight's [hidden] rule is the sole !important display rule in compiled output", () => {
  it.todo("fails, naming both rules, if a project-authored !important display rule survives alongside Preflight's own (PR6)");
});
