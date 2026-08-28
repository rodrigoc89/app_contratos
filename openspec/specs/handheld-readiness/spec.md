# Handheld Readiness Specification

## Purpose

The técnico flow treats phones and tablets as equal targets: no horizontal
overflow and every touch target ≥48px from 360px viewport width up — the
bar the office panel already cleared per
`docs/sdd/contract-list-search/design.md` D12/D13. `apps/web`'s
`vitest`/`jsdom` unit suite has no layout engine and cannot verify
rendered geometry directly — but that is a property of that one suite, not
of this repository: `apps/api` already runs Puppeteer against a real
Chrome in CI, and design decision D8 extends that same mechanism into
`apps/web` via `apps/web/scripts/geometriaHandheld.ts`, driving `vite
preview` over the real `dist/` build.

**The measured unit is application state, not a route.** `rutas.tsx`
declares exactly one técnico route (`path: "/"`); `LienzoDeFirma` and
`VisorDeDocumento` — the surfaces guards 19 and 17 protect, and the ones
most at risk on a 360px screen — are reached only through in-page state
transitions inside that one route, not separate URLs. The técnico-relevant
states are:

| State | Reached by |
|---|---|
| S2 | `/` in its initial `FormularioBorrador` state — navigation + seeded técnico session |
| S3 | `/` after filling the draft and submitting — `LienzoDeFirma`/`VisorDeDocumento` — **driven**: the harness fills the draft form, an intercepted `POST /contratos` returns a fixture, then taps "Continuar" |

S3's visit script is maintained alongside `FormularioBorrador` and is the
most brittle piece of this mechanism: when the form's fields drift, the
script can silently stop reaching S3. The fail-closed requirement below
exists specifically to contain that. **S3 cannot exist before slice F**,
since it requires `LienzoDeFirma` and `VisorDeDocumento` already
converted; slices A–E correctly measure S2 only. Every scenario below is
an automated CI assertion, not a manual check.

## Requirements

### Requirement: no horizontal overflow across técnico states at handheld widths

Every técnico state MUST render with
`document.documentElement.scrollWidth === document.documentElement.clientWidth`
at 360px, 390px, and 430px, asserted automatically by
`geometriaHandheld.ts` (D8). S2 is measured from slice A; S3 is measured
from slice F once it exists.

#### Scenario: no scrollWidth overflow at 360–430px in S2

- GIVEN `geometriaHandheld.ts` serving the production `dist/` build
  through `vite preview`, with `/auth/*` and `/contratos/*` requests
  intercepted and fulfilled from committed fixtures, and the service
  worker bypassed
- WHEN it navigates to S2 (`/` with a seeded técnico session) at 360px,
  390px, and 430px with `isMobile`/`hasTouch` set
- THEN `scrollWidth === clientWidth` on `document.documentElement` at
  every width

#### Scenario: no scrollWidth overflow at 360–430px in S3 (from slice F)

- GIVEN the same harness, extended in slice F to drive S3 — filling the
  draft form, an intercepted `POST /contratos` returning a fixture, then
  tapping "Continuar" to reach `LienzoDeFirma`/`VisorDeDocumento`
- WHEN `scrollWidth`/`clientWidth` are read at 360px, 390px, and 430px
  once S3 is reached
- THEN they are equal at every width

#### Scenario: the measured 104px header regression does not recur

- GIVEN the same harness rendering `CabeceraDeSesion` inside the converted
  `LayoutTecnico` at 390px, in either S2 or S3
- WHEN the header's rendered height is measured via `getBoundingClientRect()`
- THEN it stays within a committed single-row height budget — the
  measured 104px two-row height is the regression the assertion must
  reject

### Requirement: every técnico control is ≥48px across técnico states at handheld widths

