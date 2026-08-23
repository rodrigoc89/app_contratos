# Exploration: design-system-migration (Tailwind CSS + shadcn/ui for `apps/web`)

> Produced by `sdd-explore`. The agent has no `Write` tool; the orchestrator
> materialized this file from Engram topic `sdd/design-system-migration/explore`
> per the hybrid artifact-store contract. Engram remains the authoritative copy.

## Verification note (corrects previously stated facts)

Measured with `wc -l`, not re-derived from memory:

| File | Stated in brief | Measured |
| --- | --- | --- |
| `convencionesDeEstilos.spec.ts` | 1862 | **1812** |
| `atomos.css` | 190 | **158** |
| `organismos.css` | 509 | **471** |
| `tokens.css` | 105 | 105 ✓ |
| `base.css` | 86 | 86 ✓ |
| `panel.css` | 829 | 829 ✓ |
| `index.css` | 16 | 16 ✓ |
| Non-spec CSS total | 1735 | **1665** |

All analysis below uses the measured numbers. The delta changes no conclusion —
1812 lines of guards over 1665 lines of the CSS they guard is, if anything, a
slightly stronger version of the point.

Also verified: **no Tailwind / shadcn / clsx / cva / radix in `apps/web`'s
dependency tree today.** `pnpm-lock.yaml` does contain `@radix-ui/react-toggle`
and friends, but traced to their sole importer: `@prisma/studio-core`, a
transitive devDependency of `apps/api`'s Prisma tooling. Zero relationship to
`apps/web`, zero bytes in its bundle. False lead, ruled out.

## Settled constraints

Decided by the user during this exploration. These are not open questions.

1. **Phones are a real técnico target, not a courtesy.** The fleet includes
   phones as well as tablets. `DESIGN.md:297,304` and `index.html`'s own comment
   name the fleet as tablet-only Chromium-on-Android — that framing is now
   narrower than the real target. The discrepancy is recorded here; whether
   `DESIGN.md` gets amended is the user's call, not this change's.
2. **Ambient-light range is out of scope.** The device's own screen brightness
   handles variable outdoor/indoor light on both tablet and phone. Do not derive
   a contrast floor from a range of lighting conditions, and do not treat "a
   possibly dim rural interior" as an open question — it isn't one here.
3. **The existing WCAG floors remain the bar**, independent of lighting: 4.5:1
   for normal text (guard D6) and the measured non-text-state ratios this
   project already enforces (≥3:1, guard 13). shadcn's defaults are assessed
   against *these*, not against a lighting scenario.
4. **Automatic (OS-driven) dark mode would be a defect, not a feature.** Not an
   ambient-light question — it is the app silently changing its own theme from an
   OS setting nobody chose for this purpose. See §3 for the confirmed mechanism.

## Current state

