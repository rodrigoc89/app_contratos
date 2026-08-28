```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c0f03d930700951f31d7b1792f9e6aa6def8b1052018aada4b2bad906180bd51
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 3/3
scenarios: 8/8
test_command: pnpm --filter @contratos/web test
test_exit_code: 0
test_output_hash: sha256:7e1acbb6d0c0aa4efcc5fa5a5a6706499af88ee061e999e45c1ceb734e203c36
build_command: pnpm --filter @contratos/web typecheck
build_exit_code: 0
build_output_hash: sha256:8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92
```

## Verification Report

**Change**: ci-handheld-harness
**Version**: `handheld-readiness` delta spec, revision 2 (D4 bound-address correction incorporated)
**Mode**: Strict TDD
**Branch**: `fix/harness-handheld-diagnosticable` @ `c6c3efe`, based on `master@fc3c55c`, 9 commits
**Review budget**: 484 authored lines (460+/24-) vs 400-line default budget. `size:exception` explicitly granted by the maintainer per session config — recorded as an accepted decision, not reported as a finding here.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (checkbox items in `tasks.md`) | 21 |
| Tasks complete | 21 |
| Tasks incomplete | 0 |
| Note | `apply-progress.md`'s status line says "ALL 25 tasks complete" — the actual checkbox count is 21, not 25. All 21 existing checkboxes are checked; this is a self-report miscount, not an incompleteness (see Issues, SUGGESTION). |

### Build & Tests Execution (independently reproduced, not cited from the orchestrator)
**Build/Typecheck**: ✅ Passed — `pnpm --filter @contratos/web typecheck` → `tsc --noEmit`, exit 0, clean output.
**Tests**: ✅ 758 passed / 0 failed / 0 skipped — `pnpm --filter @contratos/web test` → 86 files, 758 tests, exit 0.
**Lint**: ✅ `pnpm lint` (root) → `eslint . --max-warnings 0`, exit 0, clean.

**Real-harness successful run** (`pnpm --filter @contratos/web handheld`), reproduced independently:
```
preview reachable: ➜  Local:   http://127.0.0.1:4174/ (attempts: 5, elapsed: 1070ms)
=== handheld geometry harness (design.md D8) ===
states reached: 6/6
verdict: PASS
```
Exit 0, wall time 23.2s.

**Real-harness failure run, deliberately provoked** (see "Failure-path evidence" below) — the change's actual deliverable, exercised end-to-end, not just via unit tests.

**Coverage**: ➜ Not available — no coverage tool configured for `@contratos/web`; not flagged as a failure per skill rules.

### Failure-path evidence (deliberately provoked, not cited from a passing run)

The prompt is correct that the original successful run does not exercise the diagnostic-reporting path this change exists to build. I provoked a real failure: bound a dummy TCP listener on port 4174 (raw `net.createServer`, no HTTP semantics) before running the harness, so `vite preview --strictPort` fails with `EADDRINUSE` — the exact "launch failure" row design.md's D4 discriminator table names. Real observed output:

```
=== handheld geometry harness (design.md D8) — FAILED ===
  - the vite preview server never became reachable — attempts: 2, elapsed: 28641ms, process: exit 1,
    last probe error: fetch failed, captured output: error when starting preview server:
Error: Port 4174 is already in use
    at Server.onError (…/vite/dist/node/chunks/dep-Dm0c1Wj2.js:25119:18)
    at Server.emit (node:events:509:20)
    at emitErrorNT (node:net:2203:8)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
```
Exit code 1 (`[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] … Exit status 1`), wall time 29.6s. Port and process state confirmed clean afterward (no leaked listener, no leftover `vite`/`geometriaHandheld` process), working tree confirmed clean before and after.

