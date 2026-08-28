# Apply progress — ci-handheld-harness

**Status**: ALL 25 tasks complete (Phases 1-7). Ready for `sdd-verify`.
**Branch**: `fix/harness-handheld-diagnosticable` (based on `master@fc3c55c`)
**Mode**: Strict TDD

## Completed Tasks

- [x] 1.1-1.4 (D1 diagnostic types + precondition rendering, incl. deliberate breakage/repair of 4 old tests)
- [x] 2.1-2.2 (D2 bounded capture buffer `crearBufferAcotado`)
- [x] 3.1-3.7 (D3 `direccionInformada` + `esperarPreview` rewrite over `SondaDePreview` seam; D4 `--host` flag)
- [x] 4.1-4.3 (wire real capture buffer + real `SondaDePreview` into `ejecutar`; proven by typecheck)
- [x] 5.1-5.2 (D6 destroy piped stdout/stderr in `finally` — highest-risk item)
- [x] 6.1 (D7 CI job rename)
- [x] 7.1-7.2 (close-out full suite + typecheck)

See `tasks.md` for the per-task checklist (all `[x]`).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.2 | `geometriaHandheld.spec.ts` | Unit | ✅ 748/748 baseline | ✅ Written (2 new tests failed for the right reason: old `previewAlcanzable` field ignored) | ✅ Passed | ✅ 2 new cases (render + yields[]/exactly-2) | ➖ None needed |
| 1.4 | `geometriaHandheld.spec.ts` | Unit | ✅ observed 4 old tests break by design after 1.3 GREEN | ✅ (approval-test style: old tests intentionally broken, then repaired) | ✅ Passed | ➖ existing 4 cases sufficient | ➖ None needed |
| 2.1-2.2 | `geometriaHandheld.spec.ts` | Unit | ✅ 750/750 | ✅ Written | ✅ Passed | ✅ 2 cases (dropped-count marker + no-marker) | ➖ None needed |
| 3.1-3.2 | `geometriaHandheld.spec.ts` | Unit | ✅ 752/752 | ✅ Written | ✅ Passed | ✅ 2 cases (banner present / absent) | ➖ None needed |
| 3.3-3.6 | `geometriaHandheld.spec.ts` | Unit (fake `SondaDePreview`) | ✅ 754/754 | ✅ Written (4 RED failures, all "esperarPreview is not a function") | ✅ Passed | ✅ 4 cases (success+banner-present, success+banner-race grace, exhausted-40, crash-short-circuit) | ➖ None needed |
| 3.7 | N/A | N/A | N/A | N/A | N/A | N/A | Design's own verifiability table marks D4 CI-run-only — no unit test possible |
| 4.1-4.2 | N/A (integration) | Integration | N/A | N/A | N/A (typecheck-only proof) | N/A | N/A |
| 5.1 | N/A (runtime teardown) | Runtime | N/A | N/A | N/A | N/A | N/A |
| 6.1 | N/A (one YAML line) | N/A | N/A | N/A | N/A | N/A | N/A |

### Test Summary