- `apps/web` ships one hand-authored, global-cascade stylesheet chain, imported
  once from `main.tsx` (`import "./estilos/index.css"`):
  `tokens.css → base.css → atomos.css → organismos.css → panel.css`, in that
  explicit, load-bearing order (see `index.css`'s own comment on why).
- Every component styles itself with a plain `className="bem-name"` string
  against that global sheet — no CSS Modules, no CSS-in-JS, no scoping mechanism
  at all. `Boton.tsx` merges an incoming `className` by string concatenation
  (`` `boton ${className}` ``) rather than any dedup-aware merge. This is exactly
  the gap `tailwind-merge` / `cn()` exists to close, and it matters directly:
  naive concatenation cannot safely resolve two conflicting Tailwind utilities
  (e.g. two different `bg-*` tokens) the way `cn()` can.
- `convencionesDeEstilos.spec.ts` (1812 lines) is a **source-text scanner over
  `src/**/*.css`**, not a rendered-DOM or visual test — explicitly because
  "jsdom performs no layout, and Vitest does not load real stylesheets into a
  document during a test run." Every guard is therefore CSS-syntax-shaped:
  regexes over selectors, rule bodies and `@media` preludes, plus a hand-rolled
  `var()` / `color-mix()` / HSL resolver for colour.

  **This is the single most important fact for the migration:** the guard
  suite's *mechanism* is coupled to "styles live in CSS files with stable
  selectors," which utility-first CSS structurally breaks. The *protections*
  (legal reading-gate boundedness, 48px touch floors, contrast ratios, focus
  visibility, sticky-paginator correctness, cascade-order safety) are
  independent of CSS syntax and must all survive. The scanning mechanism for
  nearly all of them does not survive unchanged.
- Component inventory (measured, via `find`, not estimated): 21 files under
  `componentes/` (5 atoms, 5 molecules, 9 organisms, 2 templates) plus 10
  containers under `funcionalidades/`.
- Two shells share the app: `LayoutTablet` (técnico, single linear flow,
  `max-width: 720px`) and `LayoutPanel` (office, table/search/paginator,
  `max-width: 1280px`, its own responsive rules in `panel.css`). They share
  `CabeceraDeSesion`, `Boton`, `MarcaProducto`, and the token layer.

## Guard-by-guard audit of `convencionesDeEstilos.spec.ts`

Verdict legend:

- **SURVIVES** — the same mechanism keeps working.
- **REBUILD** — same protection, must move to a JSX/cva/compiled-output scan, or
  the judgment itself must change.
- **MOOT** — the bug class becomes structurally impossible under the new
  mechanism.
- **COLLISION** — a Tailwind/shadcn default actively reproduces the defect the
  guard exists to prevent.

| # | Guard (describe block) | Protects | Verdict | Why |
|---|---|---|---|---|
| 1 | No `overflow: hidden` / `clip` anywhere in `src/**/*.css` | Document-viewer reading gate (`puertaDeLectura.ts`) | REBUILD + **COLLISION** | Authored styles move into JSX class strings the CSS-file scan never sees. Worse: Tailwind's own built-in `.sr-only` utility (v4 docs, verified) is `overflow: hidden` — see guard 16. |
| 2 | Exactly one `!important display` rule, the `[hidden]` guard | `EscanerDeMac`'s camera `<video hidden>` | REBUILD + **COLLISION** | Tailwind v4 Preflight ships its own `[hidden]:where(:not([hidden="until-found"])) { display: none !important; }` (docs-verified, byte-for-byte the same intent). That is a second `!important display` rule the moment `@import "tailwindcss"` lands, generated at build time where the current `archivosCss(DIRECTORIO_SRC)` walk over hand-authored `src/` files never sees it. Needs a deliberate decision (delete the project's duplicate and rescope the guard to compiled output, or prove no conflict), not a silent carry-over. |
| 3 | `.boton` + `--tamano-toque-minimo` ≥48px | Gloved-thumb touch floor | REBUILD | Token half survives via `@theme` (custom properties). Rule half dies the moment `.boton` becomes a `cva` variant map — no more `.boton { }` rule to regex. |
| 4 | PR25: 32px gap + `.boton--destructivo` colour-not-position | Deshacer/Borrar next to Firmar | REBUILD | BEM selector regex → must scan `cva`'s `variant` object / JSX. Arguably becomes an *easier*, more explicit guard once "destructive" is one enumerated cva key instead of a CSS class humans could paste in the wrong order. |
| 5 | 48px floor explicitly absent from table rows/cells | Rows must not look interactive (R-3.5) | REBUILD | Negative assertion, same JSX-scan shift. |
| 6 | cursor/hover/focus-visible presence + `removalesSinReemplazo` / `tieneReemplazoDeFoco` | Keyboard focus never silently vanishes | REBUILD — and the outline engine specifically **cannot be ported as-is** | shadcn/Radix idiom pairs `outline-none` with a `ring-*`/`shadow-*` focus ring, not a real `outline:` declaration. `tieneReemplazoDeFoco` explicitly requires an `outline:` replacement and does not recognize a ring — ported verbatim it either false-fails idiomatic shadcn code or gets quietly deleted. The *judgment* must change (recognize ring-based replacements), not just the extraction. |
| 7 | Exactly 640px/1024px breakpoints, min-width only; `.layout-panel` rebinds **and reads back** `--fuente-base` | Responsive sprawl control; the "rebind alone is inert" bug | PARTIAL REBUILD / partly **MOOT** | Direction (min-width only) already matches Tailwind's mobile-first defaults — no enforcement needed there. The exact-two-values half needs `@theme` reconfigured to drop `md`/`xl`/`2xl` (a config decision, not a test decision) and the scan target moved to the `@theme` block or compiled output. The rebind/read-back bug is inherited-custom-property-specific: if the migration moves to literal per-element `text-base`/`text-sm` utilities instead of an inherited `--fuente-base`, that whole bug class becomes structurally impossible — a real design choice to make deliberately. |
| 8 | No `font-size < 1rem` outside `panel.css` | Readable type on the shared tablet sheet | REBUILD | Same CSS-text → JSX-class mechanism shift, otherwise mechanical. |
| 9–12 | `valorDeColor` / `matiz` / `saturacion` resolvers + Guards A–D (D6 brand-blue contrast) | No illegible brand-blue text/fills anywhere | REBUILD, non-trivially | `var()` / `color-mix()` resolution survives if colours stay real custom properties in `@theme` (they should). But rule-discovery (finding a `color:`/`background:` on a BEM selector) has no equivalent in utility CSS — must scan JSX class strings / cva variants and resolve bare Tailwind class names (e.g. `text-marca-azul`) through the `@theme` map, not just `var()`. The hue/saturation math (including the load-bearing 50% saturation floor that excludes the two ~14%-saturation neutrals) is unaffected and should be reused verbatim. |
| 13 | Estado-chip 1.32:1 regression (≥3:1 on/off contrast) + pagination current-page contrast | On/off state visible, not just announced (R-3.8) | REBUILD, self-alerting | Selector shape moves to Radix `data-[state=on]` / `aria-pressed` + Tailwind data-variant classes. Notably this guard **fails closed**: its `not.toBeNull()` on the old `.boton--filtro-activo` selector throws loudly if unrebuilt, rather than silently reporting zero violations — a real partial safety net most of the others lack. |
| 14 | 4 distinct estado-badge colours + label always present | Colour never the only channel | **SURVIVES best of all** | Selector strategy is `[data-estado=...]` attribute-based already (`estadoDeContrato.tsx`'s `InsigniaDeEstado`) — compatible with a shadcn `<Badge>` keeping the same attribute. Only colour-value extraction needs the same rebuild as 9–12. |
| 15 | Sticky paginator armed (`bottom:` inset) + opaque background | Paginator reachable without scrolling the list (R-3.9) | REBUILD | Mechanical JSX-class scan. |
| 16 | Narrow-layout `thead` displaced (not clipped) — the 492px `scrollWidth` regression | R-3.6, and indirectly the reading-gate ban (guard 1) | REBUILD + **sharpest COLLISION in the suite** | Tailwind's built-in `.sr-only` (v4 docs, verified) is `position: absolute; …; overflow: hidden; clip-path: inset(50%); …` — **literally the exact recipe this project already measured and fixed** (492px `scrollWidth` on a 360px viewport, nothing visible to scroll to). Any component — first-party or inside a shadcn primitive's internals — that reaches for `sr-only` for a visually-hidden label resurrects a bug this project already paid to fix, through the very mechanism (`overflow: hidden`) guard 1 was built to ban. If guard 1 isn't rebuilt to see compiled/utility CSS, **both guards stay green while the regression ships.** |
| 17 | Document-viewer iframe bounded to an explicit `vh` fraction, never `auto`/unbounded `min-height` | Legal reading-gate distinction (`puertaDeLectura.ts`) | REBUILD | Mechanical JSX arbitrary-value scan (`h-[45vh]`), but this is the **highest-stakes single guard in the file** — recommend a dedicated rebuild-plus-manual-verification pass, not batch treatment. |
| 18 | BEM modifier never declared above its base (cascade-order footgun) | `.etiqueta--opcion` shipping visually identical to a broken `.etiqueta` | **MOOT for `cva`-based components** | `cva` always resolves one deterministic class list per call — no two competing rules racing by source order. A structural improvement. Still needed if the team hand-writes any `@apply`-based custom classes, which keep the same cascade-order risk. |
| 19 | Signature canvas bounded on the canvas, never the wrapper holding Deshacer/Borrar | The "buttons covered by the next iframe" regression, measured with `elementFromPoint` | REBUILD | Same vh-bound + no-height-on-wrapper pattern as 17; same high-stakes flag. |
| 20 | Universal touch-floor scan over every interactive-looking rule (~250 lines, exemption-based, not enumerated) | Every control ≥48px, including ones nobody remembered to list | REBUILD — **largest single item of migration effort** | The entire structural-heuristic engine (interactive pseudo-class/tag/`cursor:pointer` detection, BEM base/modifier fallback resolution, the "min-height on an inline box is inert" check) is CSS-rule-topology-specific. Needs a parallel JSX/TSX version: classify every element as interactive-or-not by tag/prop/class-token heuristics, then check its `cva` variant or class string carries `h-12`/`min-h-12` and `w-12`/`min-w-12` (or `w-full`/block-display equivalents), reapplying the inline-display-is-inert logic to Tailwind's `inline` utility. **This guard exists precisely because an enumerated list already let two real 24px links through** — it is the one most likely to "quietly stop guarding" if treated as cleanup instead of a first-class deliverable. |
| 21 | Every `<a>`/`<Link>` gets a real box (the two measured 24px office links) | `min-height` on an inline box is silently inert | **Partially survives as a template** | Already scans `.tsx` files for `<a>`/`<Link className="…">` alongside CSS — the closest existing precedent for how guard 20 must be rebuilt. Its value-resolution half (`cuerposDe`) still needs to move from CSS-rule-body text to Tailwind class-token reading. |

## Affected areas

- `apps/web/src/estilos/*.css` (1665 measured lines) — the entire hand-authored
  system this migration replaces.
- `apps/web/src/estilos/convencionesDeEstilos.spec.ts` (1812 measured lines) —
  every guard above needs an explicit disposition; none may be silently dropped.
- `apps/web/src/componentes/**` (21 files) and
  `apps/web/src/funcionalidades/**/contenedores/*.tsx` (10 files) — every
  `className="bem-name"` usage.
- `apps/web/src/componentes/atomos/Boton.tsx` — its manual `className`
  string-concat must become `cn()` (clsx + tailwind-merge) *before* any component
  starts passing conflicting Tailwind classes through it.
- `apps/web/vite.config.ts` — `plugins: [react(), VitePWA(...)]` is the exact
  insertion point for `tailwindcss()`.
- `apps/web/src/pwa/configuracionPwa.ts` — `globPatterns` already covers
  Tailwind's compiled `.css` output; no PWA config change needed on that front.
- `apps/web/src/main.tsx` — single `import "./estilos/index.css"` entry point;
  Tailwind's own `@import "tailwindcss"` lands in the same chain.
- `PaginaLogin.tsx` (password toggle), `PanelNoDisponible.tsx`,
  `CabeceraDeSesion.tsx`, `moleculas/BarraDeBusqueda.tsx`,
  `organismos/estadoDeContrato.tsx` — the specific "must not regress" behaviours
  (see §7).
- Out of scope, confirmed untouched: `openspec/changes/production-deployment/`.
  No API, contract-template, or signature-logic files were read or need changing.

## 3. The palette is a field decision, not a default

`tokens.css:1-16` and `organismos.css:143-154` independently argue the same
thing: no dark mode, flat maximum-contrast neutrals. `base.css` reinforces it
with `color-scheme: light`, specifically to stop the OS theme reaching native
form controls and scrollbars.

Per the settled constraints, the following is assessed against this project's
own existing WCAG floors (4.5:1 text via guard D6, ≥3:1 non-text state via
guard 13) — **not** against an ambient-light range, which is out of scope.

**Computed, not guessed.** shadcn/ui's default light-theme OKLCH tokens (from the
official theming docs) were converted to linear sRGB and run through the exact
WCAG relative-luminance formula `convencionesDeEstilos.spec.ts` already uses
(`0.2126R + 0.7152G + 0.0722B` on linearized channels), so these are
apples-to-apples with this project's own guard:

