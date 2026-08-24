# Design: Tailwind v4 + shadcn/ui design system for `apps/web`

Two decisions the proposal deferred here are settled below (D1, D2). Everything
else is the mechanism the proposal assumed exists.

**Spec amendments — all three landed.** Each was argued at its decision below
and has since been applied by `sdd-spec`. This index is a cross-reference, not
an outstanding to-do list.

| Spec | Amendment | Status | Where |
|---|---|---|---|
| `styling-guards` | disposition vocabulary: 3 values → 5, each naming its owning scanner | **Landed** — and went further: its scenario explicitly rejects the retired `REBUILD`, and guard 1's token ban became its own scenario, assertable independently of whether a build has run | D2 |
| `handheld-readiness` | 3 manual scenarios become automated; "no layout engine" re-scoped to the unit suite | **Landed** — and corrected a defect in this design; see D8's fail-closed note | D8 |
| `design-system-foundation` | ceiling set → whole `dist/`; value → 665,600 raw bytes | **Landed** — plus a scenario this design did not request, making an absent or empty `dist/` fail rather than pass on a 0-byte measurement | D7 |

The 650 KiB ceiling is a **user decision** taken on the measured baseline in D7.
`proposal.md` has been amended to match — In Scope 12, its Success Criteria and
its question-round disposition 5 all read 650 KiB over the whole `dist/`, with
the 503.33 KiB baseline and 146.67 KiB headroom. Design, proposal and spec now
agree on this number; there is no conflict here left to reconcile.

## Technical Approach

shadcn is **vendored source, not a runtime dependency**: `npx shadcn add` copies
files in, and this project then owns and edits them. Adoption therefore means
adopting shadcn's `cva` structure and class recipes into the existing Spanish
tiers (`Boton`, `CampoTexto`, `Etiqueta`, …), with `components.json` committed
and `aliases` pointing at those tiers. Consequence: shadcn's `--border`
(1.26:1), its `TableRow` `hover:bg-muted/50`, its `sr-only` usages and its
`dark:` utilities are **our source**, scanned like the rest of `src/` — not
third-party behaviour to trust. D1 leans on this heavily.

---

## D1 — Component list, and the honest state of its Radix claim

### What is verified

A scan over **every `.tsx` under `apps/web/src`** (a superset of the 21
components and 10 containers) found **zero** occurrences of `<select>`,
`<details>`, `<summary>`, `<menu>`, `popover`, `Dropdown`, `Tooltip`,
`Accordion`, and no dialog or modal. The only toggle is
`BarraDeBusqueda.tsx:72`'s `<button aria-pressed>` (its line 31 comment
documents that choice over checkboxes); the only radios are native
`type="radio"` (`FormularioEquipos.tsx:87,97`).

**This is a statement about which surfaces this app has, not about the adopted
list's contents.** What it establishes is the load-bearing half: the primitives
with real weight — Dialog, Select, Popover, Dropdown, Tooltip, Accordion — are
not needed, because nothing in this app is one of those things. That is what
removes the large unquantified term the exploration flagged.

### What is NOT verified, and why

**Adopted:** `Button`, `Input`, `Textarea`, `Label`, `Badge`, `Table`, `Card`,
`Alert`, `Pagination`, `Skeleton`.

`exploration.md:257-259` vouched only for `<Button>`/`<Badge>` needing no Radix.
That the other eight are Radix-free is a **new claim with no source in any
input**, and I could not check it: no shadcn source exists in this repo, and
this phase had no registry or documentation access. Two known counter-signals
make the claim actively doubtful rather than merely unsourced:

- current shadcn `Button` ships a polymorphic `asChild` via Slot;
- current shadcn `Badge` is polymorphic too (`render`/`asChild`), so the
  exploration's "Badge needs no Radix" may itself be stale.

Package granularity is likewise unverified: current shadcn imports from the
unified `radix-ui` package, not the split `@radix-ui/react-*` names.

### The response: enforce it, do not assert it

Because shadcn is vendored source, polymorphism is **removable at vendor time** —
deleting a Slot wrapper from a file we own is a mechanical edit, not a fight
with a dependency. There is also an independent reason to remove it: `asChild`
makes an element's rendered tag unknowable at the call site, which would blind
guard 20's JSX classifier (D5).

