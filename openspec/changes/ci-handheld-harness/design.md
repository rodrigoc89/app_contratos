# Design: make the handheld harness report why its preview server never answered

The harness already knows *which* precondition failed. This change makes it know *why*, by
keeping three pieces of evidence it currently destroys: the child's stdout/stderr, the child's
terminal state, and the last probe error. Everything else about the harness — geometry
assertions, coverage constants, fixtures, visit scripts — is untouched.

**Ordering principle.** Diagnosability is the deliverable. "The job turns green" is a separate,
later, evidence-driven decision. The design below is arranged so those two outcomes are verified
independently: every claim except the bind is provable by `pnpm --filter @contratos/web test`,
and the bind is proved by one CI run.

**Provenance of the numbers below.** Claims marked *(measured)* were reproduced on a real
machine against the real `pnpm exec vite preview` process tree during design review, not reasoned
from documentation. Where a measurement contradicted an earlier assumption, the assumption was
removed rather than softened — see D2 and D4.

## Verifiability split (read this first)

| Component | Provable locally today | Needs a CI run |
|---|---|---|
| Failure-message contents (attempts, elapsed, exit/signal, last probe error, captured output) | Fixture test on `erroresDePrecondicion` | — |
| Crash short-circuit ends the wait early | Fake `SondaDePreview`, no subprocess | — |
| Bounded buffer keeps the first bytes and names the dropped count | Pure unit test on `crearBufferAcotado` | — |
| Success line reports the attempt count, elapsed time and reported address | Fixture tests | — |
| Which of the three mechanisms is actually red on the runner | Nothing | **All of it** |

## Architecture decisions

### D1 — `previewAlcanzable: boolean` becomes a discriminated union, and the field is renamed

**Choice.** Converge on the shape `ResultadoAlcance` already uses in this file
(`geometriaHandheld.ts:459`) — discriminated on `exito` — with a payload that carries the
evidence this call site actually has:

```ts
export interface DiagnosticoDePreview {
  readonly intentos: number;
  readonly transcurridoMs: number;
  /** "exit 1" | "signal SIGTERM" | "spawn error: …" | "still running". */
  readonly finDelProceso: string;
  readonly ultimoErrorDeSondeo: string;
  readonly salidaCapturada: string;
}

export type ResultadoDePreview =
  | { readonly exito: true; readonly direccion: string; readonly intentos: number; readonly transcurridoMs: number }
  | { readonly exito: false; readonly diagnostico: DiagnosticoDePreview };

export interface PreflightHandheld {
  readonly distDisponible: boolean;
  readonly alcanceDelPreview: ResultadoDePreview; // was: previewAlcanzable: boolean
}
```

`erroresDePrecondicion` stays pure and total over that record — it renders the diagnostic into
one message and pushes nothing else. No I/O, no clock, no subprocess.

**Why the success branch also carries `intentos`/`transcurridoMs`.** They are what makes a green
run interpretable rather than merely quiet — see D4. A success that took 2 attempts and a success
that took 35 attempts are different facts, and today both print nothing.

**The rename is not cosmetic.** `if (!preflight.previewAlcanzable)` is always `false` once the
field holds an object, so keeping the boolean-sounding name leaves a fail-open regression one
careless edit away — in the exact function whose entire job is to fail closed.

**Rejected.** (a) Widening `ResultadoAlcance` itself to carry the evidence: its other caller,
`intentarAlcanzarEstado`, has no address, attempt count or captured output to supply, so the
union would grow a payload half its call sites must fake. (b) Keeping `boolean` and passing a
second `diagnostico` argument alongside it: two parameters that must agree is a parallel
representation of one fact. (c) A separate `motivo: string` derived before the call: the
rendering is the thing under test, so it belongs behind the pure seam, not in front of it.

### D2 — Capture into a bounded buffer that is always drained, never merely capped

**Choice.** `stdio: ["ignore", "pipe", "pipe"]`. Both readable streams get a `"data"` listener
attached synchronously at spawn, so they are in flowing mode from the first byte. The listener
always consumes the chunk; the **buffer** is what is bounded, not the drain.