| shadcn default token | OKLCH | ≈ hex | Contrast vs. its own `--background` |
|---|---|---|---|
| `--foreground` | `oklch(0.145 0 0)` | `#0a0a0a` | 19.79:1 |
| `--muted-foreground` | `oklch(0.556 0 0)` | `#737373` | **4.73:1** |
| `--border` | `oklch(0.922 0 0)` | `#e5e5e5` | **1.26:1** |
| `--primary` | `oklch(0.205 0 0)` | `#171717` | 17.91:1 |

Two concrete findings:

- `--muted-foreground` clears the 4.5:1 AA text floor by only **0.23:1 of
  margin** (4.73 vs 4.5). Every shadcn component that uses it for real text
  (captions, secondary labels, disabled states) needs individual re-verification
  against the D6-style guard, not trust: the margin is thin enough that a
  base-colour change (`zinc`/`stone`/`slate` instead of `neutral`) or an actual
  panel's gamma could plausibly drop it under 4.5:1.
- `--border` (1.26:1) is **more than 2× under** this project's already-established
  ≥3:1 non-text-state floor (guard 13 — the exact bar that caught the 1.32:1
  estado-chip regression). It is fine as pure decoration, but this project must
  not let it carry any state distinction (e.g. "this button is selected" relying
  on a border-colour change alone) without overriding it. Using it as-is where
  state depends on it reproduces the class of defect guard 13 exists to catch,
  just via a border instead of a fill.