So the design does not claim Radix-freeness. It **enforces** it:

> **Vendor-import guard** (slice A, in `convencionesDeUtilidades.spec.ts`):
> no file under `apps/web/src` may import `radix-ui` or `@radix-ui/*`. A
> vendored component that arrives with one fails the suite at vendor time,
> before it ships, and the choice is then explicit: strip the polymorphic
> wrapper, or amend this design.

This converts an unverifiable belief into a build failure at the moment the
truth becomes observable. It also means the bundle question resolves in slice A
rather than at slice F: the first vendored component either passes the guard or
names its own cost.

| Addition | Radix | Cost basis | Status |
|---|---|---|---|
| `clsx` | 0 | ~0.5 KB gzip (exploration §4) | projected |
| `tailwind-merge` | 0 | ~1.6 KB gzip, secondary source | projected |
| `cva` | 0 | no verified figure exists | **unquantified** |
| `lucide-react` | 0 | tree-shaken, per-icon | projected |
| Tailwind v4 JS | 0 | zero runtime — build-time CSS | verified |
| Tailwind CSS output | 0 | replaces 19,235 B of BEM, deleted slice F | net unknown |
| Heavy Radix primitives | **0** | surfaces absent from this app | **verified by scan** |
| Slot / polymorphism | **0 intended** | removable at vendor time | **enforced by guard, not asserted** |

**These figures are gzip; D7's ceiling counts raw bytes.** Do not budget this
table against the 665,600 constant directly — see D7's unit trap.

**Escape valve.** Composition is open per slice, so a redesign may want a
primitive. Any Radix adoption is an amendment requiring a measured delta on a
spike branch *before* adoption, and may land only in the final slice or later —
never earlier — so dropping it unwinds no prior work.

## D2 — Guard endpoint: two scanners plus an executable register

**Choice: (b)**, and a third piece neither option had.

| File | Scope | Runs in |
|---|---|---|
| `convencionesDeEstilos.spec.ts` | unchanged CSS-text mechanism, shrinks with the CSS, deleted last (slice F) | jsdom suite |
| `convencionesDeUtilidades.spec.ts` | `src/**/*.tsx`, `cva` variant maps, the `@theme` block, vendor imports | jsdom suite |
| `convencionesDeCompilado.compilado.spec.ts` | compiled `dist/` output — guards 1, 2, 16 | bundle job (D7) |
| `guardias/registro.ts` + `.spec.ts` | the 21 dispositions | jsdom suite |

Register assertions — this is what makes it demonstrable *mid-chain*:

1. Exactly 21 entries, numbered 1–21, no gaps.
2. Every non-MOOT entry's named `it(...)` title is present in its named spec
   file's source. **Deleting a guard fails the register.**
3. Every `CSS` entry names a `src/estilos/*.css` file that still exists — when
   the last sheet goes, a lingering `CSS` disposition fails rather than
   silently scanning nothing.
4. Every `MOOT`/`RESUELTA` carries a non-empty `porque`.

**Why not (a).** One file does not remove the second scanner, it hides it. Both
surfaces coexist for the whole chain, so a single file must carry both engines
anyway; what it loses is file-level evidence of which half is live. A guard
rebuilt to scan JSX stops covering the still-BEM components and stays green —
the exact failure this change defends against. Under (b) each retirement is a
visible file deletion, and each ratchet-down of the CSS scanner's own non-empty
floors (`:171`, `controles.length >= 15` at `:1676`) is an explicit reviewed
edit. The register closes the hole *neither* scanner can see: a protection that
left CSS and never arrived in JSX. Precedent: this is `EXENCIONES` + "keeps
every exemption earning its place, so the list cannot rot into a blanket"
(`:1508`, `:1693`) scaled to the whole suite.

