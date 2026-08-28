# Exploration — ci-handheld-harness

## Exploration: the `Handheld geometry harness` CI step is red on every `master` push

### Current State

**1. What is confirmed already (do not re-derive)**

The `bundle` job (`dist/ size ceiling and compiled-output guards`) has a misleading
name: its first two steps (`Check the dist/ size ceiling`, `Compiled-output style
guards`) both PASS. The failing step is the fifth and last one, `Handheld geometry
harness` (`pnpm --filter @contratos/web handheld` → `jiti scripts/geometriaHandheld.ts`).
It has failed on every occurrence checked (`33193990390`/`98926337675`,
`32794669649`, `32796027612`, `32797125151`) and passes on the developer's
local machine every time.

**2. Exact step timing for the most recent failure (`98926337675`, PR #132)** — pulled
directly from `gh api repos/.../actions/jobs/98926337675`:

| Step | Started | Completed | Duration |
|---|---|---|---|
| Install Chromium for Puppeteer | 17:18:09 | 17:18:10 | 1s (cache hit) |
| **Handheld geometry harness** | **17:18:10** | **17:18:21** | **11s — fails** |

The step's total wall time (~11s) is almost exactly the harness's own fixed
reachability budget (see below), which is strong, direct evidence that
essentially the entire step is consumed inside the retry loop, not somewhere
else (dependency install, jiti compile, fixture load).

**3. `esperarPreview` — the reachability wait (`apps/web/scripts/geometriaHandheld.ts:431-444`)**

```ts
const PUERTO_PREVIEW = 4174;
const URL_PREVIEW = `http://127.0.0.1:${PUERTO_PREVIEW}`;

function spawnServidorPreview(): ChildProcess {
  return spawn("pnpm", ["exec", "vite", "preview", "--port", String(PUERTO_PREVIEW), "--strictPort"], {
    cwd: join(import.meta.dirname, ".."),
    stdio: "ignore",
  });
}

async function esperarPreview(url: string, intentos = 40, esperaMs = 250): Promise<boolean> {
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      const respuesta = await fetch(url);
      if (respuesta.status < 500) return true;
    } catch {
      // Not up yet — retried below.
    }
    await new Promise((resolver) => setTimeout(resolver, esperaMs));
  }
  return false;
}
```

Concretely: 40 attempts × 250ms = a **hard 10-second budget**, no backoff, no
`vite`-`--host` flag (defaults to Vite's own `resolveHostname` → `"localhost"`),
probed by IPv4 literal (`127.0.0.1`, not `localhost`). `ejecutar()` calls
`spawnServidorPreview()` then `await esperarPreview(...)`, and **never attaches
any listener to the returned `ChildProcess`** — no `'exit'`, no `'error'`, no
inspection of `exitCode`/`signalCode`. Combined with `stdio: "ignore"`, this
means the harness has **zero visibility** into what `vite preview` actually did:
whether it was still starting, whether it crashed on launch, and why. On
timeout the only signal produced is the literal string `"the vite preview
server never became reachable"` (`erroresDePrecondicion`, line 82) — no
attempt count, no elapsed time, no captured stderr, no exit code.

**4. `vite.config.ts`'s `allowedHosts` — investigated and ruled out with evidence**

```ts
preview: {
  proxy: PROXY_DE_DESARROLLO,
  allowedHosts: [".trycloudflare.com"],
},
```

Hypothesis to test: does Vite reject the harness's own `fetch("http://127.0.0.1:4174")` /
Puppeteer navigation because `127.0.0.1` isn't `.trycloudflare.com`? **No** —
confirmed against current Vite docs (Context7 `/vitejs/vite`,
`docs/config/server-options.md` and `docs/config/preview-options.md`):

> "The `server.allowedHosts` option specifies which hostnames Vite is permitted
> to respond to, with **localhost, `.localhost` subdomains, and all IP addresses
> allowed by default** (and verification skipped over HTTPS)."