Every interactive control reachable in S2 or S3 MUST be ≥48px on both
axes at 360px and 430px, checked both by the static class/token scan
(styling-guards' ported guard 20, `pisoDeToque.ts`) and by
`geometriaHandheld.ts`'s rendered `getBoundingClientRect()` measurement,
using the same tag set and `EXENCIONES` list as the static scan so the two
checks cannot disagree about what counts as a control.

#### Scenario: a rebuilt static scan confirms sizing tokens

- GIVEN the técnico flow's converted JSX
- WHEN the ported guard 20 scan (styling-guards capability) runs against it
- THEN every interactive element resolves to a ≥48px sizing class on both
  axes

#### Scenario: the rendered box is measured automatically in S2

- GIVEN `geometriaHandheld.ts` rendering S2 at 360px and 430px
- WHEN every interactive element's `getBoundingClientRect()` is measured,
  classified by the same tag set and `EXENCIONES` list `pisoDeToque.ts`
  uses
- THEN every measured control is ≥48px on both axes at both widths

#### Scenario: the rendered box is measured automatically in S3, once slice F reaches it

- GIVEN `geometriaHandheld.ts`, extended in slice F, driving S3 to reach
  `LienzoDeFirma` and `VisorDeDocumento` at 360px and 430px
- WHEN every interactive control in those surfaces — including
  Deshacer/Borrar — is measured via `getBoundingClientRect()`
- THEN every measured control is ≥48px on both axes at both widths

### Requirement: the preview reachability wait ends immediately on a preview process crash

The harness MUST NOT continue polling for the full reachability budget when
the `vite preview` child process exits or errors before becoming reachable.
The wait MUST end at the moment the child process signals `'exit'` or
`'error'`, treating that as an immediate exhaustion of the wait instead of
continuing to poll for the remaining budget.

#### Scenario: a preview crash ends the wait before the polling budget elapses

- GIVEN the `vite preview` child process exits or errors shortly after being
  spawned, before ever answering a reachability probe
- WHEN the harness is waiting for the preview server to become reachable
- THEN the wait ends immediately on the child process's `'exit'`/`'error'`
  event, without consuming the remaining polling budget

### Requirement: `vite preview`'s own diagnostic output is captured and reported

Amended after verification: `vite preview`'s startup banner names the host it
was *configured* to serve (`resolveHostname(options.host)`), not the socket
it actually bound (`server.address()` supplies only the port) — confirmed by
reading `resolveServerUrls` in the installed vite build and by two local
runs, one with no `--host` flag (banner printed `localhost`) and one with
`--host 127.0.0.1` (banner printed `127.0.0.1`) against the same bound
socket. A requirement that called this address "bound" would assert a claim
the harness has no signal to support. It is still useful evidence — it
confirms the `--host` flag actually reached vite — so the requirement is kept,
reworded to the claim the signal actually supports.

The harness MUST capture `vite preview`'s stdout and stderr instead of
discarding them, and MUST include that captured output in the harness's
failure report when the preview server never becomes reachable. On a
successful reachability wait, the harness MUST additionally report the
number of attempts made and the elapsed wait time, alongside the address
`vite preview` announced in its own startup banner — the address it was
configured to serve, not a claim about the socket it actually bound. If
`vite preview` has not yet printed that banner by the time the first
successful probe succeeds, the harness MUST report that no address was
available rather than inventing or guessing one.

#### Scenario: captured preview output is surfaced when the preview never becomes reachable

- GIVEN `vite preview`'s stdout and stderr have been captured since the
  process was spawned
- WHEN the reachability wait fails
- THEN the harness's failure report includes that captured output, not an
  empty or discarded stream

#### Scenario: the announced address is reported on a successful reachability wait

- GIVEN `vite preview` has printed its startup banner naming the address it
  was configured to serve, before the first successful probe
- WHEN the harness proceeds past the reachability wait
- THEN it reports the number of attempts made, the elapsed wait time, and
  that announced address
- AND the report does not claim the announced address is the socket `vite
  preview` actually bound — only that it is the address vite announced

#### Scenario: a successful wait with no captured banner reports that honestly, not silently

- GIVEN `vite preview` has not printed its startup banner before the first
  successful probe
- WHEN the harness proceeds past the reachability wait
- THEN it reports the number of attempts made and the elapsed wait time,
  and states that no address was available before the first successful
  probe — it MUST NOT invent or guess an address

### Requirement: the handheld geometry harness fails closed on both empty and short runs

`geometriaHandheld.ts` MUST exit non-zero — never pass by measuring nothing
or by measuring less than expected — if the preview server never becomes
reachable, if `dist/` is missing or empty, if the number of states reached
does not equal a committed constant for the current slice (5 states before
slice F: S1, S2, S4, S5, S6; 6 from slice F onward, adding S3), or if any
reached state measured fewer interactive controls than a committed per-state
floor. A short run — S3's script silently failing to advance past S2, for
example — is the realistic failure mode, not a zero-measurement run. When the
preview server is the failing precondition, naming that precondition is not
sufficient by itself: the harness MUST also report the observed evidence
behind that verdict, so the failure is diagnosable rather than merely
verdictable.
(Previously: the unreachable-preview scenario required naming only WHICH
precondition failed. Naming which precondition failed is satisfied by
"the vite preview server never became reachable" alone, and that string is
consistent with three distinct causes — a slow cold start, a launch crash, or
a wrong-interface bind — so it cannot direct triage. The requirement now
additionally demands the evidence that distinguishes them.)

#### Scenario: an absent build fails the harness naming the missing precondition

- GIVEN `dist/` is missing or empty
- WHEN the harness runs
- THEN it exits non-zero and reports that the build is missing

#### Scenario: an unreachable preview server fails the harness naming its cause, not just its verdict

- GIVEN `vite preview` never becomes reachable within the wait budget
- WHEN the harness runs
- THEN it exits non-zero, and its report states the number of attempts made,
  the elapsed wait time, the child process's exit code or signal if it
  exited, and any output captured from `vite preview` before the wait ended
- AND the verdict alone — "the vite preview server never became reachable" —
  is insufficient on its own; the report MUST carry that evidence alongside it

#### Scenario: a zero-measurement run fails rather than passing silently

- GIVEN a hypothetical run where zero states loaded or zero controls were
  measured
- WHEN the harness completes
- THEN it exits non-zero, naming the shortfall

#### Scenario: S3's visit-script drift is caught as a short run, not a silent re-measure

- GIVEN `FormularioBorrador`'s fields have changed since the committed
  visit script was last updated, so the script's selectors no longer
  match and it cannot advance past S2 to reach S3
- WHEN the harness runs in a slice-F-or-later context, where the
  committed states-reached constant is 6
- THEN it reaches only 5 states, and exits non-zero naming S3 as
  unreached — it MUST NOT report success by silently re-measuring S2 in
  place of S3

### Requirement: the técnico flow stays inside the two-breakpoint whitelist

Técnico components MUST use only the 640px and 1024px tiers; no
phone-specific breakpoint is introduced.

#### Scenario: técnico markup carries no extra breakpoint

- GIVEN the técnico flow's JSX
- WHEN its class strings are scanned for responsive-prefixed utilities
- THEN only `sm:` (640px) and `lg:` (1024px) prefixes appear, or none