> **Spec amendment required — `styling-guards`.** Its `:15-34` requires exactly
> one of `{REBUILD, MOOT, COLLISION-RESOLVED}` and has a scenario that fails on
> any other value; `proposal.md:29-31` says the same. This design uses five:
> **`CSS｜JSX｜AMBOS｜MOOT｜RESUELTA`**. The reason is the endpoint choice
> itself — with two scanners live simultaneously, `REBUILD` cannot say *which
> scanner now owns the protection*, and that is precisely the fact that makes
> "nothing is unenforced" checkable mid-chain. `REBUILD` splits into
> `CSS`/`JSX`/`AMBOS`; `COLLISION-RESOLVED` becomes `RESUELTA`; `MOOT` is
> unchanged. `sdd-spec` must re-express both scenarios.

### File-split mechanism (why the compiled guards are a separate file)

`apps/web/vitest.config.ts:16` includes `src/**/*.spec.ts` in the default run,
so any spec under `src/estilos/` is swept into `pnpm -r test` — where `dist/`
does not exist on a clean checkout, and a D7-style fail-closed scan would fail
a proposal Success Criterion.

Follow the convention `apps/api` already uses for exactly this (its
`vitest.config.ts` excludes `*.integration.spec.ts`, run instead by
`vitest.integration.config.ts` via `test:integration` — see `ci.yml:75-77`):

- compiled-output guards are named `*.compilado.spec.ts`;
- `apps/web/vitest.config.ts` gains a matching `exclude`;
- `apps/web/vitest.compilado.config.ts` + a `test:compilado` script run them,
  in the bundle job only, after `vite build`.

## D3 — `@theme` from `tokens.css`

### Colour: all 18, unchanged

`tokens.css` declares **18** `--color-*` custom properties — 3 brand
(`--color-primario`, `--color-primario-oscuro`, `--color-marca-azul`), 5
neutrals (`--color-fondo`, `--color-texto`, `--color-texto-suave`,
`--color-borde`, `--color-borde-suave`), 2 semantic (`--color-error`,
`--color-foco`), 8 estado. **All 18 copy byte-for-byte.** They already sit in
Tailwind's `--color-*` namespace, so they generate `bg-primario`,
`text-marca-azul`, `bg-estado-vigente-fondo` with no rename and no value change
(palette not re-opened). `--color-foco` is included explicitly — D6 depends on
it.

### Everything else

| `tokens.css` | `@theme` | Note |
|---|---|---|
| `--espacio-1..6` (4/8/12/16/24/32px) | dropped | exactly Tailwind's default 4px scale at `1,2,3,4,6,8` |
| `--tamano-toque-minimo: 48px` | `--spacing-toque: 48px` | one named source → `min-h-toque`, `size-toque`; guard 3's "token ≥48px" moves to `@theme` |
| `--fuente-base: 18px` / `--fuente-grande: 22px` | `--text-base` / `--text-grande` | see D4 |
| `--familia-tipografica` | `--font-sans` | |
| `--radio-borde: 8px` | **`--radius-base: 8px`** | Tailwind v4's border-radius namespace requires a suffix (`--radius-xs` … `--radius-4xl`); a bare `--radius` generates no `rounded-*` utility at all. `--radius` is shadcn's own `:root` convention, mapped in via `@theme inline` — not needed here, since this project keeps its own token layer |
| 640/1024 (prose only today) | `--breakpoint-*: initial;` + `--breakpoint-tableta: 640px; --breakpoint-escritorio: 1024px;` | `sm/md/lg/xl/2xl` **cease to exist** rather than being banned |

An unknown variant prefix compiles to nothing *silently*, so guard 7 also
rebuilds as a JSX prefix whitelist rather than resting on the config.

### `base.css` — rule by rule, because three rules cannot move verbatim

An earlier draft said `base.css` moves "verbatim". It cannot: three of its rules
read tokens this same decision deletes or renames, and an undefined `var()`
falls back silently to the initial value — the exact "passes by doing nothing"
class D7/D8 build fail-closed machinery against.