What must be deliberately overridden:

1. `components.json`'s generated `:root`/`.dark` blocks must be replaced with
   this project's actual tokens (`--color-primario`, `--color-fondo`,
   `--color-texto`, `--color-borde`, the estado-badge pairs) rather than
   accepted as generated.
2. Any shadcn component leaning on `--border` or `--muted-foreground` for a
   *meaningful* (not purely decorative) distinction needs its resolved contrast
   checked against this project's guards before shipping.
3. `color-scheme: light` must survive verbatim.

### Automatic dark mode — confirmed mechanism, not guessed

Fetched from shadcn's own theming and dark-mode-setup docs:

- shadcn's generated CSS is trigger-agnostic: dark values live in a `.dark { … }`
  block activated purely by `@custom-variant dark (&:is(.dark *));` — i.e. dark
  mode only activates if something puts a literal `.dark` class on an ancestor
  (typically `<html>`). **The CSS alone contains no OS-preference logic.**
- **But the canonical, most-copied setup recipe wires that class to the OS
  automatically.** shadcn's documented `ThemeProvider`/`next-themes` example
  ships `defaultTheme="system"` and `enableSystem`, and its reference
  implementation explicitly calls
  `window.matchMedia("(prefers-color-scheme: dark)").matches` to decide whether
  to add `.dark`. A técnico's tablet whose OS happens to be in dark mode would
  flip the app to dark with **nothing in any test or office demo showing it** —
  neither `next-themes` nor `matchMedia` are exercised by this project's
  jsdom-based suite.