```ts
export const LIMITE_CAPTURA_BYTES = 16_384;

export interface BufferAcotado {
  readonly agregar: (fragmento: string) => void;
  readonly texto: () => string;
}

export function crearBufferAcotado(limiteBytes?: number): BufferAcotado;
```

| Rule | Value | Why |
|---|---|---|
| Cap | 16 KiB, both streams combined | Enough for vite's banner plus a stack trace; small enough to print in a CI log |
| Eviction | Keep the **first** bytes, drop later ones | The startup banner and the startup error are both at the beginning; a flood of request logs must not evict them |
| Overflow marker | `… (N more bytes dropped)` | A truncated buffer that does not say it is truncated is worse than none |
| stdin | stays `"ignore"` | Nothing is ever written to the child; a writable pipe would be an unclosed handle for no benefit |

**The rationale, corrected.** An earlier draft justified this as "an unread pipe blocks the
child". On Linux that is wrong for a Node child: writes to a pipe are asynchronous, and *(measured)*
1,638,400 bytes were written to a never-read pipe in 3 s — 24× the 64 KiB default pipe capacity —
with no stall. The real failure mode of an unread pipe is therefore **unbounded queue growth in
the writer**, not a blocked writer. The blocking-`write(2)` concern is real only for non-Node
descendants, and this tree has one: `esbuild --service` is a non-Node great-grandchild of the
harness. The rule above is correct under both semantics, which is why it does not change — only
the reason for it does.

**Rejected.** Buffering into an unbounded array. *(measured)* One chatty descendant accumulated
5.6 MB in 1.5 s, and the interesting bytes would have been at the far end of it.

### D3 — The child's terminal state is polled at the top of each attempt, not raced

**Choice.** `esperarPreview` takes an injectable seam and checks a getter each iteration:

```ts
export interface SondaDePreview {
  readonly sondear: (url: string) => Promise<number>; // resolves the status, rejects on a network error
  readonly dormir: (ms: number) => Promise<void>;
  readonly ahora: () => number;
  readonly estadoDelProceso: () => string | null;     // null while alive; a terminal description once dead
  readonly salida: () => string;                      // the D2 buffer's current contents
}

export async function esperarPreview(
  url: string, sonda: SondaDePreview, intentos = 40, esperaMs = 250,
): Promise<ResultadoDePreview>;
```

`ejecutar` builds the real seam from `fetch`, `setTimeout`, `performance.now`, the `"exit"` /
`"error"` listeners, and `crearBufferAcotado().texto`. A crash therefore ends the wait within one
iteration instead of consuming the remaining budget.

**Rejected.** `Promise.race([bucleDeSondeo, procesoTerminado])` — the losing loop keeps running
after the race settles, and the test has to reason about an orphaned timer. A polled getter is
deterministic, needs no race machinery, and is faked with a mutable object.

**Two flush details the tests must pin.**

**(a) On a terminal state, wait for `"close"`, bounded by 250 ms, before rendering.** Both halves
are load-bearing *(measured)*: 50,688 bytes arrived **after** `'exit'` from a 2 MB writer, so the
grace is the right instrument and not a guess; and in the case where a descendant survives the
kill, `'close'` **never fires at all**, so without the cap the grace would itself be the hang it
exists to avoid.

**(b) On the first successful probe, poll the buffer for a `Local:` line for up to
`2 × esperaMs`.** `printUrls()` runs after the server is listening, so the print and the first
successful probe genuinely race; without the grace the success line would usually report the
fallback string.

`direccionInformada(salida)` is pure: first `Local:`-bearing line, ANSI stripped, trimmed; else
`"(vite printed no address before the first successful probe)"`. The fallback never invents an
address. **What this line proves is narrower than it looks — see D4.**

### D4 — `--host 127.0.0.1` ships as correctness; what the CI run can and cannot settle

**The probe and the bind do not agree by construction today.** Verified against the installed
sources:

| Side | What it uses | Source |
|---|---|---|
| Probe | the IPv4 **literal** `127.0.0.1` | `geometriaHandheld.ts:265` — `URL_PREVIEW` |
| Bind | the **name** `"localhost"` | vite 6.4.3 `resolveHostname`: `optionsHost === undefined → host = "localhost"`; the spawn passes no `--host` and `apps/web/vite.config.ts`'s `preview` block sets no `host` |