`preview.allowedHosts`'s own doc entry says only "See `server.allowedHosts` for
more details" — same rule applies to the preview server. The harness probes by
IPv4 literal (`127.0.0.1`), which is exempt from the `allowedHosts` check
regardless of the configured list. **This rules out the `Host`-header
hypothesis** the task asked to check — it is not implicated by the code as
written. (It would matter if the probe ever used a hostname other than
`localhost`/an IP/`.trycloudflare.com`, which it does not.)

**5. CI environment vs. local — concrete differences found**

- The `bundle` job (`.github/workflows/ci.yml:253-321`) sets **no job-level `env:`**
  block at all (unlike `verify`/`lint`/`integration`, which set `DATABASE_URL`).
  So the only environment difference from a developer's shell is whatever
  GitHub Actions itself injects by default (`CI=true`, `GITHUB_ACTIONS=true`,
  a 2-vCPU `ubuntu-24.04` runner) — none of which the harness's silenced
  subprocess lets us observe having any effect.
- `vite preview` is invoked with no `--host` flag in either environment, so
  both resolve to Vite's default `"localhost"`. Node's `net.Server.listen()`
  resolution of `"localhost"` depends on the host's resolver/`/etc/hosts`
  order (IPv4 `127.0.0.1` vs. IPv6 `::1`). The harness probes strictly by
  IPv4 literal. **This is a plausible, well-known class of "works on a
  developer's Linux box, fails on a GitHub-hosted runner" defect** (resolver
  order differs between environments) — but it is **not confirmed**, because
  `stdio: "ignore"` destroys the only evidence (`vite preview`'s own startup
  log, which prints the exact address it bound) that could confirm or refute it.
- No other job-level difference (Node 24, pnpm store, Chromium cache) stands
  out as harness-specific; `Install Chromium for Puppeteer` completing in 1s
  (cache hit) rules out "Chromium not ready" as a factor for this run.

**6. Is the failure message itself diagnosable? No — this is a defect in its own right.**

Per the task's explicit ask: the current failure output is a dead end for CI
triage. `"the vite preview server never became reachable"` cannot distinguish
between (a) the server was still cold-starting and would have succeeded at
11s, (b) the process crashed on launch (e.g., a real port conflict — unlikely
but not provably ruled out since `--strictPort` would exit hard rather than
retry a different port), or (c) the process bound to the wrong interface
(the IPv6/IPv4 hypothesis above). All three produce **the exact same observed
symptom** — `fetch` throwing/timing out for the full 10s — so **timing alone
cannot disambiguate them**, and the harness's own code (no captured
stdout/stderr, no exit-code check) cannot either. This matches
`systemic-issue-triage`'s rule: *"An issue's stated MECHANISM is a hypothesis;
only its symptom is evidence."* The symptom here (consistent, ~10s, CI-only
failure) is solid; every mechanism proposed above is not yet provable from
existing evidence.

**7. Root class — one script, not (yet) a repo-wide pattern, but the shape is real**

`apps/web/scripts/techoDeDist.ts` is the only sibling script in the same
directory and the same CI job; it does pure filesystem reads (no subprocess,
no server, no reachability wait) and is unaffected. A repo-wide search
(`rg` across `apps/`, `packages/`, `deploy/`) found **no other TypeScript
script that spawns a server and polls for reachability** — so this is not
currently a duplicated pattern across N call sites (bucket C: a real,
single-cluster bug, not a duplicate). However, the codebase **already has an
established, better idiom for exactly this shape**, in bash:
`deploy/deploy.sh`'s `do_start_and_verify` (`deploy/deploy.sh:348-368`) —
bounded retries via `HEALTH_MAX_ATTEMPTS`/`HEALTH_RETRY_DELAY_SECONDS`, an
attempt-numbered log line on every poll (`"$HEALTH_URL not ready yet (attempt
$attempt/$HEALTH_MAX_ATTEMPTS)"`), and a `print_rollback_recipe` continuation
printed on exhaustion. `geometriaHandheld.ts`'s `esperarPreview` reinvents the
same shape with none of that instrumentation. The systemic risk is not "many
broken instances today" — it is that **any future CI-spawned-server harness
in this repo would copy `esperarPreview`'s shape** (it's the only TS
precedent) unless the diagnostics gap is closed here first.

