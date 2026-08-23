# Proposal: Tailwind v4 + shadcn/ui design system for `apps/web`

## Intent

**Current-state gap.** `apps/web` ships 1665 measured lines of hand-authored,
global-cascade BEM CSS (`estilos/tokens.css → base.css → atomos.css →
organismos.css → panel.css`) with no scoping mechanism of any kind, and
`Boton.tsx` merges incoming classes by naive string concatenation. Guarding it,
`convencionesDeEstilos.spec.ts` runs 1812 lines — more guard than CSS. Those
guards are not style preferences: they encode defects this project measured and
paid to fix once (estado chips at 1.32:1, a 492px `scrollWidth` on a 360px
viewport, two 24px office links, a 104px two-row session header at 390px). The
suite is a **CSS source-text scanner**, so its mechanism — not just its content —
is structurally incompatible with utility-first CSS. Separately, the técnico flow
was never verified at phone width, although phones are now a settled target.

**Why now.** The product goes to a client. The user rejected the hand-written CSS
frontend, chose Tailwind v4 + shadcn/ui across the whole frontend, and accepted
the higher cost for a polished, non-generic result.

**Success.** The entire frontend runs on Tailwind v4 + shadcn/ui and reads as a
visibly new product rather than a re-skin; every protection the guard suite
encodes is still enforced by a named, rebuilt guard rather than by hope; and the
técnico flow works on the phones that are now real target devices.

## Position on the guard suite

**Rebuilding the 21 guard blocks is in scope, as a first-class deliverable — not
leftovers.** Each block gets a named disposition (REBUILD / MOOT /
COLLISION-RESOLVED) recorded before any load-bearing organism is touched, and
each rebuild ships in the same PR as the surface it protects. No guard may be
dropped as "no longer applicable" unless its disposition names what now enforces
its protection.

Two of Tailwind's own shipped defaults reproduce defects this project already
fixed, so this cluster is resolved as **one explicit decision, early**:

| Guard | Tailwind default that collides | Consequence if defaulted |
|---|---|---|
| 1 — no `overflow: hidden` | `.sr-only` is `overflow: hidden` | Reading-gate ban silently bypassed |
| 2 — exactly one `!important display` | Preflight's `[hidden] { display: none !important }` | A second, invisible `!important` rule |
| 16 — `thead` displaced, not clipped | `.sr-only`'s `clip-path: inset(50%)` | The exact 492px regression returns, **both guards still green** |

## Scope

### In Scope

| # | Deliverable |
|---|-------------|
| 1 | Tailwind v4 via `@tailwindcss/vite`, wired in `vite.config.ts` and the `main.tsx` import chain |
| 2 | `@theme` populated from the existing `tokens.css` custom properties; the 640/1024 breakpoint whitelist kept, `md`/`xl`/`2xl` dropped |
| 3 | shadcn/ui adoption; `Boton.tsx`'s string concat replaced by `cn()` (clsx + tailwind-merge) **before** any conflicting utility passes through it |
| 4 | **A visibly new product.** Each slice redesigns its screen — layout and composition are open — rather than re-skinning the current arrangement. Applies to the técnico flow as much as the office panel |
| 5 | `LayoutTablet` renamed to `LayoutTecnico` — the role, not the device |
| 6 | All 21 guard blocks given a named disposition and rebuilt against JSX / `cva` / `@theme` / compiled CSS |
| 7 | Collision cluster (guards 1, 2, 16) resolved explicitly and early |
| 8 | **No dark variant at all** — the generated `.dark` block and `@custom-variant dark` deleted, no `next-themes`, no `ThemeProvider`; `color-scheme: light` survives verbatim |
| 9 | shadcn default tokens overridden or re-verified against this project's own floors (`--border` at 1.26:1 and `--muted-foreground` at 4.73:1 are not trusted) |
| 10 | Técnico flow verified at 360–430px: no `scrollWidth` overflow, every control ≥48px — the bar the office panel already cleared |
| 11 | Conversion of all 21 components and 10 containers; removal of the hand-authored BEM sheets |
| 12 | **The whole `dist/` directory bounded by a hard 650 KiB ceiling**, enforced per slice as pass/fail — not a report. Measured baseline 503.33 KiB leaves 146.67 KiB of headroom for Tailwind's CSS output plus every Radix primitive the component list adopts |