| `base.css` rule | Disposition |
|---|---|
| `[hidden] { display: none !important }` | **Deleted** (slice B) — Preflight ships the equivalent; see the collision cluster |
| `*, *::before, *::after { box-sizing }` | **MOOT** — Preflight matches it exactly (exploration §6) |
| `:root { color-scheme: light }` | verbatim |
| `html, body, #app { height: 100% }` | verbatim |
| `body { … }` | **rebound** — `--familia-tipografica` → `--font-sans`, `--fuente-base` → `--text-base`; its two `--color-*` survive |
| `h1,h2,h3`, `h2` | **rebound** — `--fuente-grande` → `--text-grande` |
| `:focus-visible { outline: 3px solid var(--color-foco) }` | verbatim — D6 depends on it |
| `[role="alert"]` (`:70-79`) | **rebound** — `var(--espacio-3)`, `var(--espacio-4)` and `var(--radio-borde)` are all deleted or renamed by the table above. Rewritten with literal `rem` values and `--radius-base`. This is the app's only global error affordance |
| `input[type="radio"|"checkbox"]` (`:81-86`) | **rebound and load-bearing** — `var(--tamano-toque-minimo)` → `--spacing-toque`. This rule is the *only* thing sizing the native radios D1 relies on (`FormularioEquipos.tsx:87,97`) to 48px, and `BarraDeBusqueda.tsx:32` cites it by name. It moves into `@layer base` in slice A, not slice F |

## D4 — Guard 7's rebind: literal utilities, not inheritance

**The inherited `--fuente-base` rebind does not survive.** The mechanism being
retired is `panel.css:38` — `.layout-panel { --fuente-base: 16px; }` — which is
inert unless *read back*, which `panel.css:56` does with
`font-size: var(--fuente-base)`. Both halves are policed by
`convencionesDeEstilos.spec.ts:596` and `:632`, whose comment records that the
declaration alone left the panel split across two type sizes. (Separately,
`panel.css:170` sets `font-size: 0.875rem` directly on the panel's header
elements — the header shrink, a plain declaration, not a rebind. Both are
replaced by literal utilities.)

Rationale: the "rebind alone is inert" bug needs an inherited custom property to
exist in order to happen. With literal per-element utilities it is
**structurally impossible**, so guard 7's rebind half retires MOOT with a
mechanism behind it rather than a promise. Cost: every panel component names its
own size — more tokens in JSX, each locally visible, the same "the declaration
must be where you can see it" property guard 21 already enforces for inline
boxes.

**Consequence for guard 8.** Its ≥1rem floor is implemented with
`if (rutaRelativa.endsWith("panel.css")) continue;` (`:871-873`, documented at
`:854-859`) — a *filename*-based exemption that lets the office use 16px type.
After the migration there is no `panel.css`, so the rebuilt guard 8 needs a new
exemption axis: the panel subtree, identified by component path
(`componentes/**` and `funcionalidades/contratos/**` rendered under
`LayoutPanel`) rather than by stylesheet. Without that, guard 8 either
false-fails every office component or is deleted.

## D5 — Guard 20's parallel engine

Lands in `estilos/guardias/pisoDeToque.ts`, exported and unit-tested apart from
the scan that feeds it — the lesson `removalesSinReemplazo` (`:140`) records:
a scan that hands the judge the wrong body fails silently in the direction that
matters.

| CSS engine | JSX/`cva` analogue |
|---|---|
| `reglasDeclaradas` | tag + literal `className` + `cva` variant-map values per `.tsx` element |
| `PSEUDOCLASES_INTERACTIVAS` / `ELEMENTOS_INTERACTIVOS` / `cursor:pointer` | same tag set, or `onClick`/`onChange`, or `cursor-pointer`, or a `hover:`/`focus:`/`disabled:` variant |
| `identidadesDeCobertura` (BEM fallback) | **disappears** — `cva` resolves one deterministic class list per call |
| `declaraAlMenosElPiso` | `*-toque`, or `h-N`/`min-h-N` where `N*4 ≥ 48` |
| `display:inline` veto | `inline` present without `inline-flex｜block｜grid` |
| `ANCHO_COMPLETO` / `DISPLAY_DE_BLOQUE` | `w-full`/`min-w-full`, or `flex｜grid｜block｜table` |
| `EXENCIONES` + `porque` + anti-rot test | carried over verbatim, keyed on component + element |
| `controles.length >= 15` | same non-empty floor over the JSX corpus |

