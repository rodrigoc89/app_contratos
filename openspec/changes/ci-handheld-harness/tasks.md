# Tasks: make the handheld harness report why its preview server never answered

**Spec requirement shorthand** (used inline as `(R1)`, `(R2a)`, etc.):
- R1 = "the preview reachability wait ends immediately on a preview process crash"
- R2a/b/c = "vite preview's own diagnostic output is captured and reported" — scenarios: (a) captured output surfaced on failure, (b) announced address reported on success, (c) honest no-banner fallback
- R3a/b = MODIFIED "the handheld geometry harness fails closed on both empty and short runs" — scenarios: (a) absent build, (b) unreachable preview names its cause with evidence

R3's zero-measurement and S3-drift scenarios are untouched by this change (no design decision touches `erroresDeCobertura`) — no task.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-360 (`geometriaHandheld.ts` ~160-190; `geometriaHandheld.spec.ts` ~110-150 across 7 new RED tests + 4 fixture updates + fake-`SondaDePreview` scaffolding; `ci.yml` ~2) |
| 400-line budget risk | Medium — under budget but with real margin uncertainty; design.md's own rollout estimate (~150-220) covers `geometriaHandheld.ts` alone, not the full `spec.ts` growth counted here |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not applicable — no chaining decision needed at this estimate) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units (commits within the single PR)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | D1 diagnostic types + precondition rendering | PR 1 | `pnpm --filter @contratos/web test` | N/A — pure fixture tests, no subprocess | Revert `PreflightHandheld`/`erroresDePrecondicion` + fixture updates; independent of 2-6 |
| 2 | D2 bounded capture buffer (`crearBufferAcotado`) | PR 1 | `pnpm --filter @contratos/web test` | N/A — pure function | Revert `crearBufferAcotado`; unused until Unit 4 wires it |
| 3 | D3 `direccionInformada` + `esperarPreview` rewrite; D4 `--host` flag | PR 1 | `pnpm --filter @contratos/web test` | N/A — fake `SondaDePreview`, no real subprocess; D4 is CI-only verifiable per design's verifiability table | Revert the rewritten `esperarPreview`/`direccionInformada`; old boolean-returning version restorable via `git revert` |
| 4 | Wire real capture + probe into `ejecutar` | PR 1 | `pnpm --filter @contratos/web typecheck` (vitest does not typecheck this wiring) | `pnpm --filter @contratos/web handheld` — real preview + real probing | Revert `ejecutar`'s call site + `spawnServidorPreview`'s stdio change together |
| 5 | D6 destroy piped stdout/stderr in `finally` | PR 1 | N/A — no unit test possible (runtime teardown property) | `pnpm --filter @contratos/web handheld` — confirm prompt exit | One-line revert of the two `.destroy()` calls, independent of Units 1-4 |
| 6 | D7 CI job rename | PR 1 | N/A — one `name:` line | Proven by this PR's own CI run, not reproducible locally | One-line revert of `ci.yml:254` |

## Phase 1: D1 — diagnostic types & precondition rendering