This is real, non-hypothetical proof that: the harness fails closed (exit 1) on a real launch failure; `finDelProceso` correctly reports `"exit 1"`; the captured-output requirement (R2a) is genuinely wired end-to-end — the real vite stack trace reached the failure report, not an empty/discarded stream; and the crash short-circuit (R1) genuinely bounds the wait — only 2 of the 40-attempt budget were consumed (the elapsed 28.6s reflects the dummy listener accepting-but-never-answering the probe's TCP connection on attempt 1, an artifact of this test method, not of the harness; what matters — attempt count vs. budget — is unaffected by that artifact and is the actual R1 assertion).

### Spec Compliance Matrix
| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| R1: crash short-circuit | a preview crash ends the wait before the polling budget elapses | `geometriaHandheld.spec.ts > esperarPreview > ends the wait immediately …` (L308-329) + real forced-failure run above (2/40 attempts) | ✅ COMPLIANT |
| R2a: captured output on failure | captured output surfaced when the preview never becomes reachable | `… erroresDePrecondicion (D1 diagnostic evidence) > renders attempts, elapsed time, …` (L150-162) + real forced-failure run above (real vite stack trace surfaced) | ✅ COMPLIANT |
| R2b: address reported on success | the announced address is reported on a successful reachability wait | `… esperarPreview > returns exito with the reported address …` (L231-256), `… polls briefly for the Local: banner …` (L258-280) + real successful run above | ✅ COMPLIANT |
| R2c: honest no-banner fallback | a successful wait with no captured banner reports that honestly, not silently | `direccionInformada > reports honestly that no address was available …` (L209-213) proves the fallback string in isolation; **no test exercises `esperarPreview`'s success branch with `salida()` permanently empty through the full `2×esperaMs` grace period** — the two existing `esperarPreview` success tests either supply the banner immediately or make it appear on the first `dormir` call | ⚠️ PARTIAL — see WARNING-1 |
| MODIFIED: absent build | an absent build fails the harness naming the missing precondition | `erroresDePrecondicion > fails closed when dist/ is missing …` (L117-122), pre-existing, unchanged, still passing | ✅ COMPLIANT |
| MODIFIED: unreachable preview names its cause | an unreachable preview server fails the harness naming its cause, not just its verdict | Same as R1/R2a rows above + `erroresDePrecondicion > fails closed when the preview server never becomes reachable …` (L124-129) | ✅ COMPLIANT |
| MODIFIED: zero-measurement run | a zero-measurement run fails rather than passing silently | `erroresDeCobertura > fails closed on a zero-measurement run …` (L72-77), pre-existing, unchanged, untouched by this change per `tasks.md` | ✅ COMPLIANT |
| MODIFIED: S3 drift caught as short run | S3's visit-script drift is caught as a short run, not a silent re-measure | `erroresDeCobertura > fails closed on a short run …` (L64-70), pre-existing mechanism, untouched by this change per `tasks.md` (no design decision touches `erroresDeCobertura`) | ✅ COMPLIANT |

**Compliance summary**: 7/8 scenarios fully compliant, 1/8 partial (pure function proven, one integration branch untested).

### TDD Compliance (Strict TDD)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` has a complete "TDD Cycle Evidence" table |
| All tasks have tests | ✅ | 1.1-1.2, 2.1, 3.1, 3.3-3.5 all have RED test files; 3.7/4.x/5.x/6.1 are documented no-unit-test items with stated reasons (CI-only, integration-only, runtime-teardown-only) |
| RED confirmed (tests exist) | ✅ | Test files verified present at cited line ranges |
| GREEN confirmed (tests pass) | ✅ | 758/758 pass on independent re-run |
| **RED-for-the-right-reason, independently reproduced** | ✅ | See "TDD Sequencing Verification" below — not accepted on the apply agent's assertion alone |
| Triangulation adequate | ✅ | D1: 2 cases; D2: 2 cases; D3 address: 2 cases; D3 `esperarPreview`: 4 cases |
| Safety Net for modified files | ✅ | 748/748 baseline before D1, confirmed by re-running the pre-change suite (see below) |

**TDD Compliance**: 7/7 checks passed

#### TDD Sequencing Verification (independently reproduced, not accepted on assertion)

Git history is 7 squashed work-unit commits (test+implementation together per commit), so commit boundaries alone cannot prove RED was literally observed before GREEN. I reconstructed two RED states directly in the working tree (each time restored via `git checkout --` immediately after, confirmed via `git status --short` producing no output) and ran the real test command against them:

1. **Pre-D1 baseline** (`df2f4d3^`'s implementation + HEAD's final test file): 12 failures, all `TypeError: … is not a function` (`crearBufferAcotado`, `direccionInformada`, `esperarPreview` ×4) or value-mismatch `AssertionError`s on the old `erroresDePrecondicion`/D1-evidence tests — legitimate reasons matching the claimed RED causes, not vacuous passes.
2. **The specific "4 tests deliberately broken then repaired" claim** (task 1.4): reconstructed `df2f4d3`'s GREEN implementation (post-1.3, new `ResultadoDePreview`-shaped `PreflightHandheld`) paired with `df2f4d3^`'s OLD-style fixture tests (still using `previewAlcanzable: boolean`). Result: **exactly** the 4 `erroresDePrecondicion` tests fail — all `TypeError: Cannot read properties of undefined (reading 'exito')` — precisely the "old `previewAlcanzable` field ignored" reason `apply-progress.md` claims, reproduced independently rather than taken on faith.

Both reconstructions are real, re-runnable evidence, not the agent's own assertion.

### Assertion Quality
✅ All assertions verify real behavior — no tautologies, no ghost loops over possibly-empty collections, no bare `toBeDefined()`/mock-only assertions found (`rg` scan for banned patterns returned nothing).

### D6 — Teardown Property (task 5.1/5.2)

Confirmed by source inspection (`geometriaHandheld.ts:788-798`): `ejecutar`'s `finally` calls `proceso.kill()`, `proceso.stdout?.destroy()`, `proceso.stderr?.destroy()`. `reportarFalla` (`geometriaHandheld.ts:652-658`) confirmed to only set `process.exitCode = 1`, never call `process.exit()` — so D6's pipe-destroy is genuinely load-bearing for exit-code delivery, matching the design's rationale exactly. No unit test exists for this by design (runtime teardown property); both my provoked-failure run (29.6s total, no hang, no leaked process/port) and the pre-existing successful-run evidence confirm the process exits promptly rather than hanging on a held pipe handle.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| D1 discriminated union + rename | ✅ Implemented | `alcanceDelPreview: ResultadoDePreview`, `previewAlcanzable` fully removed |
| D2 bounded capture buffer | ✅ Implemented | Keep-first-bytes, dropped-count marker, 16 KiB default |
| D3 poll-not-race reachability wait | ✅ Implemented | Terminal-state check at top of each attempt, bounded `"close"`-equivalent grace, banner-race poll |
| D4 `--host 127.0.0.1` | ✅ Implemented | `spawnServidorPreview` argv; CI-only verifiable per design's own table, not a gap |
| D6 pipe teardown | ✅ Implemented | Confirmed above |
| D7 CI job rename | ✅ Implemented | `ci.yml:254`, job id `bundle` unchanged |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D1-D7 | ✅ Yes | `apply-progress.md` reports "Deviations from Design: None"; source inspection confirms — including D3(a)'s stated functional-equivalence rationale for implementing the "close" grace as `sonda.dormir(GRACIA_CIERRE_MS)` rather than an event subscription |
| Threat matrix (no widened subprocess surface) | ✅ Yes | `spawn` still uses an argv array, no `shell` option; only the data *direction* changed (stdio piped instead of ignored) |

### Issues Found

**CRITICAL**: None

**WARNING**:
1. `esperarPreview`'s success branch has no test where the `Local:` banner is permanently absent through the full `2×esperaMs` grace period (the R2c "honest no-banner" scenario at the integration level). The underlying `direccionInformada` fallback is directly and correctly unit-tested; the composing code in `esperarPreview` is a simple, typechecked pass-through with no branching that would differ between the tested and untested cases. Low risk, but strictly a real gap — reported rather than waved through.

**SUGGESTION**:
1. `apply-progress.md` states "ALL 25 tasks complete" (lines 3, 74); the actual `tasks.md` checkbox count is 21, all checked. Cosmetic self-report inaccuracy with zero functional or completeness impact — worth a one-line correction next time this artifact is touched.

### Verdict
**PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING (partial test coverage on one success-path fallback branch, low risk), 1 SUGGESTION (cosmetic task-count miscount). All 21 tasks genuinely complete; 758/758 tests and typecheck independently reproduced green; TDD RED-for-the-right-reason independently reproduced (not accepted on assertion) for the D1 rename and the specific "4 tests deliberately broken" claim; the failure-diagnostics path — this change's entire purpose — was deliberately provoked and observed working end-to-end with real captured vite output, not inferred from the passing run alone. Ready for `sdd-archive`.