Native controls sized by the `@layer base` rule (D3's last row) rather than by a
class are resolved against that rule, not reported as violations.

## D6 — Guard 6's focus judgment

`base.css`'s global `:focus-visible { outline: 3px solid var(--color-foco) }`
stays in `@layer base`, so focus is visible by default on every element
including vendored source. The expanded judgment accepts a replacement only when
**all three** hold: (i) it sits on a `focus-visible:` variant, never
unconditional; (ii) it is a ring/outline/shadow token with non-zero width; (iii)
its colour resolves ≥3:1 against the adjacent background through the same
`@theme` map guards 9–12 use. (iii) is what stops shadcn's idiomatic
`focus-visible:ring-ring/50` from passing on shape alone — the same failure
class guard 13 caught at 1.32:1. Values are captured then tested, never decided
by a lookahead (`:96–101`). Rings pass, so idiomatic shadcn does not false-fail;
bare `outline-none` still fails, so the guard is not deletable.

## D7 — How the `dist/` ceiling is actually enforced

`apps/web/scripts/techoDeDist.ts`, run as `pnpm --filter @contratos/web size`
after `vite build`, in a **new CI job** — `.github/workflows/ci.yml` runs no
`vite build` today, so this is a new job, not a new step.

### The baseline — measured, not estimated

A clean `pnpm build` in `apps/web`, measured with `du -sb`:

| Set | Bytes | KiB | |
|---|---|---|---|
| `dist/assets/**` | 483,269 | 471.94 | reproduces the exploration's baseline exactly |
| Precache set (13 entries) | ~498,084 | 486.41 | |
| **Whole `dist/`** | **515,412** | **503.33** | **the measured set** |

**The gate measures the whole `dist/` directory.** That is everything the device
downloads for offline use, and it admits no argument about which subset counts.

> **Double-count trap — do not implement the spec's wording literally.**
> `design-system-foundation:104-109` says "`dist/assets/` plus `sw.js`'s precache
> manifest". The precache set **already contains** the assets, so summing the two
> double-counts 471.94 KiB and reports 958.35 KiB — a breach on a build that is
> entirely fine. Whole `dist/` is 503.33 KiB. This is why the spec needs the
> amendment indexed at the top of this document.

### The ceiling — 650 KiB (665,600 bytes)

Raised by the **user** from 600 KiB, shown the measured baseline. The 600 KiB
figure had been chosen against a stated ~128 KiB of headroom, which was computed
from the assets-only baseline; against the real whole-`dist/` baseline it was
**96.67 KiB** — a quarter less than the number the choice rested on. At 650 KiB
the headroom is **146.67 KiB**.

> **Unit trap — this ceiling counts raw bytes; every ecosystem figure in
> exploration §4 is gzip.** D1's cost table is faithful to its source and
> correctly labelled, but budgeting those gzip numbers directly against this
> ceiling under-estimates by roughly 3×: the "~10–15 KB gzip" of JS additions is
> plausibly ~30–45 KB raw here. Every figure compared against the 665,600
> constant must be a raw one.

### The gate

- Sums whole `dist/` against the committed `665600` constant; prints
  used / ceiling / headroom so every slice's PR carries the number.
- **No manifest parsing.** Measuring the directory removes the `sw.js` parse step
  and the double-count trap along with it.
- **Fails closed**: non-zero exit if `dist/` is missing, empty, or holds fewer
  files than a committed floor — the same discipline as `:171` and `:1676`. A
  ceiling that passes on an absent build is not a ceiling.
- Step order in the job is ceiling → compiled-CSS guards → browser (D8), so a
  breach fails in about a second without paying for Chrome.

**Slice A's re-measure is now falsifiable.** Dependencies 3 requires a baseline
at the branch point. It re-measures whole `dist/` against 650 KiB with a known
expected value of **515,412 B (503.33 KiB)** — so a branch point that measures
materially differently means something changed before this migration started,
and the step reports that instead of silently recording whatever it finds.

## D8 — Handheld geometry is automated, not measured by hand

**Answer: yes, it can be automated, and it must be.** The claim that "this stack
has no automated layout engine" is true of `apps/web`'s `vitest`/`jsdom` config
and false of this repository:

- `apps/api/package.json:42` ships `"puppeteer": "^25.4.0"` as a real
  dependency, already driving `GeneradorDeDocumentosPuppeteer.ts`.
- `.github/workflows/ci.yml:199` already installs a real Chrome into the shared
  `~/.cache/puppeteer`.
- D7 adds the job that produces a built application for it to load.

Leaving this to human discipline would have the design contradict its own
thesis. The técnico phone width is the one target never verified at all, and a
protection that rests on someone remembering to measure is the exact failure
mode this change exists to remove.

### What the harness must actually drive — routes are not the unit

`rutas/rutas.tsx` declares **five** routes, of which exactly **one** is técnico:
`path: "/"` → `InicioTecnico`, inside `LayoutTablet` (`:56-63`). The rest are
`/login`, `/panel-no-disponible`, `/panel`, `/panel/contratos/:id`.

`FormularioBorrador` → `EnvioDeFirma` → `PasoFirmaDual` are **in-page state
transitions inside `InicioTecnico`** (`InicioTecnico.tsx:104-121`), not URLs. So
a harness that only navigates URLs reaches `/` in its initial state and stops —
and `LienzoDeFirma` and `VisorDeDocumento`, the surfaces guards 19 and 17
protect and the ones most at risk on a 360px screen, are never rendered.

The unit is therefore a **measured state**, not a route:

| # | State | Reached by |
|---|---|---|
| S1 | `/login` | navigation |
| S2 | `/` — `FormularioBorrador` | navigation + seeded técnico session |
| S3 | `/` — `EnvioDeFirma`/`PasoFirmaDual` (`LienzoDeFirma`, `VisorDeDocumento`) | **driven**: fill the draft form, intercepted `POST /contratos` returns a fixture, tap "Continuar" |
| S4 | `/panel-no-disponible` | navigation |
| S5 | `/panel` | navigation + seeded oficina session |
| S6 | `/panel/contratos/:id` | navigation + intercepted detail fixture |

**Cost of S3, stated rather than hidden.** It requires a committed visit script
that fills real fields and clicks real controls, maintained alongside
`FormularioBorrador`. That is the one genuinely brittle piece of this design. It
is worth it because S3 is where the phone-width risk actually lives. The
brittleness is contained by the fail-closed floor below: a script whose
selectors drift **fails**, rather than silently measuring S2 twice.

### Mechanism — `apps/web/scripts/geometriaHandheld.ts`

| Aspect | Decision |
|---|---|
| Driver | `puppeteer` in `apps/web` devDependencies at the same `^25.4.0` range, so pnpm resolves one store entry and the browser is the one already in `~/.cache/puppeteer` |
| Server | `vite preview` over the real `dist/`, already configured in `vite.config.ts` |
| No API, no Postgres | `page.setRequestInterception(true)` fulfils `/auth/*` and `/contratos/*` from committed fixtures; sessions seeded into `localStorage` via `evaluateOnNewDocument`. Never acquires the `integration` job's database shape |
| Viewports | 360, **390**, 430 with `isMobile`/`hasTouch` — 390 because that is where the 104px header was measured |
| Assert 1 | `documentElement.scrollWidth === clientWidth` in every state at every width |
| Assert 2 | every interactive element's `getBoundingClientRect()` ≥48 on both axes, using **the same tag set and `EXENCIONES` list as `pisoDeToque.ts`** (D5), so static and rendered checks cannot disagree about what counts as a control |
| Assert 3 | `CabeceraDeSesion`'s rendered height at 390px stays within a committed single-row budget, with the measured 104px as the regression witness |
| Fails closed | non-zero exit unless the number of states reached equals the committed constant **for the current slice** — 5 before slice F (S1, S2, S4, S5, S6), 6 from slice F onward (adding S3) — and unless each reached state measured at least a committed per-state floor of controls |

**The slice-aware constant is a correction `handheld-readiness` contributed.**
An earlier draft of this design specified a single committed states-reached
constant. That is wrong in both directions: a constant of 6 fails every slice
A–E run, because S3 cannot exist before `LienzoDeFirma` and `VisorDeDocumento`
convert; a constant of 5 would let S3's visit script silently never run once F
lands — the precise failure this floor exists to catch. The spec's
slice-appropriate constant, together with its scenario asserting that S3 drift
is reported as an unreached state rather than a silent re-measure of S2, is the
version this design now carries.

**Gotcha, named because it fails silently.** `dist/` ships `sw.js`, registered by
`app/RaizConActualizacion.tsx:2` (`registerSW` from `virtual:pwa-register`). A
live service worker answers from the precache and races the interception, so the
harness would measure a stale build and stay green. The script sets
`page.setBypassServiceWorker(true)` before the first navigation.

**Slice placement.** The harness and states S1, S2, S4–S6 land in **slice A**, so
every later slice is measured from its first commit. **S3 lands in slice F**,
with the organisms it drives — it cannot exist before `LienzoDeFirma` and
`VisorDeDocumento` convert. This absorbs the proposal's slice G (~150 lines of
handheld verification) into A and F; G is retained only for the final
whole-flow pass. `sdd-tasks` owns re-forecasting that.