- [x] 1.1 RED: `geometriaHandheld.spec.ts` — `erroresDePrecondicion` on a literal `DiagnosticoDePreview` fixture asserts the rendered failure string includes `intentos`, `transcurridoMs`, `finDelProceso`, `ultimoErrorDeSondeo`, and `salidaCapturada`. Must fail — the function still takes `previewAlcanzable: boolean`. (R2a, R3b)
- [x] 1.2 RED: same file — `{ exito: true, ... }` yields `[]`; broken `dist/` + `{ exito: false, diagnostico }` yields exactly 2 errors. Must fail — same reason. (R3a, R3b)
- [x] 1.3 GREEN: in `apps/web/scripts/geometriaHandheld.ts`, add `DiagnosticoDePreview`/`ResultadoDePreview` (D1's discriminated union), rename `PreflightHandheld.previewAlcanzable` → `alcanceDelPreview: ResultadoDePreview`, rewrite `erroresDePrecondicion` to render the evidence. Satisfies 1.1-1.2.
- [x] 1.4 Update the 4 now-broken existing tests in `geometriaHandheld.spec.ts:92-114` (`describe("erroresDePrecondicion")`) to construct `ResultadoDePreview` fixtures instead of `previewAlcanzable: boolean` — deliberate fallout from 1.3's type widening (design D1), not a surprise regression.

## Phase 2: D2 — bounded capture buffer

- [x] 2.1 RED: `geometriaHandheld.spec.ts` — `crearBufferAcotado(limite)` keeps the first bytes past the limit and appends `"… (N more bytes dropped)"` naming the exact dropped-byte count. Must fail — the function does not exist. (R2a)
- [x] 2.2 GREEN: implement `crearBufferAcotado`/`BufferAcotado`/`LIMITE_CAPTURA_BYTES` (16 KiB) in `geometriaHandheld.ts` per D2 (keep-first-bytes eviction). Satisfies 2.1.

## Phase 3: D3/D4 — address parser & reachability wait rewrite

*Design's RED-test table lists `direccionInformada` as item 7, after the `esperarPreview` items (3-5). Sequenced first here because `esperarPreview`'s GREEN (3.6) calls `direccionInformada` to populate the success branch's `direccion` field — a hard dependency, not a reordering of the design's test content.*

- [x] 3.1 RED: `geometriaHandheld.spec.ts` — `direccionInformada` on captured text containing an ANSI-coded `Local:` line returns it stripped; on text with none, returns `"(vite printed no address before the first successful probe)"`. Must fail — function does not exist. (R2b, R2c)
- [x] 3.2 GREEN: implement `direccionInformada` per D3. Satisfies 3.1.
- [x] 3.3 RED: same file — a fake `SondaDePreview` whose `sondear` resolves `200` on the 3rd call, with fake `ahora`/`dormir`, returns `{ exito: true, direccion, intentos: 3, transcurridoMs }`. Must fail — `esperarPreview` still takes a bare `url` and returns `boolean`. (R2b)
- [x] 3.4 RED: same file — an always-rejecting `sondear` with `estadoDelProceso` reporting a live child throughout exhausts exactly 40 attempts and reports fake-clock `transcurridoMs`. Must fail — same reason. (R3b)
- [x] 3.5 RED: same file — `estadoDelProceso()` returning `"exit 1"` on attempt 2 ends the wait immediately; assert `intentos < 40`. Must fail — current `esperarPreview` has no process-state check. (R1)
- [x] 3.6 GREEN: rewrite `esperarPreview(url, sonda: SondaDePreview, intentos = 40, esperaMs = 250): Promise<ResultadoDePreview>` per D3 — poll terminal state at the top of each attempt; on a terminal state wait `"close"` bounded 250 ms; on the first successful probe, poll for a `Local:` line up to `2 × esperaMs`. Satisfies 3.3-3.5.
- [x] 3.7 Add `--host 127.0.0.1` to `spawnServidorPreview`'s argv per D4. No unit test — design's verifiability table marks D4 CI-run-only. (R2b)

## Phase 4: wire real capture + probe into `ejecutar`

*Integration only — no new unit-level RED; proven by 4.3's typecheck and Phase 5's real-process runs.*

- [ ] 4.1 `spawnServidorPreview`: change `stdio` to `["ignore", "pipe", "pipe"]`, attach synchronous `"data"` listeners on `stdout`/`stderr` at spawn into one `crearBufferAcotado()` instance.
- [ ] 4.2 Implement the real `SondaDePreview` (fetch-based `sondear`, real `dormir`/`ahora`, `estadoDelProceso` from `"exit"`/`"error"` listeners, `salida` reading the buffer); wire it into `ejecutar`'s `esperarPreview` call; branch on `ResultadoDePreview`, report `intentos`/`transcurridoMs`/`direccion` on success. (R2b, R2c, R3b)
- [ ] 4.3 Type-level proof: run `pnpm --filter @contratos/web typecheck`. `vitest run` does not typecheck — `apps/web/vitest.config.ts` declares no `typecheck` block, specs are transpiled by esbuild — so this command, not `vitest`, is the only proof for 4.1-4.2's wiring.

## Phase 5: D6 — process teardown safety (highest-risk item — sequenced ahead of CI/close-out)

- [ ] 5.1 In `ejecutar`'s `finally`, alongside `proceso.kill()`, add `proceso.stdout?.destroy()` and `proceso.stderr?.destroy()` per D6.
- [ ] 5.2 Verification — D6 has no unit test and cannot have one (runtime teardown property). Run `pnpm --filter @contratos/web handheld` locally and confirm the process exits promptly; record the observed exit behavior as the only proof.

## Phase 6: D7 — CI job rename

- [ ] 6.1 `.github/workflows/ci.yml:254` — change the `bundle` job's `name:` line to `dist/ size ceiling, compiled-output guards and handheld geometry` (job id `bundle` unchanged).

## Phase 7: close-out

- [ ] 7.1 Run `pnpm --filter @contratos/web test` against the full diff; record pass/fail.
- [ ] 7.2 Run `pnpm --filter @contratos/web typecheck` against the full diff; record pass/fail — separate proof from 7.1 per the note in 4.3.