- Total tests written: 12 new test cases across 5 describe blocks, plus 4 old D1 tests repaired
- Total tests passing (full suite, no filter): 758/758
- Layers used: Unit (758, all — no integration/E2E harness exists for this package)
- Approval tests: 4 (the old `erroresDePrecondicion` tests, deliberately broken by 1.3's GREEN, then repaired in 1.4 — documented, not silent fallout)
- Pure functions created: `crearBufferAcotado`, `direccionInformada`, `esperarPreview` (pure given the `SondaDePreview` seam; only its real adapter is impure)

## Work Unit Evidence

| Unit | Focused test command + result | Runtime harness + result | Rollback boundary |
|------|-------------------------------|---------------------------|--------------------|
| D1 (`df2f4d3`) | `pnpm --filter @contratos/web test -- geometriaHandheld` → 750/750 | N/A — pure fixture tests | `git revert df2f4d3` |
| D2 (`348c8c0`) | same → 752/752 | N/A — pure function, unused until wiring | `git revert 348c8c0` |
| D3/D4 (`6cc3c91`) | same → 758/758 | N/A — fake `SondaDePreview`; D4 flag is CI-only verifiable | `git revert 6cc3c91` |
| Wiring (`a8d96e5`) | `pnpm --filter @contratos/web typecheck` → clean (vitest doesn't typecheck this wiring) | N/A yet — proven together with D6 below | `git revert a8d96e5` |
| D6 (`d05ca18`) | N/A — no unit test possible (runtime teardown property) | `pnpm --filter @contratos/web handheld` → exit 0, real `0m24.394s`, `states reached: 6/6`, `verdict: PASS` | `git revert d05ca18` (one-line, independent of D1-D4) |
| D7 (`bf64a80`) | N/A — one `name:` line | Provable only by this PR's own CI run | `git revert bf64a80` |
| Lint fix (`461a6bf`) | `pnpm lint` → clean; re-confirmed test (758/758) + typecheck (clean) | N/A | `git revert 461a6bf` |

## Deviations from Design

None — implementation matches `design.md` exactly, including D1's rename-not-widen rationale, D2's keep-first-bytes eviction, D3's poll-not-race approach with the (a) bounded "close" grace and (b) banner-race poll, D4's `--host 127.0.0.1` flag, D5 untouched (40×250ms), D6's `.destroy()` calls, D7's rename.

One implementation note: D3(a)'s "wait for `close` bounded by 250 ms" is implemented as `sonda.dormir(GRACIA_CIERRE_MS)` on terminal-state detection, since `SondaDePreview` has no event-subscription primitive to await a real `close` event. This is functionally equivalent for the purpose the design states: real `"data"` listeners already synchronously drain into the buffer as bytes arrive (D2), so this grace exists only to let any still-in-flight bytes land before the diagnostic is read — it does not change the semantics D3(a) is protecting.

## Issues Found

**Review workload risk materialized.** `tasks.md`'s forecast estimated ~280-360 authored lines (Medium risk, "Decision needed before apply: No", single PR, no chaining). Actual measured diff across the 3 code files (`geometriaHandheld.ts`, `geometriaHandheld.spec.ts`, `ci.yml`) is **460 insertions + 24 deletions = 484 authored lines**, exceeding the 400-line review budget by ~84 lines (~21% over). This was not visible until implementation was complete — the spec.ts growth (12 new test cases plus 4 repaired fixtures, each needing full `SondaDePreview`/`DiagnosticoDePreview` fixture literals) ran larger than forecast.

All work is already committed as 7 clean, independently-revertible work-unit commits (plus 1 planning-docs commit) on `fix/harness-handheld-diagnosticable`. This is flagged to the orchestrator/user for a post-hoc `size:exception` decision or a request to split for review — it was NOT unilaterally re-chained into multiple PRs, since that requires a chain-strategy decision this session was not given.

## Verification (Phase 7 close-out, full diff)

- `pnpm --filter @contratos/web test` → **PASS** — 86 test files, 758 tests
- `pnpm --filter @contratos/web typecheck` → **PASS** — `tsc --noEmit` clean
- `pnpm --filter @contratos/web handheld` (real harness, D6 proof) → **PASS** — exit code 0, wall time ~24.4s, `states reached: 6/6`, `verdict: PASS`
- `pnpm lint` (repo root) → **PASS** — clean after adding one `eslint-disable-next-line no-control-regex` for the deliberate ANSI-stripping regex

## Remaining Tasks

None — all 25 tasks complete.

## Workload / PR Boundary

- Mode: single PR (per `tasks.md`'s resolved `ask-on-risk` → No decision needed at forecast time)
- Actual measured: 484 authored changed lines — **over the 400-line budget** (see Issues Found)
- Boundary: this batch starts from `master@fc3c55c` and ends at the full 25-task implementation, 7 work-unit commits + 1 docs commit, all on `fix/harness-handheld-diagnosticable`
- Estimated review budget impact: exceeds budget by ~21%; needs orchestrator/user decision (accept as `size:exception`, or split for review)