- "Just don't wire a `ThemeProvider`" is not sufficient on its own: the CLI's
  theme scaffold generates **both** `:root` and `.dark` blocks unconditionally,
  and some shadcn component internals reference `dark:`-prefixed utilities
  directly in their JSX (confirmed in the fetched `ModeToggle` example:
  `dark:scale-0 dark:-rotate-90`). Those activate the instant *any* ancestor ever
  gains a `.dark` class from *any* source.

**Recommendation:** ship no dark variant at all, and delete it *structurally*
rather than merely declining to wire a toggle — skip `next-themes`, skip any
`ThemeProvider`, and remove the generated `.dark { … }` block and the
`@custom-variant dark` line during setup. This is the only version of "no
automatic dark mode" that doesn't rest on an ongoing promise ("don't add
`enableSystem` later") of exactly the kind this project's guard suite exists
because people forget. Cost: forecloses a future *user-chosen* dark mode, which
nothing in `DESIGN.md` or this exploration suggests is needed. The alternative —
keep `.dark` "for future use" but never wire a toggle — costs an ongoing,
unenforced discipline burden (nothing in the guard suite would catch someone
adding `next-themes` in a later PR) for no identified benefit. Not recommended.

## 4. Bundle cost on an offline-first PWA

Verified baseline: `apps/web/dist/assets/` measures **471.94 KiB** (458,286 B JS
+ 19,235 B CSS + 5,748 B workbox-window), and `sw.js`'s `precacheAndRoute` list
has exactly **13 entries**. The assets-folder subtotal and entry count were
verified directly; every icon byte was not re-summed.

Confirmed zero Tailwind/shadcn/radix/clsx/cva footprint today.

What each addition would plausibly cost — sourced, and flagged where it isn't:

- `clsx` — trivially small (reference examples put a `cn()` utility built on it
  under ~0.5 KB gzip).
- `tailwind-merge` — web-search-sourced ~1.6 KB min+gzip for typical usage (the
  full default config is ~6.3 KB, most of it unused class data). **Secondary web
  claim, not measured against this repo.**
- `class-variance-authority` — **no verified number found.** Ecosystem consensus
  puts it in the same low-single-digit-KB order as clsx; explicitly presenting no
  figure.
- `lucide-react` — tree-shaken by Vite; industry-reported (not repo-measured)
  ~5 KB gzip for ~50 icons. This app needs a small handful — realistically
  low-single-digit KB.
- Radix primitives (pulled in by whichever shadcn components get chosen) —
  **no verified per-primitive gzip figure obtainable** (Bundlephobia returned no
  numeric data). A genuine unquantified unknown that scales directly with the
  component list: `<Button>`/`<Badge>` need no Radix at all (plain elements +
  cva); `<Dialog>`/`<Select>`/`<Toggle>` each pull their own package. This cannot
  be responsibly estimated before the component list exists — that choice belongs
  to `sdd-design`.
