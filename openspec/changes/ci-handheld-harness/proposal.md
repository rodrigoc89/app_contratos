# Proposal: make the handheld harness report why its preview server never answered

## Intent

**Current-state gap.** The `Handheld geometry harness` step has failed on every
`master` push checked (`33193990390`, `32794669649`, `32796027612`,
`32797125151`) and passes locally every time. Its ~11s wall time is almost
exactly `esperarPreview`'s own fixed 10s budget (40 × 250ms), so the whole step
is consumed inside the retry loop. The harness discards its own evidence in
**three** places: `stdio: "ignore"` throws away `vite preview`'s startup log —
the one line that prints the address it actually bound; no `'exit'` or `'error'`
listener is ever attached to the child, so a launch crash is indistinguishable
from a slow start; and the probe's `catch { }` discards the fetch error
entirely. What reaches the CI log is one string: `the vite preview server never
became reachable`.

That string cannot separate *still cold-starting* from *crashed on launch* from
*bound to the wrong interface* — three mechanisms with an identical symptom.
`handheld-readiness` already requires the harness to report **which**
precondition failed, and it does. It is still a dead end, because *which* was
never the missing information.

**Why now.** A permanently red required check trains maintainers to ignore it,
which is how the *next* real regression ships unnoticed. The job's name makes it
worse: `dist/ size ceiling and compiled-output guards` sent weeks of triage at
bundle size while both size steps passed every run. A wrong signpost outranks a
missing one — it sends people in circles.

**Success.** The next CI failure names its own cause (bound address, exit code,
captured stderr, attempts, elapsed ms), so whatever finally turns the job green
is chosen from evidence instead of guessed.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | Capture subprocess diagnostics: `stdio: "pipe"` with buffered stdout/stderr, plus `'exit'`/`'error'` listeners so a launch crash short-circuits the loop instead of burning the full 10s |
| 2 | Widen `PreflightHandheld.previewAlcanzable` from `boolean` to a diagnostic record, and have `erroresDePrecondicion` render **why** the preview was unreachable — attempts, elapsed ms, exit/signal, last probe error, captured output |
| 3 | Bind the preview explicitly: `vite preview --host 127.0.0.1`, the exact literal the probe hardcodes |
| 4 | Rename the `bundle` CI job so its name covers the browser step it actually runs |

### Out of Scope

- **Widening the 10s budget or adding backoff.** Deferred deliberately until
  deliverable 1 proves "still starting" rather than "crashed" or "wrong
  interface" — see Decision 1.
- **Extracting a shared "wait until healthy" helper.** One TypeScript caller
  exists; a generic helper for a single call site is a parallel representation
  of existing truth.
- **Splitting `bundle` into two jobs.** A rename fixes the signpost; a split
  duplicates checkout, install, and `vite build` for the same information.
- **`vite.config.ts`'s `preview.allowedHosts`.** Ruled out with documented Vite
  evidence: IP-literal probes are exempt from the check. Do not reopen it.
- Any change to the geometry/coverage assertions, committed constants,
  fixtures, or the S1–S6 visit scripts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `handheld-readiness`: the scenario *"an absent build or dead preview server
  fails the harness"* currently requires the harness to report **which**
  precondition failed. Strengthen it so an unreachable preview must also report
  **why** — the observed evidence, not just the verdict.

## Approach

Exploration **Approach 1 + Approach 3**, deferring 2 and 4.

**Ordering principle, stated explicitly.** A fix that makes the failure
diagnosable outranks a fix that makes this particular red turn green. The second
cannot be verified: the same 10s symptom is produced by three distinct
mechanisms, and widening the budget against the wrong one converts a reliably
reproducible red into an intermittent flake — strictly harder to triage than
what we have today.

### Decisions this proposal closes

**1. Diagnostics are the deliverable, not scaffolding for the timeout fix.**
This change succeeds when the next failure names its cause, whether or not the
job goes green in the same run. Treating diagnosability as a first-class outcome
is what makes any later timing decision evidence-based instead of a second guess.

**2. `--host 127.0.0.1` ships as correctness, not as "the fix".** The
IPv4/IPv6 loopback bind/probe mismatch remains **unconfirmed**. Confirming
evidence would be the captured `vite preview` startup line naming a `::1` or
`localhost` bind while the probe targets `127.0.0.1`; refuting evidence would be
a captured non-zero exit (a `--strictPort` conflict, for instance) or a clean
bind to `127.0.0.1` that simply answered late. Binding explicitly is right
regardless of the outcome: relying on ambient hostname resolution for an address
the harness hardcodes is a defect on its own terms.