They coincide only when the runner's resolver maps `localhost` to `127.0.0.1` *and* the listener
binds that address. Relying on ambient name resolution for an address the harness hardcodes is a
defect on its own terms, independent of whether it is the current cause. `vite preview` accepts
`--host [host]` (verified in the installed `vite/dist/node/cli.js` preview command definition).

#### The `Local:` line is evidence about our argv, not about the socket

An earlier draft of this design claimed `printServerUrls` renders the address actually bound.
**It does not.** In vite 6.4.3 `resolveServerUrls` (`dist/node/chunks/dep-Dm0c1Wj2.js:7085-7108`)
takes **only the port** from `server.address()` (line 7095); the hostname is
`(await resolveHostname(options.host)).name` (line 7093) — the configured **option**. The one
path that could inject resolver information, `getLocalhostAddressIfDiffersFromDNS` (line 7056),
compares two DNS lookups against each other and never consults the socket either, and it is
unreachable once `--host` is an IP literal.

*(measured)* With no `--host`, against a server `ss -ltnp` reported as `LISTEN 127.0.0.1:4174`,
vite printed `➜  Local:   http://localhost:4174/`. With `--host 127.0.0.1` it printed
`http://127.0.0.1:4174/`. **The printed name tracks the flag, never the socket.**

So a table row reading "`Local:` names something other than `127.0.0.1` → the bind was the cause"
is unsound twice over: without the flag it fires even when the bind is correct, and with the flag
— which ships in this very change — it can never fire at all. That is the same wrong-signpost
defect this change exists to remove, rebuilt one surface over. It is deleted, not softened.
`direccionInformada`'s line is still captured and printed, for one narrow and honest purpose: it
confirms the flag reached vite.

#### What shipping the flag costs, stated plainly

Pinning the bind forecloses the direct test of the historical hypothesis. Nothing can answer on
`[::1]` once we bind `127.0.0.1`, so after this change the question "was it ever a loopback
mismatch?" is no longer directly decidable. That is accepted: the proposal settled that the flag
ships as correctness regardless of cause. What we give up is the ability to say "it **was** the
bind"; what we gain is the ability to say what it **is** now.

#### The discriminators that survive

None of these reads a verdict off a line derived from an argument we ourselves pass.

| Captured evidence | What it settles |
|---|---|
| Non-zero exit or a signal before the wait ends, plus captured stderr | A launch failure — a `--strictPort` port conflict, a missing `dist/`, a config error. Named outright by the capture; the loopback question never arises |
| **Green**, success line reports a low attempt count (≈1–3, under a second) | For a child that never crashed, the bind is the only variable this change moved that affects reachability. Strong confirmation that the mismatch was real — not airtight, and labelled as such |
| **Green**, success line reports a high attempt count (>20, several seconds) | The server was genuinely slow and the old 10 s budget was marginal. This, and only this, reopens D5 with evidence |
| **Red**, child alive, 40 attempts, every probe refused (`ECONNREFUSED`) | The bind is pinned and the port still refuses: the loopback hypothesis is refuted and the cause is elsewhere |
| **Red**, child alive, last probe error is a timeout rather than a refusal | Something is listening and not answering — a mechanism none of the four explored approaches predicted. Reopen with real data |

**Rejected: probing both `127.0.0.1` and `[::1]` on failure and reporting which answered.** It is
the right instrument for the wrong timeline. It would have been decisive *before* the flag; after
it, `[::1]` cannot answer because we bound elsewhere, so "neither answered" is manufactured by our
own argument — the identical self-fulfilling defect deleted above, re-added under a new name. The
one live case it might otherwise catch, a foreign listener holding the port, already surfaces as a
non-zero exit through `--strictPort`. It adds a probe target, a report field and a test to answer
a question the same PR closes.

### D5 — The 40 × 250 ms budget does not move in this change

**Choice.** Unchanged. **Rejected:** raising it to 30 s or 60 s "while we are in here".