**8. Test coverage gap.** `geometriaHandheld.spec.ts` unit-tests the pure
functions only (`erroresDeCobertura`, `erroresDePrecondicion` given
booleans, the geometry assertions, `controlTapadoPorOtroElemento`). Neither
`esperarPreview` nor `spawnServidorPreview` — the actual subprocess/network
logic that is failing in CI — has any test coverage; by the file's own
header comment this section is explicitly "CLI only ... real Puppeteer, real
`vite preview`", so `pnpm -r test` can never catch this class of failure
before it reaches CI.

### Affected Areas

- `apps/web/scripts/geometriaHandheld.ts` — `esperarPreview`, `spawnServidorPreview`,
  `ejecutar` (lines 424-445, 554-579): the reachability wait, the silenced
  subprocess, and the caller that never inspects the child process
- `apps/web/vite.config.ts` — `preview.allowedHosts`/`preview.proxy` (investigated,
  ruled out as the cause; still worth confirming no regression if touched)
- `.github/workflows/ci.yml:253-321` — the `bundle` job; no job-level `env:`,
  step order already documented as ceiling → compiled-CSS → browser
- `apps/web/scripts/geometriaHandheld.spec.ts` — has zero coverage of the
  subprocess/reachability logic that is actually failing
- `deploy/deploy.sh:348-368` — the existing, better-instrumented "wait for a
  service to become healthy" idiom already in this codebase, worth mirroring
  rather than reinventing further

### Approaches

1. **Capture and surface subprocess diagnostics** — stop discarding `vite
   preview`'s stdout/stderr (`stdio: "ignore"` → `"pipe"`, buffered and
   attached to the failure message), and listen for the child's `'exit'`/`'error'`
   events so an early crash short-circuits the retry loop instead of silently
   burning the full 10s budget. Report attempt count and elapsed time in
   `erroresDePrecondicion`'s message.
   - Pros: directly fixes the diagnosability defect (task point 6) regardless
     of which mechanism turns out to be true; the very next CI failure would
     tell us definitively whether it's a slow start, a crash, or a bind
     mismatch; zero risk of masking a real bug behind a longer timeout.
   - Cons: does not by itself make the job green — if the true cause is
     "just needs more time," this alone doesn't fix it (but it proves that
     before spending effort widening the timeout blind).
   - Effort: Low.

2. **Widen the timeout / add backoff** (e.g., 40×250ms → longer budget, possibly
   exponential) — treat this as a CI-cold-start problem and give more headroom.
   - Pros: cheap to try; if the true cause is simply "CI is slower than the
     dev machine," this fixes it outright.
   - Cons: pure guesswork without evidence from Approach 1 — the same 10s
     symptom is equally consistent with a hard crash that would never
     succeed no matter how long you wait (e.g., a bind-address mismatch); a
     wrong guess here converts a **reliable, reproducible red build** into an
     **intermittent flake** that is strictly harder to triage later, which
     `systemic-issue-triage` explicitly warns against (trust reproduction
     evidence over an untested mechanism).
   - Effort: Low, but epistemically risky without Approach 1 first.

3. **Bind the preview server to an explicit host** — pass `--host 127.0.0.1`
   to `vite preview` so it binds the exact literal the harness probes,
   removing the `"localhost"` resolver-order ambiguity between a developer's
   machine and the GitHub-hosted runner entirely, provably, regardless of
   which one turns out to resolve differently.
   - Pros: closes a real, known category of "green locally / red on GH
     Actions" defect (loopback resolver-order divergence) outright rather
     than working around its symptom; small, self-contained, one flag.
   - Cons: if this isn't the actual cause, it's a no-op that doesn't fix the
     job (though it's still strictly more correct to bind explicitly than to
     rely on ambient hostname resolution for the exact address the harness
     hardcodes).
   - Effort: Low.