- Tailwind v4 itself — zero runtime JS (build-time CSS generation via
  `@tailwindcss/vite`). Its CSS *output* size is proportional to which utilities
  actually get used across 21+10 components, and could shrink *or* grow the
  current 19,235-byte CSS file. Not estimable without doing the work.

**Honest net statement:** the JS-side addition minus Radix is very likely under
~10–15 KB gzip on sourced ecosystem figures; each Radix-backed component adds an
amount this exploration cannot respectably quantify yet. **Make `dist/` size a
real before/after gate** rather than trusting any number stated here.

## 5. Responsive for the técnico — phones are a real target

This reframes `DESIGN.md:297,304`: that passage's naming of "the target fleet"
as Chromium-on-Android, together with `index.html`'s comment ("This fleet is
Chromium on Android **tablets** only") and the document's §2 table ("Installable
PWA on company-owned **tablets**"), is now **narrower than the real target**.
Recorded explicitly, not resolved.

What "responsive" should mean here: the CSS architecture is **already
mobile-first** (unqueried rules *are* the narrow <640px tier; 640/1024 only ever
widen).

- **The office panel side is already proven at phone width.**
  `docs/sdd/contract-list-search/design.md` D12/D13 explicitly measured "at
  360px: document `scrollWidth === clientWidth === 360` … every interactive
  control still at or above the 48px floor." 360px was a deliberate, tested
  floor for that side, for reasons unrelated to this migration.
- **The técnico side was never verified at phone width** — designed and tested
  against tablet viewports only, consistent with `DESIGN.md`'s framing. One
  concrete, already-measured defect: `CabeceraDeSesion`, rendered at its full
  unscoped size by `LayoutTablet` (unlike `LayoutPanel`, which shrinks it to
  `0.875rem`), needs ~408px of row width for wordmark + username + logout but
  has only 366px available in a 390px viewport. It wraps to two rows and
  consumes **104px — 14% of a 390px-tall screen** before any content renders.
  A real defect on a real target device now.

**Verdict on the two-breakpoint whitelist (640/1024): it likely still holds.**
Nothing found argues for a third breakpoint — the office panel already proves the
existing narrow tier serves down to 360px. What's missing is *coverage*: the
técnico components were never exercised against that already-existing tier at
phone widths. Recommendation: keep the whitelist; add "no `scrollWidth` overflow,
every touch target ≥48px at 360–430px" as an explicit acceptance criterion for
the técnico flow specifically — the same bar the office panel already cleared.
A testing-coverage fix, not a breakpoint-count fix.

`LayoutTablet`'s name: `docs/sdd/contract-list-search/design.md` D13 already
states, in the office panel's own design doc, that this name "declares a device
assumption" — the stated reason not to reuse it for the office panel. With phones
now sharing the component, the name describes less of what it covers. Renaming
(e.g. naming the *role* — técnico — rather than the device) is a proposal/design
decision; recorded here as naming debt, not resolved.

## 6. Migration shape

**Recommend incremental (strangler), atom-first, leaf-to-load-bearing** — not
big-bang — for two independently sufficient reasons:

1. **Guard rebuild must land *with* each converted surface.** Guard 20 alone
   (~250 lines) is a real parallel engine to write; batching all guard rebuilds
   into one follow-up PR after a big-bang conversion is exactly the shape that
   produces the "guard quietly stops guarding" failure this change exists to
   avoid.
2. **Preflight lands globally the instant `@tailwindcss/vite` + `@import
   "tailwindcss"` is wired in.** There is no way to "add Tailwind for one
   component" without Preflight touching every unconverted screen simultaneously.
   Concretely: `base.css`'s own `*, *::before, *::after { box-sizing: border-box }`
   already matches Preflight exactly (no conflict); `base.css`'s
   `h1,h2,h3 { line-height: 1.25 }` / `h2 { font-size: var(--fuente-grande) }`
   re-assert after Preflight's `inherit` reset, so headings likely survive — but
   this needs per-element verification once Tailwind actually lands, not
   assumption. The two **confirmed** direct collisions are `[hidden]` (guard 2)
   and `sr-only`/`overflow:hidden` (guards 1/16), and both are *use-time* risks
   (they fire only if someone reaches for `sr-only` or a conflicting
   `!important`), not automatic on install — which makes the reset survivable but
   argues strongly for landing it with the guard suite kept green step-by-step
   rather than buried in one large diff.