**CI cost.** The build is needed for the ceiling regardless. Chrome launch plus
3 viewports × 6 states is well under a minute; S3's driving adds a few seconds.

> **Spec amendment required — `handheld-readiness`.** Three scenarios are
> written as manual checks (*no scrollWidth overflow at 360px*, *the measured
> 104px header regression does not recur*, *a manual measurement confirms the
> rendered box*); all three become automated assertions here. Its Purpose
> paragraph's "this stack has no automated layout engine (`jsdom` performs no
> layout)" must be re-scoped to `apps/web`'s unit suite.

**Deliberately still manual.** "Visibly new" is a judgment and stays a user
review per slice. Guards 17 and 19 keep their dedicated verification passes;
`styling-guards:117-123` already specifies guard 19 as an `elementFromPoint`
check, which S3 makes executable for the first time.

## Slice B — the 1/2/16 collision cluster

`styling-guards:59-72` requires guards 1, 2 **and** 16 to each scan compiled
build output. All three therefore live in
`convencionesDeCompilado.compilado.spec.ts` (D2), run in the bundle job:

- **Guard 2**: delete the project's `[hidden]` duplicate (D3) and let Preflight's
  rule be the single `!important display` in compiled output.
- **Guards 1 and 16**: scan compiled CSS for `overflow: hidden|clip` and
  `clip-path` on any rule reachable by shipped markup. The narrow-layout `thead`
  keeps the existing displacement recipe (`panel.css:254-256`, restored
  `:303-305`) as a project utility, so the measured 492px regression cannot
  return through Tailwind's built-in `.sr-only`.