**On deliverable 12 (the ceiling).** The measured set is the **entire `dist/`
directory** — everything the device downloads for offline use — at **515,412 B =
503.33 KiB** on a clean `pnpm build` at the branch point. It is deliberately not
`dist/assets/**` (483,269 B = 471.94 KiB, the exploration's figure, which
reproduced exactly) nor the 13-entry precache set (486.41 KiB). All three
readings were in circulation across the artifacts, and the ~31 KiB spread between
the loosest and the strictest was headroom nobody had measured, because CI runs
no `vite build`. The whole directory admits no argument about which subset counts,
which is the entire point of a hard gate.

The ceiling was **raised from 600 KiB to 650 KiB on that measurement, not on
preference**: real headroom under the strict set is 146.67 KiB, where 600 had
been chosen against a stated ~128 KiB that silently assumed the loosest set.

**The ceiling counts raw bytes.** Every ecosystem size figure the exploration
cites (`clsx` ~0.5 KB, `tailwind-merge` ~1.6 KB, `lucide-react` ~5 KB) is
**gzip**. The two units are not comparable, and budgeting gzip figures against
this raw ceiling would under-estimate consumption badly.

**On deliverable 5 (the rename).** `docs/sdd/contract-list-search/design.md` D13 already refused to reuse `LayoutTablet` for the office panel precisely because the name "declares a device assumption"; phones now make that assumption wrong for the técnico side too. `LayoutTecnico` names the role and pairs with its existing sibling `LayoutPanel`, which already names a surface rather than a device. It is one mechanical rename across 7 files (`rutas.tsx`, both layout components, both specs, and two CSS files this migration deletes anyway), so **slice A owns it**: landing it before any conversion keeps pure import churn out of every redesign diff, and `pnpm typecheck` catches a missed importer immediately.

### Deferred to `sdd-design` (not a non-goal)

- **The shadcn component list** — which primitives (Dialog, Select, Toggle, …)
  get adopted. This proposal deliberately does not choose it. It is the single
  input that turns the Radix bundle cost from qualitative into quantitative, and
  it belongs to design. It must be chosen **against the 650 KiB ceiling**
  (Dependencies 2), not measured against it afterwards — and costed in raw
  bytes, since published Radix figures are gzip.
- **The guard-suite endpoint shape** — one rebuilt file, or a shrinking CSS
  scanner running beside a growing JSX scanner and deleted last. This decides how
  "no protection unenforced" stays demonstrable *mid-chain*, not just at the end.

### Out of Scope

- **Amending `DESIGN.md`'s tablet-only fleet framing.** Now narrower than the
  truth; the user has stated it is not this change's call.
- **Re-choosing the brand palette.** The brand values settled by the archived
  `brand-identity` change carry into `@theme` unchanged. **This constrains colour
  only.** Layout, composition and component design are open per screen (In Scope
  4) — read this bullet as "the green primary and the brand blues survive", never
  as "keep the current design".
- **A user-chosen dark mode.** Deliberately foreclosed by item 8.
- **Contrast floors derived from ambient light.** Settled: the device's own
  brightness covers it; the existing WCAG floors are the bar.
- API, contract templates, signature logic, contract state machine, routing, and
  `openspec/changes/production-deployment/` — untouched.

## Capabilities

### New Capabilities

- `design-system-foundation`: the styling substrate — Tailwind v4 + shadcn/ui,
  `@theme` tokens, `cn()` merging, the two-breakpoint whitelist, the single-theme
  policy (no dark variant, `color-scheme: light`), and the hard 650 KiB ceiling
  on the whole `dist/` directory, measured in raw bytes.
- `styling-guards`: the protections the guard suite enforces and the rule that
  every one of the 21 blocks carries a named disposition, none silently dropped.
- `handheld-readiness`: phones and tablets as equal técnico targets — no
  horizontal overflow and ≥48px touch targets from 360px up.