**Rationale.** The budget is currently the measurement instrument. The step's ~11 s wall time is
the strongest single piece of evidence that the whole step is spent inside the loop; raising it
makes a crash and a slow start take the same new, longer time, and a green run at 60 s would not
distinguish "needed 12 s" from "needed 55 s and will exceed 60 s next month" — a reliably
reproducible red traded for an intermittent flake, which is strictly harder to triage. D3 makes
this sharper, not weaker: after this change the *observed step duration itself* becomes a signal,
because the crash path now finishes in about a second instead of eleven. Moving the budget in the
same commit would destroy that signal before its first reading. D4's table names the one evidence
row that reopens this decision.

### D6 — The pipes are destroyed in `ejecutar`'s `finally`, alongside the kill

**Choice.** `proceso.kill()` stays, and gains `proceso.stdout?.destroy()` /
`proceso.stderr?.destroy()`.

**The hazard is contingent, not inevitable.** *(measured)* Against the real
`pnpm exec vite preview` tree, `'close'` fired 11 ms after `kill()` with no destroy at all —
SIGTERM propagated and nothing survived. But when a descendant does survive the signal, the
parent never exits: killed at 10 s with `'exit'` never firing. Whether the harness hangs therefore
depends on the runner's signal propagation, which is exactly the sort of environment difference
this whole change exists because we cannot see. Destroying the read ends released the parent in
~1.0 s, and in ~0.8 s even with the direct child ignoring SIGTERM and staying alive. *(measured)*
Destroying a pipe under a descendant writing 4 KiB/ms produced no unhandled stream `'error'`, and
the order of the two calls does not matter.

Two lines of unconditional insurance against a contingent hang is the right trade; the hazard is
also created by D2 and does not exist today, since `stdio: "ignore"` leaves no handle to keep.

**This is load-bearing for the fail-closed requirement, not hygiene.** The MODIFIED spec requires
the harness "MUST exit non-zero". `reportarFalla` (`geometriaHandheld.ts:451-457`) only sets
`process.exitCode`; it never calls `process.exit()`. A non-zero exit code set that way is
*delivered* only when the event loop drains. A live pipe handle keeps the loop alive, so the
harness would compute the correct verdict and then never deliver it — CI would record a
15-minute timeout kill instead of a named failure. D6 is what connects `process.exitCode` to the
requirement.

**Rejected.** `detached: true` plus `process.kill(-pid)` — correct process-group teardown, but a
larger behavioural change to the spawn than this diagnostics change should carry, and untestable
without a real subprocess.

### D7 — The CI job is renamed, not split

One line, `.github/workflows/ci.yml:254`:

```yaml
name: dist/ size ceiling, compiled-output guards and handheld geometry
```

The job **id** `bundle` is unchanged. `master` has no branch protection and no rulesets, so no
required status check is pinned to the old display name; the rename carries no gate risk.

**Rejected.** Splitting the browser step into its own job — it would duplicate checkout, install
and `vite build` to surface information a name already carries. This is a message fix; it adds no
state, flag, gate or job.

## Data flow

```
spawn(pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort)
   stdout ─┐
   stderr ─┴─→ "data" listener ──→ crearBufferAcotado() ──→ sonda.salida()
   "exit"/"error" ─────────────────→ sonda.estadoDelProceso()
                                                │
   esperarPreview(url, sonda) ── per attempt: terminal? probe? sleep ──→ ResultadoDePreview
                                                                              │
        exito:true  → console.log(direccion, intentos, transcurridoMs)  ──────┤
        exito:false → erroresDePrecondicion({ distDisponible, alcance }) ──→ reportarFalla
                                                                              │
   finally: proceso.kill(); stdout.destroy(); stderr.destroy()  ──→ event loop drains → exit code delivered
```

## File changes

| File | Action | Description |
|---|---|---|
| `apps/web/scripts/geometriaHandheld.ts` | Modify | D1 types + `erroresDePrecondicion` rendering; D2 spawn + `crearBufferAcotado`; D3 `esperarPreview` seam + `direccionInformada`; D4 flag; D6 `finally` |
| `apps/web/scripts/geometriaHandheld.spec.ts` | Modify | RED tests below, added to the existing `erroresDePrecondicion` describe plus two new ones |
| `.github/workflows/ci.yml` | Modify | D7 — one `name:` line |
| `apps/web/vite.config.ts` | Unchanged | `allowedHosts` ruled out with documented evidence; do not reopen |
| Geometry/coverage assertions, fixtures, visit scripts | Unchanged | — |