- **Additionally**, the JSX scanner bans the `sr-only` token at author time.
  This is defence in depth, *not* a substitute for the compiled scan the spec
  requires: the token ban catches what we write, the compiled scan catches what
  anything — including a vendored component's internals — emits.

## File Changes

| File | Action | Slice |
|---|---|---|
| `estilos/tema.css` (`@theme` + `@layer base`) | Create — D3 | A |
| `estilos/convencionesDeUtilidades.spec.ts` | Create — D2, incl. vendor-import guard | A |
| `estilos/convencionesDeCompilado.compilado.spec.ts` | Create — D2/slice B | A→B |
| `estilos/guardias/registro.ts` + `.spec.ts` | Create — D2 | A |
| `estilos/guardias/pisoDeToque.ts` + `.spec.ts` | Create — D5 | C |
| `vitest.config.ts` (`exclude`), `vitest.compilado.config.ts` | Modify/Create — D2 | A |
| `scripts/techoDeDist.ts` | Create — D7 | A |
| `scripts/geometriaHandheld.ts` + fixtures | Create — D8 (S3 driver added in F) | A, F |
| `package.json` (`puppeteer` devDep; `size`, `test:compilado`, `handheld`) | Modify | A |
| `.github/workflows/ci.yml` | Modify — new `bundle` job | A |
| `components.json`, `vite.config.ts`, `main.tsx` | Create/Modify — setup | A |
| `componentes/atomos/Boton.tsx` | Modify — concat → `cn()` + `cva` | A |
| **`LayoutTablet` rename → `LayoutTecnico`** — `plantillas/LayoutTablet.tsx`, `.spec.tsx`, `rutas/rutas.tsx` (`:4,19,49,58,60`), `plantillas/LayoutPanel.tsx` (`:14-15`), `LayoutPanel.spec.tsx` (`:7`), `estilos/organismos.css` (`:285,287,291`), `estilos/panel.css` (`:37`) | Rename — 7 files | A |
| `estilos/{tokens,base,atomos,organismos,panel,index}.css` | Delete | F |
| `estilos/convencionesDeEstilos.spec.ts` | Delete — last | F |