**3. Converge on the existing named-continuation shape, in place.**
`deploy/deploy.sh:348-368` (`do_start_and_verify`) supplies the shape —
attempt-numbered progress and a named continuation on exhaustion — and
`geometriaHandheld.ts`'s own `ResultadoAlcance` (`{ exito: false, motivo }`)
supplies the type. No sibling script shares the defect: `techoDeDist.ts` does
pure filesystem reads, and a repo-wide search found no other TypeScript
server-poller. The systemic risk is a *future* harness copying the only TS
precedent, and repairing that precedent removes the risk without new machinery.

**4. Rename the job; do not split it.** This is a message fix — one `name:`
line, no new state, flag, gate, or job. No spec references the job title, so
this carries no spec impact.

**5. Strict TDD uses the seam the file already has.** `erroresDePrecondicion`
is already pure and unit-tested on fixture booleans
(`geometriaHandheld.spec.ts`). Widening its input to a diagnostic record makes
the new message driven by a failing fixture test under `pnpm --filter
@contratos/web test` — no subprocess, no browser. `esperarPreview` gains
injectable probe/sleep/child handles so the crash short-circuit and the
attempt/elapsed accounting are driven by fakes. No new test infrastructure, and
the current zero-coverage gap on this path closes as a side effect.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/scripts/geometriaHandheld.ts` | Modified | `spawnServidorPreview`, `esperarPreview`, `erroresDePrecondicion`, `PreflightHandheld`, and `ejecutar`'s call site |
| `apps/web/scripts/geometriaHandheld.spec.ts` | Modified | Failing tests first: the diagnostic message shape, the crash short-circuit, attempt/elapsed accounting |
| `.github/workflows/ci.yml` | Modified | `bundle` job `name:` only |
| `openspec/specs/handheld-readiness/spec.md` | Modified | Delta: the unreachable-preview scenario must report why |
| `apps/web/vite.config.ts` | Unchanged | `allowedHosts` investigated and ruled out |
| Geometry/coverage assertions, fixtures, visit scripts | Unchanged | Deliberately untouched |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Root cause is unconfirmed; the job may still be red after this lands | **High** | Accepted by design — the next failure becomes evidence instead of a guess. Success criteria separate "diagnosable" from "green" |
| Real verification signal exists only in CI, never locally | **Certain** | Everything except the bind behaviour is unit-testable locally; the bind is validated by one push after merge |
| Piping stdout/stderr introduces a new failure mode (backpressure on an unread pipe) | Low | Drain both streams into a bounded buffer; never leave a pipe unread |
| Captured `vite` output leaks something sensitive into a public CI log | Low | Preview serves the built `dist/` only — no DNIs, no signatures, no `.env` values |
| Diagnostics land, evidence points somewhere none of the four approaches predicted | Med | That is a successful outcome for this change; it opens a follow-up with real data |
| Renaming the job breaks a required-status-check rule pinned to the old name | Low | Confirm branch-protection required checks before merging the rename |

## Rollback Plan

Single PR, single `git revert`. The harness's asserted geometry and coverage
logic is untouched, so a revert restores exactly today's behaviour — a red step
with an uninformative message. The `--host` flag and the job rename are
independently revertible one-liners if either is implicated. No migration, no
persisted state, no server-side effect.

## Dependencies

External sequencing dependency — **not an implementation task**:

1. **At least one CI run after the diagnostics merge.** The confirming or
   refuting evidence for Decision 2 does not exist in this repository yet and
   cannot be produced locally; it is generated by the first GitHub Actions run
   that executes the instrumented harness.

## Success Criteria

**Verifiable locally, before any CI run:**

- [ ] A failing test written first asserts the unreachable-preview message
      carries attempts, elapsed time, exit/signal, and captured output
- [ ] A failing test written first asserts a child `'exit'`/`'error'` ends the
      wait immediately instead of consuming the full budget
- [ ] `pnpm --filter @contratos/web test` covers `esperarPreview`'s loop with
      fakes — no subprocess, no browser, no network
- [ ] `pnpm typecheck` and `pnpm lint` pass; the `handheld-readiness` delta is
      written and the geometry/coverage assertions are unchanged

**Only verifiable in CI — these gate "done", not "merged":**

- [ ] The next `Handheld geometry harness` failure names a concrete cause, not
      just the verdict
- [ ] The captured startup line states the address `vite preview` bound,
      confirming or refuting the loopback hypothesis
- [ ] The CI job name matches the steps it runs, so a red build points at the
      right step

## Size forecast

Estimated **~150–220 changed lines**, comfortably inside the 400-line review
budget: one script's subprocess/wait section, its spec file, a one-line workflow
rename, and a spec delta. One PR, no chaining needed.
