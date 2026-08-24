# Design System Foundation Specification

## Purpose

The styling substrate `apps/web` runs on after the Tailwind v4 + shadcn/ui
migration: the build pipeline, the `@theme` token layer, class-merging via
`cn()`, the two-breakpoint whitelist, the single-theme (no dark variant)
policy, and the `dist/` size ceiling. Out of scope: which shadcn primitives
get adopted (a design-phase decision) and the visual redesign of any
individual screen.

## Requirements

### Requirement: Tailwind v4 build pipeline

`apps/web` MUST build its CSS through `@tailwindcss/vite`, wired as a plugin
in `vite.config.ts` alongside `react()` and `VitePWA()`, with a single
`@import "tailwindcss"` entry reachable from `main.tsx`'s existing import
chain.

#### Scenario: the Vite plugin is wired

- GIVEN `apps/web/vite.config.ts`
- WHEN its `plugins` array is read
- THEN `tailwindcss()` is present alongside `react()` and `VitePWA()`

#### Scenario: the Tailwind entry import exists

- GIVEN `apps/web/src/main.tsx`'s import chain
- WHEN the entry stylesheet is read
- THEN it contains `@import "tailwindcss"`

### Requirement: `@theme` token layer and breakpoint whitelist

The `@theme` block MUST declare every colour custom property that
`tokens.css` previously declared (brand blue, greens, estado-badge pairs,
neutrals), and MUST configure exactly two breakpoints — 640px and 1024px —
with Tailwind's default `md`/`xl`/`2xl` tiers absent from the resolved
config.

#### Scenario: brand and estado colours survive the token move

- GIVEN the `@theme` block in the compiled entry stylesheet
- WHEN each custom property from the pre-migration `tokens.css` is looked up
  by name
- THEN an equivalent `--color-*` property exists in `@theme` with the same
  resolved value

#### Scenario: only the whitelisted breakpoints resolve

- GIVEN the compiled CSS output
- WHEN its `@media` preludes are scanned for `min-width` values
- THEN only `640px` and `1024px` appear
- AND no rule uses the Tailwind-default `md` (768px), `xl` (1280px) or `2xl`
  (1536px) tiers

### Requirement: `cn()` replaces manual class concatenation

`Boton` and every other component accepting an incoming `className` MUST
merge it through `cn()` (`clsx` + `tailwind-merge`), not string
concatenation, so two conflicting utility classes resolve deterministically
rather than both landing in the DOM.

#### Scenario: conflicting utilities resolve to one winner

- GIVEN `Boton` receives a `className` prop carrying a `bg-*` utility that
  conflicts with its own default `bg-*` class
- WHEN the component renders
- THEN the rendered `class` attribute contains exactly one `bg-*` utility —
  the incoming one — not both

#### Scenario: no naive concatenation remains

- GIVEN `Boton.tsx`'s source
- WHEN it is scanned for a `className` prop merge
- THEN no template literal or string concatenation combines `className`
  with a default class list outside a `cn()` call

### Requirement: single-theme policy — no dark variant

`apps/web` MUST NOT declare a `.dark` block, a `@custom-variant dark` rule,
or depend on `next-themes` or any theme provider, anywhere in its source or
compiled output. `color-scheme: light` MUST remain declared verbatim.

#### Scenario: no dark-mode artifacts exist

- GIVEN `apps/web`'s compiled CSS and its `package.json` dependencies
- WHEN both are scanned
- THEN no `.dark { … }` block or `@custom-variant dark` rule exists in the
  CSS, and `next-themes` is absent from dependencies

#### Scenario: `color-scheme: light` still ships

- GIVEN the compiled entry stylesheet
- WHEN its root-level declarations are read
- THEN `color-scheme: light` is present, unqualified by any dark condition

### Requirement: `dist/` size ceiling

The measured set is the **entire built `apps/web/dist/` directory** —
everything the device downloads for offline use — not a subset. It admits
no argument about which files count, which is the point of a hard gate.
This total MUST measure at or under 650 KiB (665,600 raw bytes) after
every slice of this migration, checked as a pass/fail gate rather than
reported after the fact. The ceiling counts **raw bytes**; every
ecosystem cost figure cited elsewhere in this project's research (e.g.
the exploration's `clsx`/`tailwind-merge`/`lucide-react` estimates) is
**gzip**, and is not directly comparable to this ceiling — a reader
budgeting gzip bytes against it would under-estimate by roughly 3×.

#### Scenario: a build under the ceiling passes

- GIVEN a production build of `apps/web`
- WHEN the total byte size of every file under `dist/` is summed
- THEN the total is ≤ 665,600 bytes (650 KiB)

#### Scenario: a build over the ceiling fails the gate

- GIVEN a hypothetical build whose summed `dist/` size exceeds 650 KiB
- WHEN the size gate runs
- THEN it reports failure and names the measured byte count

#### Scenario: an absent or empty `dist/` fails the gate rather than passing on zero

- GIVEN `dist/` is missing, or exists but contains no files
- WHEN the size gate runs
- THEN it exits non-zero and reports the missing/empty precondition — it
  MUST NOT report a passing 0-byte measurement