### New CI job

Jobs get fresh runners, so the `bundle` job carries its **own**
`actions/cache@v4` restore on the existing `puppeteer-${{ runner.os }}-${{
hashFiles('pnpm-lock.yaml') }}` key plus its own install-on-miss step — the
cache and install at `ci.yml:187-191` and `:199` are inside the `integration`
job and are not inherited. No `needs:` — the two jobs are independent and
serialising them buys nothing.

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `pisoDeToque`, focus judgment, colour resolvers | exported pure functions, tested on fixtures before the scan uses them |
| Suite (jsdom) | 21 dispositions, JSX/`cva`/`@theme` scans, vendor imports | `pnpm -r test` |
| Compiled | guards 1, 2, 16 | `test:compilado` in the bundle job, after `vite build` |
| Build | ceiling over whole `dist/` vs 665,600 B | `techoDeDist.ts`, same job |
| Rendered | handheld geometry, 3 viewports × 6 states | D8 — Puppeteer over `vite preview` |
| Manual | "visibly new", guards 17/19 | user review per slice; dedicated passes — **not** the handheld measurements, which D8 automates |

## Threat Matrix

Included because D7 and D8 introduce subprocesses (`vite build`, `vite preview`,
Chrome). All five enumerated rows are N/A — nothing here touches Git, commits,
pushes, PRs, or file classification.

| Boundary | Applicability | Reason |
|---|---|---|
| Documentation-like paths | N/A | No file is classified or executed by path or extension; both scripts read a fixed `dist/` tree |
| Git repository selection | N/A | Neither script invokes Git |
| Commit state | N/A | No index or worktree operation |
| Push state | N/A | No ref or remote resolution |
| PR commands | N/A | No PR automation; CI is triggered by, not an author of, pull requests |

The one real boundary is the CI-only harness process, and its behaviour is
load-bearing because both checks are the kind that pass by doing nothing:

- **Safe**: both scripts take no external input — a fixed `dist/` tree,
  committed fixtures, and a `localhost` preview server. No network beyond
  locally-fulfilled intercepted requests.
- **Failure**: every failure exits non-zero. A missing or empty `dist/`, a
  preview server that never came up, fewer states reached than the committed
  constant for the current slice, or fewer controls measured than the per-state
  floor are all failures, never skips.
- **RED tests**: cases proving each harness fails on an absent build, on an
  unreachable state, and on a zero-measurement run — written before the
  harnesses themselves.

## Migration / Rollout

Slices A→G per the proposal, with D8's S3 states moving to F and G reduced to
the final whole-flow pass. Ceiling and geometry checked from A. No data
migration.

## Open Questions

- [ ] **The panel's replacement type scale.** Guard 8 exempts `panel.css` by
      filename (`:871-873`), so it never bounded the panel and cannot bound its
      replacement. D4 requires a new subtree-based exemption axis; the scale's
      actual values are a per-screen redesign decision.
- [ ] **Does 146.67 KiB of raw headroom absorb the additions?** The baseline and
      ceiling are now measured facts (D7), so what remains is the spend, not the
      budget. The terms are vendored shadcn source, `cva`/`clsx`/`tailwind-merge`,
      the lucide icons actually imported, and Tailwind's CSS output minus the
      19,235 B of BEM deleted in slice F. All are **raw**-byte quantities against
      a raw ceiling (see D7's unit trap) and none is measured. D7's gate answers
      this per slice, on the slice that causes any breach.
- [ ] Proposal Q3 (client demo date) still reorders the chain; `sdd-tasks` owns it.