## Testing strategy

Strict TDD. Test file: `apps/web/scripts/geometriaHandheld.spec.ts`. Runner:
`pnpm --filter @contratos/web test`. No subprocess, no browser, no network in any of these.

| # | RED test (write first) | Drives |
|---|---|---|
| 1 | `erroresDePrecondicion` on a literal `DiagnosticoDePreview` fixture reports attempts, elapsed ms, `finDelProceso`, last probe error and the captured output | D1 — forces the type widening and the rename |
| 2 | `{ exito: true, … }` yields `[]`; a broken `dist/` plus an unreachable preview still yields exactly 2 | D1 — the existing four cases, ported |
| 3 | A fake `SondaDePreview` answering `200` on attempt 3 returns `exito: true` carrying `direccion`, `intentos: 3` and the fake clock's elapsed ms | D3, D4 |
| 4 | A probe that always rejects with a live child exhausts exactly 40 attempts and reports the fake clock's elapsed ms | D3, D5 |
| 5 | `estadoDelProceso()` returning `"exit 1"` on attempt 2 ends the wait at attempt 2 — assert attempts < 40 and that `finDelProceso` reaches the message | D3 — the short-circuit |
| 6 | `crearBufferAcotado(limite)` keeps the first bytes and appends the dropped-byte count once past its limit | D2 |
| 7 | `direccionInformada` returns the `Local:` line ANSI-stripped, and the explicit fallback when no such line exists | D3 |

Not unit-testable, verified by running `pnpm --filter @contratos/web handheld` locally: D6 (the
harness still exits promptly) and D4 (the bind, which only CI can settle).

## Threat matrix

| Boundary | Applicability | Design response | Planned RED test |
|---|---|---|---|
| Documentation-like paths | **N/A** — no file is classified executable by content; the harness runs one fixed argv | — | — |
| Git repository selection | **N/A** — this change invokes no git | — | — |
| Commit state | **N/A** — nothing is staged, committed or read from the index | — | — |
| Push state | **N/A** — nothing is pushed | — | — |
| PR commands | **N/A** — no PR/VCS automation | — | — |

The real boundary this change touches is the subprocess itself, and it does not widen:
`spawn` is called with an argv array and **no** `shell` option, so there is no shell
metacharacter surface; every argument (`--host 127.0.0.1`, `--port 4174`, `--strictPort`) is a
literal or a committed constant, with no interpolation of external input. What changes is the
*direction* of data — output now flows parent-ward — which is covered by D2's drain rule and D6's
teardown.

## Migration / rollout

One PR, no chaining. Forecast ~150–220 changed lines, inside the 400-line budget. No migration,
no persisted state, no server-side effect. `git revert` restores today's behaviour exactly; the
`--host` flag and the job rename are independently revertible one-liners.

## Resolved during design review

- **The 250 ms `"close"` grace is correct and its cap is load-bearing.** Settled in D3a with
  measurements; it is not a placeholder awaiting a better number.
- **No parent-side grace can recover a tail from a child that dies via `process.exit()`.**
  *(measured)* 146,176 of 204,813 bytes were delivered: the child discards its own pending
  asynchronous pipe writes on the way out, before the parent can read them. **Do not raise 250 ms
  to 2 s expecting to recover a truncated stack trace — no value recovers it.** If a capture ever
  looks truncated at the tail, the missing bytes are gone at the source, and the fix would have to
  be on the child's side (a flush before exit), not the parent's.
- **Node's stdio-flush ordering around `"exit"`** — the earlier open question — is answered by the
  same measurement: bytes do arrive after `'exit'`, which is why D3a exists.

## Open questions

- [ ] **Spec touch-up for the tasks phase** (`specs/handheld-readiness/spec.md`, the
      success scenario). Two wordings no longer match what is buildable, both traceable to the D4
      finding: (a) the THEN says the harness "prints one line naming the address", but
      `direccionInformada`'s honest fallback names no address when vite printed none — refusing to
      invent one is the correct behaviour, so the scenario should permit it; (b) the scenario says
      "the address `vite preview` reports having bound", and vite reports the configured host
      option, not the bound socket. Carry both as a spec edit, not a code workaround.