### Modified Capabilities

- `brand-presentation`: its **Brand-blue contrast rule** requirement is bound to
  "shipped stylesheets under `apps/web/src/estilos/`" and to `#008bff` never
  appearing in a stylesheet. After the migration, colours live in `@theme` and
  utility tokens in JSX, so the requirement's intent survives but its scenarios
  must be re-expressed. Its two wordmark requirements are mechanism-agnostic and
  are unchanged. `product-identity` is unaffected.

## Approach

**Incremental strangler, atom-first, leaf-to-load-bearing.** Install Tailwind
alongside the existing sheet chain; convert leaf components first, rebuild the
corresponding guard in the same PR, and reach the load-bearing organisms last.

Two independently sufficient reasons, per exploration §6:

1. Guard rebuilds land with the code they protect. Guard 20 alone is a ~250-line
   parallel engine; batching all 21 dispositions into a follow-up PR is exactly
   the shape that produces "the guard quietly stopped guarding."
2. Preflight lands **globally** the instant `@import "tailwindcss"` is wired —
   there is no per-component Tailwind. Landing it with the suite kept green
   step-by-step beats burying it in one large diff.

Order: the 5 atoms (`Boton`, `CampoTexto`, `Etiqueta`, `MarcaProducto`,
`Spinner`) first — smallest blast radius, and they force the `.boton`-family
rebuilds (guards 3–6) earliest. Last, with dedicated scrutiny: `VisorDeDocumento`
(guard 17, legal evidence), `LienzoDeFirma` (guards 4/19), `EscanerDeMac`
(guard 2), `TablaDeContratos` (guard 20 + the `sr-only` risk),
`BarraDeBusqueda`/`Paginador` (guards 12/13). Both styling systems coexist for
the duration — an accepted cost.

**Each slice is a redesign, not a port.** A slice arrives at a screen the user
would call new: layout and composition are chosen fresh, constrained only by the
brand palette, the guard protections, and the handheld bar. Two consequences the
ordering must absorb — a redesigned screen produces a larger diff than a
substrate swap (reflected in the forecast below), and the guard rebuilt in that
same slice is validating new markup rather than a renamed equivalent, which is
the argument for keeping the load-bearing five last rather than a reason to
loosen the ordering.