4. **Extract a shared "wait for server ready" helper**, mirroring
   `deploy.sh`'s `do_start_and_verify` (attempt-numbered logging, a named
   exit/continuation on exhaustion) as a reusable TypeScript utility.
   - Pros: would prevent this exact shape from being silently re-copied into
     a second CI-spawned-server harness in the future, with the diagnostics
     built in from the start.
   - Cons: premature — there is currently exactly **one** caller in the
     TypeScript codebase (`geometriaHandheld.ts`); extracting a generic
     helper for a single call site is the kind of "parallel representation of
     existing truth" `systemic-issue-triage`'s over-engineering test warns
     against. Better deferred until a second caller actually exists.
   - Effort: Medium (and arguably not yet justified).

### Recommendation

**Approach 1 + Approach 3, in that order, as one small fix; defer 2 and 4.**

Ship the diagnostics fix (1) first — it is strictly necessary regardless of
root cause and turns every future occurrence (there will be at least one more
CI run before this merges) into hard evidence instead of a guess. Combine it
with the explicit `--host 127.0.0.1` bind (3): it is cheap, provably correct
independent of whether it's the actual cause here, and closes a real,
documented category of CI-only failure. **Do not widen the timeout (2)**
before a CI run with captured diagnostics confirms "still starting" rather
than "crashed" or "wrong interface" — per `systemic-issue-triage`'s rule that
an issue's stated mechanism is a hypothesis until reproduced, guessing a
longer timeout risks turning a reliably-reproducible defect into an
intermittent flake, which is strictly worse to triage later. Defer the shared
helper (4) — one caller does not justify new machinery yet; revisit if a
second CI-spawned-server harness appears.

### Risks

- The IPv4/IPv6 loopback-resolution hypothesis (item 5 above) is plausible
  and consistent with all observed evidence, but **not confirmed** — the next
  CI run, once Approach 1's diagnostics land, is required to either confirm
  it or reveal a different mechanism (e.g., a genuine cold-start timing gap,
  or something `stdio: "ignore"` is currently hiding entirely). The fix
  recommended here should not be treated as proven-correct until that
  evidence exists.
- `--strictPort` means any real port conflict makes `vite preview` exit
  immediately rather than retry on another port; this is untested against the
  GH Actions environment specifically and remains an open, low-probability
  alternative explanation, also only checkable once diagnostics are captured.
- `geometriaHandheld.spec.ts` has no coverage of the subprocess/reachability
  path (item 8) — any fix here will land without a unit test proving it,
  because the surrounding logic is explicitly real-Puppeteer/real-`vite
  preview` and out of scope for the fixture-driven pure-function tests. A
  design for the actual fix should consider whether a narrow, fake-child-process
  unit test for `esperarPreview`'s new diagnostics path is feasible, so this
  gap in strict-TDD coverage doesn't recur.
- This exploration did not run the harness itself, in CI or locally, and did
  not modify any code — per the phase's constraints, all conclusions above
  are from static reading (`geometriaHandheld.ts`, `vite.config.ts`,
  `ci.yml`) and the CI job/step API (`gh api .../jobs/98926337675`), not from
  a reproduction.

### Ready for Proposal

Yes. The root class is understood (a single, real defect — silenced
subprocess diagnostics over an untuned, unconfirmed CI timeout budget — not a
duplicate, not superseded by an in-flight change), the `allowedHosts`
red herring is ruled out with documented evidence, and the two-step
recommended fix (diagnostics first, explicit host bind alongside it) is
small enough to fit comfortably inside the 400-line review budget without
touching the harness's asserted geometry/coverage logic at all.