**Order — leaf-like, convert first:** the 5 atoms (`Boton`, `CampoTexto`,
`Etiqueta`, `MarcaProducto`, `Spinner`). Smallest CSS surface each, and
converting them first is what forces guards 3–6's `.boton`-family rebuilds to
happen earliest, while the blast radius of getting a rebuild wrong is smallest.
`Toast`, `IndicadorDePaso`, `AvisoDeActualizacion` next (self-contained,
non-load-bearing).

**Load-bearing, convert last with dedicated scrutiny:** `VisorDeDocumento`
(guard 17, legal evidence), `LienzoDeFirma` (guards 4/19), `EscanerDeMac`
(guard 2), `TablaDeContratos` (guard 20's primary target plus the guard-16
`sr-only` collision risk), `BarraDeBusqueda`/`Paginador` (guards 12/13). These
five own essentially all of the "must not regress" list.

Both systems coexist in the standard strangler sense: Tailwind utilities and
existing BEM classes on the same element don't inherently conflict (mostly
disjoint property sets) until a component is deliberately rewritten, so both
guard suites run in parallel for the migration's duration — a real, accepted cost.

## 7. What must not regress

| Behaviour | Current mechanism | File | Migration risk if defaulted |
|---|---|---|---|
| Password-toggle state lives in the accessible name, never `aria-pressed` | Boton's visible text changes ("Mostrar"/"Ocultar contraseña"); an explicit comment says `aria-pressed` would double-announce the same fact | `PaginaLogin.tsx:111-124` | **HIGH** — `lucide-react` icons carry no accessible name of their own. An icon-only shadcn toggle needs its `aria-label`/visible text to change on toggle; a static label plus a newly-added `aria-pressed` reproduces the exact redundant-announcement problem the current code deliberately avoids. |
| `PanelNoDisponible` refuses to name a home that doesn't exist | Generic, role-agnostic copy per `DESIGN.md` D10 | `PanelNoDisponible.tsx:11-21` | LOW — a copy constraint, trivially portable to any shadcn empty-state pattern. |
| Estado chips/badges never let colour carry meaning alone | `aria-pressed` + always-visible Spanish label (chips); label always inside the badge span (`InsigniaDeEstado`) | `BarraDeBusqueda.tsx`, `estadoDeContrato.tsx` | LOW–MEDIUM — shadcn's `<Badge>`/`<Toggle>` are text-capable out of the box; risk only if the migration switches to icon-only or colour-only variants. |
| Estado chip / current-page ≥3:1 non-text-state contrast | Guard 13 | `panel.css` | **HIGH** — this exact defect (1.32:1) already shipped once under a naive "these two selectors differ" review. Must be re-measured against whatever `data-[state=on]` styling replaces `.boton--filtro-activo`, and shadcn's default `--border` (1.26:1) is nowhere near sufficient if reused for this purpose. |
| `[hidden]` camera-preview containment | Guard 2 | `base.css`, `EscanerDeMac.tsx` | MEDIUM — directly collides with Tailwind Preflight's own `[hidden]` rule; needs a deliberate decision, not a silent carry-over. |
| Document-viewer reading-gate boundedness | Guard 17 | `organismos.css`, `puertaDeLectura.ts` | **HIGHEST** — tied to legal evidence; recommend a dedicated verification pass, not batch treatment. |
| Signature-canvas boundedness / Deshacer-Borrar never covered by the next iframe | Guards 4/19 | `organismos.css`, `LienzoDeFirma.tsx` | HIGH — same class of stakes as the reading gate. |
| Row-is-not-a-link (no `cursor:pointer`, weaker hover than zebra striping) | Guard 6/20's explicit `.tabla-de-contratos tbody tr` exemption | `panel.css` | MEDIUM–HIGH — shadcn's default `<TableRow>` commonly ships a `hover:bg-muted/50`-style rule applied unconditionally to every row; using it as-is on a non-clickable row silently reintroduces "looks clickable, isn't." |
| Sticky paginator never silently inert | Guard 15 | `panel.css` | MEDIUM — `position: sticky` with no `bottom` utility is the same silent no-op in Tailwind (`sticky` alone vs `sticky bottom-0`). |
| Focus-visible outline never removed without a real replacement | Guard 6 | all CSS | MEDIUM — the *judgment* of "real replacement" must expand to ring-based patterns; a verbatim port either false-fails idiomatic shadcn code or gets quietly deleted. |
| No automatic (OS-driven) theme change | Not currently applicable (no theming system exists yet) | n/a | **HIGH** if shadcn's default setup recipe (`next-themes`, `enableSystem`) is copied verbatim — see §3. |

