# Styling Guards Specification

## Purpose

The protections `convencionesDeEstilos.spec.ts` (1812 lines) enforces
today, and the rule that carries them through the migration: every one of
the 21 guard blocks gets a named disposition — `CSS`, `JSX`, `AMBOS`,
`MOOT`, or `RESUELTA` — recording which scanner(s) now own each
protection, before any load-bearing organism converts, and no protection
is left unenforced. Out of scope: the guard-suite's final file shape,
settled by design D2 (`convencionesDeEstilos.spec.ts` +
`convencionesDeUtilidades.spec.ts` + `convencionesDeCompilado.compilado.spec.ts`
+ the register).

## Requirements

### Requirement: Every guard block carries a named disposition naming its owning scanner

A disposition register MUST list all 21 guard blocks from the
pre-migration audit, each with exactly one disposition value from
`{CSS, JSX, AMBOS, MOOT, RESUELTA}`, before the five load-bearing
organisms convert. `CSS` names the unchanged `convencionesDeEstilos.spec.ts`
mechanism; `JSX` names `convencionesDeUtilidades.spec.ts`; `AMBOS` names
both scanners owning the same protection; `MOOT` and `RESUELTA` need no
scanner. The value distinguishes *which* scanner owns each protection —
the fact that makes "nothing is unenforced" checkable mid-chain, not only
at the end.

#### Scenario: the register is complete

- GIVEN the disposition register
- WHEN its entries are counted
- THEN exactly 21 entries exist, each naming one guard and one disposition
  value

#### Scenario: no entry is left undecided or uses a retired value

- GIVEN the disposition register
- WHEN every entry's disposition field is read
- THEN each is one of `CSS`, `JSX`, `AMBOS`, `MOOT`, `RESUELTA` — never
  blank, `TBD`, or the retired single value `REBUILD`

### Requirement: every CSS/JSX/AMBOS-dispositioned guard has a passing test in its owning scanner

For each guard whose disposition is `CSS`, `JSX`, or `AMBOS`, a
corresponding automated test MUST exist and pass in its named owning
scanner: `convencionesDeEstilos.spec.ts` for `CSS`,
`convencionesDeUtilidades.spec.ts` for `JSX` (scanning JSX, `cva` variant
maps, and the `@theme` block), or both for `AMBOS`.

#### Scenario: a JSX-dispositioned guard passes on converted code

- GIVEN a component whose disposition is `JSX` (e.g. guard 3's ≥48px
  touch floor on `Boton`)
- WHEN `convencionesDeUtilidades.spec.ts` runs against the converted
  component's `cva` variant map
- THEN the test passes

#### Scenario: a dispositioned guard fails on a regression

- GIVEN a converted component whose `cva` variant map ships a control
  smaller than the protection's floor
- WHEN its owning scanner(s) run
- THEN the test fails, naming the offending variant

### Requirement: the overflow/`[hidden]`/`sr-only` collision cluster is resolved with defence in depth

Guards 1, 2, and 16 are `AMBOS` (or compiled-scoped): each MUST scan
**compiled build output** (`convencionesDeCompilado.compilado.spec.ts`,
run against `dist/` in the bundle job), not only `src/**/*.css`, so
Tailwind Preflight's `[hidden]` rule and any `.sr-only` usage — including
one emitted by a vendored component's internals — are visible. Guard 1
additionally requires a `JSX`-scanner ban on the literal `sr-only` token
at author time, as defence in depth: the token ban catches what the team
writes, the compiled scan catches what anything — including vendored
source — emits. The token ban does not substitute for the compiled scan.

#### Scenario: a `sr-only`-induced overflow regression is caught by the compiled scan

- GIVEN a vendored component's internals apply Tailwind's `.sr-only`
  utility to hide a label needed for the reading-gate boundary
- WHEN the compiled-output guard 1/16 scan runs against `dist/`
- THEN it fails, naming the `overflow: hidden`/`clip-path` rule it found

#### Scenario: an authored `sr-only` token is caught before it compiles

- GIVEN a first-party component's JSX contains the literal class token
  `sr-only`
- WHEN `convencionesDeUtilidades.spec.ts`'s guard 1 token ban runs
- THEN it fails, naming the offending file and element — independent of
  whether a build has run

#### Scenario: a duplicate `[hidden]` `!important` rule is caught

- GIVEN Preflight's own `[hidden]` rule ships alongside a project-authored
  `!important display` rule in compiled output
- WHEN the compiled-output guard 2 scan runs
- THEN it fails, naming both conflicting rules

### Requirement: guard 20's universal touch-floor scan is ported

An automated scan MUST classify every interactive element in
`apps/web/src` JSX/TSX by tag/prop/class-token heuristics and assert each
carries sizing to ≥48px on both axes, unless it matches a recorded
exemption.

#### Scenario: an under-sized interactive element is caught

- GIVEN a JSX element classified as interactive whose class string
  resolves to a height token under 48px
- WHEN the ported guard 20 scan runs
- THEN it fails, naming the element and its resolved size

#### Scenario: a recorded exemption is not flagged

- GIVEN `TablaDeContratos`' non-interactive `<tr>` rows, exempted per guard
  6/20's original judgment
- WHEN the ported guard 20 scan runs
- THEN those rows are not reported as violations

### Requirement: legal-evidence guards get dedicated verification

Guard 17 (reading-gate boundedness) and guard 19 (signature canvas /
button coverage) MUST each have their own rebuilt automated test, verified
individually rather than batched.

#### Scenario: the reading gate stays explicitly bounded

- GIVEN `VisorDeDocumento`'s converted markup
- WHEN the rebuilt guard 17 scans for the iframe's height class
- THEN it finds an explicit bounded `vh` value and fails if `auto` or an
  unbounded `min-height` is used instead

#### Scenario: signature controls are never covered by the next element

- GIVEN `LienzoDeFirma`'s converted markup with Deshacer/Borrar controls
- WHEN the rebuilt guard 19 checks `elementFromPoint` at each control's
  coordinates
- THEN each control, not an overlapping iframe, is the hit element