**Slice A carries the `LayoutTecnico` rename and the `dist/` ceiling harness**
before any screen is redesigned, so that every later slice is measured against
the ceiling from its first commit and references the final name.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/vite.config.ts` | Modified | `tailwindcss()` alongside `react()`, `VitePWA()` |
| `apps/web/src/estilos/*.css` (1665 lines) | Removed/Replaced | BEM sheets give way to `@theme` + utilities |
| `apps/web/src/estilos/convencionesDeEstilos.spec.ts` (1812 lines) | Modified | 21 named dispositions; scan target moves to JSX/`cva`/`@theme`/compiled CSS |
| `apps/web/src/componentes/**` (21 files) | Modified | Every `className="bem-name"` usage; layout and composition redesigned per screen |
| `apps/web/src/funcionalidades/**/contenedores/*.tsx` (10 files) | Modified | Same |
| `apps/web/src/componentes/plantillas/LayoutTablet.tsx` (+ spec) | Renamed | → `LayoutTecnico`; importers are `rutas.tsx` and `LayoutPanel.tsx` only |
| `apps/web/src/componentes/atomos/Boton.tsx` | Modified | String concat → `cn()`, before any conflicting utility flows through |
| `apps/web/src/main.tsx` | Modified | Tailwind entry import in the existing chain |
| `apps/web/components.json`, `package.json` | New/Modified | shadcn config; `clsx`, `tailwind-merge`, `cva`, `lucide-react` |
| `apps/web/src/pwa/configuracionPwa.ts` | Unchanged | `globPatterns` already covers compiled `.css` |
| `apps/api/**`, `prisma/plantillas/*.html` | Unchanged | Explicitly out of scope |

## Size forecast

| Slice | Content | Est. authored lines |
|-------|---------|--------------------|
| **A** | Tailwind + shadcn install, `@theme` from tokens, dark-variant deletion, `cn()`, `LayoutTecnico` rename, `dist/` ceiling harness | ~300 |
| **B** | Collision cluster (guards 1/2/16) resolved + rebuilt | ~250 |
| **C** | 5 atoms redesigned + guards 3–6, 8, 18, 21 | ~450 |
| **D** | Molecules and non-load-bearing organisms redesigned + guards 13–15 | ~450 |
| **E** | Guard 20's parallel touch-floor engine | ~300 |
| **F** | The 5 load-bearing organisms redesigned + guards 17, 19; BEM sheets removed | ~500 |
| **G** | Handheld verification at 360–430px | ~150 |

Roughly 2400 authored lines against a 400-line review budget — up from an earlier
~2000 because deliverable 4 makes each component slice a redesign rather than a
substrate swap. **Chained PRs recommended: Yes** — A → G, each independently
shippable and revertible; slices C, D and F will likely each need splitting again.
`sdd-tasks` owns the binding forecast; this is an early sizing signal, not that
decision.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The 1/2/16 collision cluster silently regresses a legal-evidence-adjacent invariant — the collision comes from Tailwind's defaults, not from anything the team writes | **High** | Slice B: resolved explicitly before any organism is converted; guards rebuilt to see compiled output, not just `src/**/*.css` |
| Guard 20 (~250 lines) is dropped as "no longer applicable" rather than ported — it exists *because* an enumerated list already let two 24px links through | Med–High | Its own slice (E), with the disposition register as the gate |
| shadcn's canonical setup wires `.dark` to `prefers-color-scheme` via `next-themes`/`enableSystem`; nothing in this jsdom suite would catch it | Med | Structural deletion (In Scope 8) plus a guard asserting no `.dark`, no `@custom-variant dark`, no theme-provider dependency |
| shadcn's `--border` (1.26:1) or `--muted-foreground` (4.73:1, 0.23 of margin) carries a meaningful distinction | Med | Both re-verified against this project's own resolvers before shipping; overridden where state depends on them |
| Radix bundle cost is unquantified on a PWA that precaches everything for offline use | Med | Hard 650 KiB whole-`dist/` ceiling enforced per slice from A onward; `sdd-design` picks the component list against that ceiling instead of discovering it afterwards |
| A late slice breaches the 650 KiB ceiling after earlier slices spent the 146.67 KiB of headroom | Med | The ceiling is checked every slice, not at the end, so the breach surfaces on the slice that causes it while its component choice is still reversible |
| Gzip ecosystem figures are budgeted against a raw-byte ceiling, under-estimating consumption several-fold | Med | Stated explicitly where the ceiling is defined (In Scope 12); the gate measures the built directory, so an under-estimate fails the slice rather than shipping |
| A redesigned screen retrains técnicos in the field on a flow they already know | **Certain — accepted** | Chosen by the user over the conservative and hybrid options with this cost stated; `handheld-readiness` and the guard protections bound how far a redesign may drift |
| The `LayoutTecnico` rename misses an importer | Low | Slice A, before any redesign diff; only `rutas.tsx` and `LayoutPanel.tsx` import it, and `pnpm typecheck` fails on a miss |
| Focus guard 6 ported verbatim either false-fails idiomatic shadcn or gets deleted | Med | The *judgment* is expanded to recognize ring-based replacements — a design decision, recorded, not a silent edit |
| Técnico flow has other undiscovered phone-width defects beyond the measured 104px header | Med | Slice G's explicit 360–430px acceptance criterion |
| Both styling systems coexist for the migration's duration | **Certain — accepted** | Inherent to the strangler shape; both suites run in parallel throughout |

## Rollback Plan

- Every slice is an independent PR; `git revert` restores the previous state.
  Nothing outside `apps/web` is touched.
- A partial revert is safe **by construction**: coexisting BEM and Tailwind is the
  designed steady state during the migration, not a broken intermediate.
- Full rollback reverts the chain in reverse (G → A); reverting slice A removes
  the Vite plugin, the Tailwind import and the `LayoutTecnico` rename, restoring
  the pure BEM chain.
- A redesigned screen cannot be un-redesigned by half: reverting a component slice
  restores that screen's previous design wholesale, which is why each slice stays
  scoped to screens that can ship together.
- A reverted CSS bundle ships as an ordinary service-worker update applied between
  visits (`skipWaiting: false`, `clientsClaim: false`) — never mid-signature.

## Dependencies

Real-world sequencing, **not implementation tasks**:

1. **No external dependency.** No hardware, provider, domain, or third-party
   sign-off gates this change.
2. The **shadcn component list** must be settled in `sdd-design` before any
   Radix-backed organism (slice F) is converted, and must be **chosen against the
   650 KiB ceiling** — each candidate primitive costed before adoption, not
   measured after, and costed in **raw bytes** rather than the gzip figures the
   ecosystem publishes. A list that cannot fit the ceiling is a design-phase
   finding, not an apply-phase surprise.
3. The **`dist/` baseline is already measured** — done at the branch point on a
   clean `pnpm build`: 515,412 B = 503.33 KiB for the whole directory (of which
   `dist/assets/**` is 483,269 B = 471.94 KiB and the 13-entry precache set is
   486.41 KiB). No further baseline capture gates slice A.
4. **Slice A must add the build-and-measure step the ceiling depends on.** CI
   runs no `vite build` today, so nothing currently produces a `dist/` to measure.
   A pass/fail gate that no pipeline executes is not a gate — this is the one
   piece of enforcement machinery the ceiling cannot be stated without.

## Success Criteria

- [ ] All 21 guard blocks carry a named disposition; no protection listed in the
      exploration's audit is left unenforced at the end of the chain
- [ ] `pnpm -r test`, `pnpm typecheck` and `pnpm lint` pass
- [ ] No `.dark` block, no `@custom-variant dark`, no `next-themes` and no theme
      provider anywhere in `apps/web`; `color-scheme: light` still declared
- [ ] Técnico flow at 360–430px: `scrollWidth === clientWidth`, every interactive
      control ≥48px on both axes
- [ ] Every shipped colour still clears 4.5:1 for text and ≥3:1 for non-text state,
      measured by the project's own resolvers
- [ ] No hand-authored BEM stylesheet remains under `apps/web/src/estilos/`
      beyond the `@theme` layer
- [ ] **The whole `dist/` directory is at or under 650 KiB (665,600 raw bytes) at
      every slice boundary**, not only at the end; a slice that breaches it does
      not ship
- [ ] No `LayoutTablet` identifier, filename or class token remains in
      `apps/web`; `LayoutTecnico` is its only name
- [ ] Every redesigned screen is visually reviewed by the user before its slice
      merges — "visibly new" is a judgment this suite cannot assert, so it is
      confirmed the same way the `brand-identity` icons were
- [ ] `apps/api/`, `prisma/plantillas/*.html` and the signature logic are
      byte-identical

## Question round — disposition

| # | Question | Disposition |
|---|---|---|
| 1 | Polish latitude | **Answered.** A visibly new product is the point; each slice redesigns its screen, técnico flow included. Chosen over the conservative and hybrid options with the field-retraining cost stated → In Scope 4 |
| 2 | Guard-suite endpoint shape — one rebuilt file, or a shrinking CSS scanner beside a growing JSX scanner deleted last | **Routed to `sdd-design`** as a technical decision. It governs how "no protection unenforced" stays demonstrable mid-chain, not only at the end |
| 3 | Client demo date | **Unanswered, recorded.** It only reorders the chain (demo path vs. atoms-first, at a known guard-safety cost), so it is raised before `sdd-tasks` rather than blocking here |
| 4 | `LayoutTablet` rename | **Answered — overturns this proposal's original position.** Renamed now, in slice A. This proposal had argued import churn and deferred it; the user overruled that with the reasoning in front of them → In Scope 5 |
| 5 | Bundle ceiling | **Answered, then revised on a measurement.** Originally 600 KiB; raised to **650 KiB** once a clean build showed the whole `dist/` at 503.33 KiB rather than the 471.94 KiB assets-only figure the 600 had been chosen against. Hard, raw-byte, pass/fail per slice → In Scope 12 |