## Approaches

The Tailwind/shadcn decision itself is already made. These are migration
strategies.

### 1. Incremental / strangler, atom-first *(recommended)*

Install Tailwind + shadcn alongside the existing stylesheet chain; convert leaf
components first, rebuild the corresponding guard(s) in the same PR, work up to
the five load-bearing organisms last.

- **Pros:** guard rebuilds land with the code they protect, never as a separate
  follow-up; blast radius starts small (an atom) and grows only as confidence
  does; both guard suites catch regressions the whole way through; matches the
  measured inventory's natural leaf/load-bearing split.
- **Cons:** longer calendar time; two styling systems coexist for the duration
  (extra cognitive load reading diffs); requires discipline to actually rebuild
  each guard rather than defer it.
- **Effort:** high overall, but spread — each PR stays within the 400-line budget.

### 2. Big-bang

Convert the whole app in one branch, cut the guard suite over once at the end.

- **Pros:** no dual-system period; one clean before/after for reviewers.
- **Cons:** Preflight's global reset lands on every screen at once with no
  incremental signal if something breaks; the ~250-line guard-20 rebuild (and the
  20 other dispositions) either blocks the whole PR or gets deferred — precisely
  the "quietly stops guarding" failure mode to avoid; a single PR covering 21+10
  files plus a 1800-line guard rewrite blows well past the 400-line budget and
  would need to become a stacked chain anyway — at which point it is approach 1
  without the ordering discipline.
- **Effort:** nominally lower total, concentrated into a much higher-risk
  single delivery window.

## Recommendation

Incremental/strangler, atom-first, with **every one of the 21 guard blocks given
an explicit, named disposition (rebuild / moot / collision-resolved) before the
load-bearing organisms are touched** — not deferred to a cleanup pass.

- Treat guards **1, 2 and 16** (the `overflow:hidden` / `[hidden]` / `sr-only`
  collision cluster) as a **single design decision made early and explicitly**,
  since Tailwind's own defaults actively reproduce two regressions this project
  already paid to fix once.
- Ship **no dark-mode variant at all** — delete the generated `.dark` CSS block
  and skip any theme-provider wiring — rather than one that merely goes unwired.
- Treat guards **17 and 19** (reading gate, signature canvas) as requiring
  dedicated verification passes: legal evidence, and a measured "buttons covered
  by the next iframe" defect respectively.
- Make **`dist/` size a real before/after gate** rather than trusting any bundle
  estimate in this document, since the largest unquantified cost (Radix, via
  shadcn) depends entirely on the component list `sdd-design` hasn't chosen yet.

## Risks

- The three-guard collision cluster is the highest-probability way this migration
  silently regresses a legal-evidence-adjacent invariant — **because the collision
  comes from Tailwind's own shipped defaults, not from anything the team writes.**
- shadcn's canonical dark-mode recipe wires the app to `prefers-color-scheme`
  automatically if copied verbatim. Nothing in this jsdom-based suite would catch
  it; it would surface only in the field.
- Guard 20 (~250 lines) is the largest single rebuild and the guard most likely
  to be quietly dropped as "no longer applicable" rather than ported. It exists
  precisely because an enumerated list already failed once.
- Radix/shadcn bundle cost is genuinely unquantified pending a component list.
  Committing to "the whole frontend" before that list exists risks an unpleasant
  bundle-size surprise on a PWA that precaches everything up front for offline
  técnico use.
- The técnico flow has never been verified at phone widths; the one
  already-measured defect (104px, 14%-of-viewport header) is very likely not the
  only one.
- shadcn's default `--border` (1.26:1) is more than 2× under this project's ≥3:1
  non-text-state floor; any reuse for a meaningful state distinction needs an
  explicit override, not an assumption that "shadcn already handles
  accessibility."
- `DESIGN.md`'s tablet-only fleet framing is now inconsistent with the actual
  target; left unresolved per the user's explicit instruction.
- `LayoutTablet`'s device-declaring name is now real naming debt, not cosmetic.

## Ready for proposal

**Yes.** The investigation surfaced no reason to pause before `sdd-propose`.

The one open input needed before *design* work starts is the **shadcn component
list** (which primitives — Dialog/Select/Toggle/etc. — actually get adopted),
since that is what turns the bundle-cost and Radix-collision risks from
qualitative into quantitative. That selection belongs to `sdd-design`, not this
exploration, and does not block writing the proposal.
