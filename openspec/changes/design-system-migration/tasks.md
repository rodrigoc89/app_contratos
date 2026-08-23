# Tasks: Tailwind v4 + shadcn/ui design system for `apps/web`

**`sdd-tasks` owns this binding forecast.** The proposal's A-G lettered slices
are kept as traceability tags, but the actual delivery unit is **16 chained
PRs** — the proposal itself flagged that C, D and F would "likely need
splitting again," and design's File Changes table relocated `pisoDeToque.ts`
(guard 20's engine) from a standalone slice E into slice C, which this
partition follows. All four known relocations from the brief are applied:
`LayoutTecnico` rename in PR2 (slice A), the native-control 48px floor in PR1
(slice A), guard 8's exemption-axis rebuild sized as its own task in PR9, and
S3's visit script confined to PR13 (after `LienzoDeFirma` exists).

**Strict TDD applies everywhere.** Every guard-disposition task and every
fail-closed mechanism (dist ceiling, handheld harness, disposition register)
is written RED-first: the test is authored before the code it tests, run,
and observed to fail **for the right reason** — not "file not found" masking
a vacuous assertion. For the three "passes by doing nothing" mechanisms, the
RED test must additionally be run once against a **naive stub** that would
trivially pass (an absent-build 0-byte sum, a no-op harness that exits 0, an
empty register) to prove the test itself would have caught that stub, before
the real implementation lands. This is called out explicitly at PR3, PR4 and
PR5 below.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4,020–4,830 across 16 PRs (see Work Units) |
| 400-line budget risk | **High** — several PRs land 300–380, three (PR6, PR10, PR13) are legal/regression-adjacent and stay near or over budget by content, not oversight |
| Chained PRs recommended | Yes |
| Suggested split | Tracker → PR1 → PR2 → … → PR16, linear feature-branch-chain |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

`auto-chain` means the orchestrator proceeds directly with PR1 under this
chain shape — no further user decision gates `sdd-apply`.

## Delivery hazard — read before merging any PR in this chain

**`gh pr merge --delete-branch` on a parent PR closes the child PR** whose
base was the deleted branch — this happened to PR #80 in this repo. Before
merging PR*n*, retarget PR*n+1* first:

```bash
gh api -X PATCH repos/<owner>/<repo>/pulls/<n+1> -f base=<PRn-target-branch>
```

`gh pr edit --base` fails here with a Projects-classic GraphQL error — use
the `gh api PATCH` form above, not `gh pr edit`. Only the tracker PR ever
merges to `master`; every child PR merges into its immediate predecessor's
branch, never `master` directly.

## Chain diagram

```
master
  └─ tracker branch (draft, no-merge)
       └─ PR1  (A1 — Tailwind/shadcn install, @theme, cn())
            └─ PR2  (A2 — LayoutTecnico rename)
                 └─ PR3  (A3 — guard scaffolding: register, JSX/compiled skeletons)
                      └─ PR4  (A4 — dist/ ceiling harness, D7)
                           └─ PR5  (A5 — handheld geometry harness, D8, 5 states)
                                └─ PR6  (B — collision cluster: guards 1/2/16)     ← 📍 highest single-PR legal-adjacent risk
                                     └─ PR7  (C1 — Boton + CampoTexto + guards 3/4/6)
                                          └─ PR8  (C1b — Etiqueta/MarcaProducto/Spinner + guards 18/21/brand)
                                               └─ PR9  (C2 — pisoDeToque.ts + guard 8 rebuild)
                                                    └─ PR10 (D1 — BarraDeBusqueda/Paginador + guards 12/13/15)
                                                         └─ PR11 (D2 — remaining molecules/organisms + guards 9-11/14)
                                                              └─ PR12 (F1 — VisorDeDocumento + guard 17)
                                                                   └─ PR13 (F2 — LienzoDeFirma + guards 4/19 + S3 driver)
                                                                        └─ PR14 (F3 — EscanerDeMac + guard 2 final)
                                                                             └─ PR15 (F4 — TablaDeContratos + guards 5/16/20 final)
                                                                                  └─ PR16 (F-cleanup+G — BEM deletion, final audit, whole-flow pass)

Only the tracker merges to master, and only after PR16 is integrated.
Each PR body marks its own position with 📍 per the chained-pr skill.
```

## Guard disposition landing map

All 21 guards, no gaps, per `styling-guards`' `{CSS, JSX, AMBOS, MOOT,
RESUELTA}` vocabulary. Every non-CSS row below is a RED-before-GREEN task in
its landing PR; until then the guard's protection is still carried by the
unmodified `convencionesDeEstilos.spec.ts` (disposition `CSS`, the safe
starting state for all 21).

| # | Protects | Final disposition | Landing PR |
|---|---|---|---|
| 1 | No `overflow:hidden`/clip (reading gate) + `sr-only` token ban | AMBOS | PR6 |
| 2 | Exactly one `!important display` (`[hidden]`) | AMBOS | PR6 |
| 3 | `.boton` ≥48px touch floor | JSX | PR7 |
| 4 | 32px gap + destructive colour-not-position | JSX | PR7 (variant), final confirm PR13 |
| 5 | 48px floor explicitly absent on table rows | JSX | PR15 |
| 6 | Focus-visible never silently removed (ring-aware judgment, D6) | JSX | PR7 |
| 7 | Exactly 640/1024 breakpoints; rebind/read-back half MOOT | JSX | PR3, MOOT confirmed PR16 |
| 8 | No `font-size<1rem` outside panel — new component-path exemption axis | JSX | PR9 |
| 9 | `valorDeColor` resolver ported to `@theme`/class names | JSX | PR3 (util), PR8 (real coverage) |
| 10 | `matiz` (hue) resolver ported | JSX | PR3, PR8 |
| 11 | `saturacion` resolver + 50% floor ported | JSX | PR3, PR8 |
| 12 | Guards A–D brand-blue contrast assertion | JSX | PR3, PR8 |
| 13 | Estado-chip 1.32:1 + pagination current-page contrast | JSX | PR10 |
| 14 | 4 distinct estado-badge colours + label always present | JSX | PR11 |
| 15 | Sticky paginator armed + opaque background | JSX | PR10 |
| 16 | Narrow-layout `thead` displaced, not clipped | AMBOS | PR6 (compiled), final confirm PR15 |
| 17 | Document-viewer iframe bounded `vh` (legal reading gate) | JSX, dedicated | PR12 |
| 18 | BEM modifier never above base (cascade footgun) | MOOT | PR16 |
| 19 | Signature canvas bounded, controls never covered (`elementFromPoint`) | JSX, dedicated | PR13 |
| 20 | Universal touch-floor scan (`pisoDeToque.ts`) | JSX | PR9 (engine), PR15 (primary target), PR16 (site-wide confirm) |
| 21 | Every `<a>`/`<Link>` gets a real box | JSX | PR8 |

**Component inventory caveat.** Design names 5 atoms, `BarraDeBusqueda`,
`Paginador`, `VisorDeDocumento`, `LienzoDeFirma`, `EscanerDeMac`,
`TablaDeContratos`, `CabeceraDeSesion`, `InsigniaDeEstado`/`estadoDeContrato`
explicitly (13 of 21+10 components/containers). The remaining molecules,
organisms and containers are not individually named in any input artifact —
PR11's apply step MUST confirm the complete list against
`fd -e tsx . apps/web/src/componentes apps/web/src/funcionalidades` before
claiming full coverage, rather than assuming this list is exhaustive.

## Suggested Work Units

| PR | Slice | Contents | Est. lines | Independently proves |
|----|-------|----------|-----------|------------------------|
| PR1 | A1 | Tailwind v4 + shadcn install, `@theme`/`@layer base` (D3, incl. native-control 48px floor), dark-variant deletion, `cn()`+`cva` on `Boton` | 260–320 | The build pipeline compiles, no `.dark` artifact ships, and `Boton` merges classes deterministically |
| PR2 | A2 | `LayoutTecnico` rename, 7 files | 150–250 | No `LayoutTablet` identifier remains; `pnpm typecheck` catches any missed importer |
| PR3 | A3 | Disposition register (21 seeded `CSS`) + validator RED demonstrations; `convencionesDeUtilidades.spec.ts` skeleton + vendor-import guard; `convencionesDeCompilado.compilado.spec.ts` skeleton; colour-resolver utils (guards 9–12); vitest config split | 280–330 | The register catches a deleted guard and a dangling CSS reference; no Radix import can land silently |
| PR4 | A4 | `techoDeDist.ts` + new CI `bundle` job + baseline re-measure (515,412 B) + fail-closed RED tests | 190–230 | A missing/empty `dist/` fails closed, not on a 0-byte pass; the baseline matches the branch point |
| PR5 | A5 | `geometriaHandheld.ts` + fixtures, states S1/S2/S4/S5/S6, CI wiring, fail-closed RED tests | 280–330 | A short run (fewer states than the slice constant) fails closed, not as a silent re-measure |
| PR6 | B | Collision cluster: guards 1/2/16 real compiled-scan assertions + `sr-only` JSX token ban + project's `[hidden]` duplicate deleted | 220–270 | Preflight's `[hidden]` and `.sr-only` cannot silently resurrect the 492px regression |
| PR7 | C1 | `Boton` + `CampoTexto` redesigned + guards 3/4/6 rebuilt | 300–360 | Touch floor, destructive spacing and ring-based focus all hold on converted atoms |
| PR8 | C1b | `Etiqueta`/`MarcaProducto`/`Spinner` redesigned + guards 18/21 + brand-blue contrast (guards 9–12) real coverage | 260–320 | No inline-link footgun; brand blue never resolves under 4.5:1 or to `#008bff` on text |
| PR9 | C2 | `pisoDeToque.ts` guard-20 engine (unit-tested on fixtures) + JSX integration + guard 8's component-path exemption axis rebuild | 300–360 | The touch-floor engine agrees with its CSS predecessor on fixtures; panel/técnico type-scale exemption is path-based, not filename-based |
| PR10 | D1 | `BarraDeBusqueda`/`Paginador` redesigned + guards 12/13/15 | 320–380 | The 1.32:1 estado-chip regression cannot recur; sticky paginator is never inert |
| PR11 | D2 | Remaining non-load-bearing molecules/organisms (see caveat above) + guards 9–11/14 | 320–380 | Badge colour-carries-meaning-alone risk stays closed across the rest of the inventory |
| PR12 | F1 | `VisorDeDocumento` redesigned + guard 17 dedicated verification | 220–280 | The legal reading gate stays explicitly `vh`-bounded, never `auto` |
| PR13 | F2 | `LienzoDeFirma` redesigned + guards 4(final)/19 dedicated verification + S3 handheld driver (6-state constant) | 320–380 | Deshacer/Borrar are never covered by the iframe; S3 is reached and measured for the first time |
| PR14 | F3 | `EscanerDeMac` redesigned + guard 2 final confirmation | 120–160 | `[hidden]` camera containment survives on converted markup |
| PR15 | F4 | `TablaDeContratos` redesigned + guards 5/16/20 final site-wide confirmation | 280–340 | Guard 20's primary target passes; no `sr-only` collision on the table |
| PR16 | F-cleanup + G | BEM sheets deleted (6 files), old `convencionesDeEstilos.spec.ts` deleted, register audited to zero `CSS` entries, final whole-flow handheld pass (6 states, 360–430px) | 200–260 | Success Criteria checklist closes; no hand-authored BEM sheet remains |

| PR | Focused test command | Runtime harness | Rollback boundary |
|----|----------------------|------------------|--------------------|
| PR1 | `pnpm --filter @contratos/web test` | N/A — harness does not exist yet (built PR4/PR5) | `git revert` PR1's branch; nothing downstream depends on it yet |
| PR2 | `pnpm --filter @contratos/web test`, `pnpm typecheck` | N/A — same reason | `git revert` PR2's branch; `pnpm typecheck` immediately re-surfaces any missed importer |
| PR3 | `pnpm --filter @contratos/web test` | N/A — same reason | `git revert` PR3's branch; register and skeleton scanners are additive, nothing else reads them yet |
| PR4 | `pnpm --filter @contratos/web test`, `pnpm --filter @contratos/web size` after `vite build` | **This PR is the harness.** Real `vite build` + `du -sb dist/` in CI | `git revert` PR4's branch; the `bundle` CI job simply stops running |
| PR5 | `pnpm --filter @contratos/web test`, `pnpm --filter @contratos/web handheld` | **This PR is the harness.** Real Puppeteer + `vite preview` over the real `dist/`, intercepted fixtures, no VPS/API | `git revert` PR5's branch; the `bundle` job's handheld step stops running |
| PR6 | `pnpm --filter @contratos/web test:compilado` after `vite build` | `pnpm size && pnpm handheld` (real, from PR4/PR5) | `git revert` PR6's branch — BEM `[hidden]` rule returns; coexistence with Preflight is the accepted interim state |
| PR7 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR7's branch restores `Boton`/`CampoTexto`'s prior BEM design wholesale |
| PR8 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR8's branch restores prior BEM design for these 3 atoms |
| PR9 | `pnpm --filter @contratos/web test` (unit fixtures + JSX integration) | `pnpm size && pnpm handheld` | `git revert` PR9's branch; guard 8/20 protection falls back to the still-live CSS scanner |
| PR10 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR10's branch restores prior BEM `BarraDeBusqueda`/`Paginador` |
| PR11 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR11's branch restores prior BEM design for those components |
| PR12 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR12's branch restores prior `VisorDeDocumento`; legal-evidence review required before merge, not just tests |
| PR13 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` (S3 now included, 6-state constant) | `git revert` PR13's branch restores prior `LienzoDeFirma`; S3 harness drops back to unreachable (constant reverts to 5 with it) |
| PR14 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR14's branch restores prior `EscanerDeMac` |
| PR15 | `pnpm --filter @contratos/web test` | `pnpm size && pnpm handheld` | `git revert` PR15's branch restores prior `TablaDeContratos` |
| PR16 | `pnpm -r test`, `pnpm typecheck`, `pnpm lint` | `pnpm size && pnpm handheld` (full 6-state final pass) | **Not simple** — reverting PR16 alone is safe (restores deleted BEM files), but it is the terminal PR; no PR depends on it |

---

## Phase 1 — PR1: Tailwind + shadcn install, `@theme`, `cn()`

- [x] 1.1 `pnpm --filter @contratos/web add tailwindcss @tailwindcss/vite clsx tailwind-merge class-variance-authority lucide-react`; run `npx shadcn init` to generate `components.json` (aliases pointed at existing Spanish tiers).
- [x] 1.2 Wire `tailwindcss()` into `apps/web/vite.config.ts`'s `plugins` array alongside `react()`/`VitePWA()`; add `@import "tailwindcss"` to the entry stylesheet reachable from `main.tsx`.
- [x] 1.3 RED: `estilos/tema.spec.ts` asserts the compiled `@theme` block exposes all 18 `--color-*` properties from `tokens.css` byte-for-byte, `--spacing-toque: 48px`, `--text-base`/`--text-grande`, `--font-sans`, `--radius-base: 8px`, and only `640px`/`1024px` `@media` preludes. Must fail — `tema.css` does not exist.
- [x] 1.4 GREEN: create `estilos/tema.css` — `@theme` block per D3's mapping table, `--breakpoint-*: initial` reset then the two named tiers, `@layer base` carrying the verbatim rules (`color-scheme: light`, `html/body/#app` height, `:focus-visible`) and the rebound rules (`body`, `h1/h2/h3`, `[role="alert"]`, and **the native-control `input[type="radio"|"checkbox"]` 48px floor** — load-bearing for `FormularioEquipos.tsx:87,97`).
- [x] 1.5 RED: `Boton.spec.tsx` — a `className` prop carrying a conflicting `bg-*` utility resolves to exactly one `bg-*` class in the rendered output, the incoming one. Must fail — `Boton` still concatenates.
- [x] 1.6 GREEN: create `utils/cn.ts` (`clsx` + `tailwind-merge`); convert `Boton.tsx`'s className merge from string concat to `cn()`, and restructure its class list into a `cva` variant map (structural only — visual redesign is PR7).
- [x] 1.7 RED: `package.json`/compiled-CSS scan asserts no `.dark { }` block, no `@custom-variant dark`, and `next-themes` absent from dependencies. Must fail until 1.8 confirms the shadcn scaffold generated no dark artifacts (or 1.8 deletes them).
- [x] 1.8 GREEN: delete any generated `.dark`/`@custom-variant dark` block from `components.json`'s scaffold output; confirm no `next-themes`/`ThemeProvider` dependency was added by `shadcn init`.

## Phase 1B — PR1 close-out

- [x] 1B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`; record results.
- [x] 1B.2 Open PR #1 targeting the tracker branch (draft/no-merge). Evidence: focused test output, rollback boundary from Work Units.

## Phase 2 — PR2: `LayoutTecnico` rename

- [x] 2.1 `git mv` `componentes/plantillas/LayoutTablet.tsx` → `LayoutTecnico.tsx`, `LayoutTablet.spec.tsx` → `LayoutTecnico.spec.tsx`; rename the component/describe-block identifiers inside.
- [x] 2.2 Update every importer: `rutas/rutas.tsx` (4 reference sites), `plantillas/LayoutPanel.tsx` (2 sites), `LayoutPanel.spec.tsx` (1 site), `estilos/organismos.css` (3 comment/selector references), `estilos/panel.css` (1 reference).
- [x] 2.3 `pnpm typecheck` — confirms no importer was missed (this is the safety net the design explicitly relies on).
- [x] 2.4 Grep the whole `apps/web` tree for the literal string `LayoutTablet`; confirm zero remaining occurrences (filename, identifier, or class token).

## Phase 2B — PR2 close-out

- [x] 2B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`; record results.
- [x] 2B.2 Open PR #2 targeting PR #1's branch. Retarget PR #3 to PR #2's branch **before** merging PR #1 (delivery hazard note above).

## Phase 3 — PR3: guard scaffolding (register + JSX/compiled skeletons)

*The disposition register is one of the three "passes by doing nothing" mechanisms. Its RED test must be demonstrated failing against a naive stub, not just against an absent file.*

- [x] 3.1 RED: `estilos/guardias/registro.spec.ts` asserts exactly 21 entries, numbered 1–21 no gaps, each disposition in `{CSS, JSX, AMBOS, MOOT, RESUELTA}` (never blank/`TBD`/`REBUILD`). Must fail — `registro.ts` does not exist.
- [x] 3.2 RED, falsification case: add a fixture entry whose disposition is `JSX` but whose named `it(...)` title is **absent** from its named spec file; assert the register validator fails on it. Run this fixture against a **naive stub validator that always returns valid** first, confirm the fixture case fails to catch the gap (proving the stub is unsafe), then proceed to 3.3.
- [x] 3.3 RED, second falsification case: a `CSS`-dispositioned entry naming a `src/estilos/*.css` file that does not exist; assert the validator fails. Same naive-stub falsification as 3.2.
- [x] 3.4 GREEN: create `estilos/guardias/registro.ts` — 21 entries seeded to `CSS` (the true starting state, nothing has converted), plus the real validator satisfying 3.1–3.3.
- [x] 3.5 RED: `estilos/convencionesDeUtilidades.spec.ts`'s vendor-import guard — a fixture file importing `radix-ui`/`@radix-ui/*` fails the scan. Must fail — scanner does not exist.
- [x] 3.6 GREEN: create `convencionesDeUtilidades.spec.ts` skeleton with the vendor-import guard live (D1), plus guard 7's breakpoint-whitelist scan (`sm:`/`lg:` only) and the ported `valorDeColor`/`matiz`/`saturacion` resolvers (guards 9–11) as exported, fixture-unit-tested functions reading `@theme` class names instead of CSS selectors.
- [x] 3.7 RED then GREEN: guard 12 (Guards A–D brand-blue contrast) — a fixture Tailwind class resolving to `#008bff` on text fails at <4.5:1; implement the assertion using 3.6's resolvers.
- [x] 3.8 Create `estilos/convencionesDeCompilado.compilado.spec.ts` skeleton (empty guard 1/2/16 `describe` blocks, real assertions land in PR6) and `apps/web/vitest.compilado.config.ts`; add the `test:compilado` script; add `src/**/*.compilado.spec.ts` to `vitest.config.ts`'s `exclude`.
- [x] 3.9 Update `registro.ts` entries 7, 9, 10, 11, 12 to `JSX` (mechanism now exists, even though real-component coverage lands in PR8).

## Phase 3B — PR3 close-out

- [x] 3B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`; record results.
- [x] 3B.2 Open PR #3 targeting PR #2's branch.

## Phase 4 — PR4: `dist/` size ceiling (D7)

*Second "passes by doing nothing" mechanism — an absent build measures 0 bytes and trivially satisfies "≤ ceiling." Its RED test must prove it rejects that.*

- [ ] 4.1 RED, falsification: write `scripts/techoDeDist.spec.ts` asserting non-zero exit when `dist/` is missing or empty. Run it first against a **naive stub script that sums whatever exists (0 on a missing dir) and exits 0 if ≤ 665600** — confirm the test fails to catch the stub's false pass. This proves the assertion, not just the implementation, is load-bearing.
- [ ] 4.2 RED: a build whose summed size exceeds 665,600 bytes fails with the measured byte count in its output. Must fail — script does not exist.
- [ ] 4.3 GREEN: create `scripts/techoDeDist.ts` — sums whole `dist/`, fails closed on missing/empty/under-floor-file-count, prints used/ceiling/headroom, satisfies 4.1 and 4.2.
- [ ] 4.4 Add `pnpm --filter @contratos/web size` script.
- [ ] 4.5 RED then GREEN: baseline re-measure — a clean `pnpm build` at this branch point must measure exactly 515,412 B; a mismatch reports "branch point changed before migration start" instead of silently accepting a different number.
- [ ] 4.6 Add the new `bundle` CI job to `.github/workflows/ci.yml`: fresh runner, own `actions/cache@v4` restore + install-on-miss for Puppeteer (independent of the `integration` job's cache), no `needs:`. Step order: `vite build` → `pnpm size` → `pnpm test:compilado` → handheld (added PR5).

## Phase 4B — PR4 close-out

- [ ] 4B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus the new `bundle` job locally (`vite build && pnpm size`); record the measured byte count.
- [ ] 4B.2 Open PR #4 targeting PR #3's branch.

## Phase 5 — PR5: handheld geometry harness (D8, 5 states)

*Third "passes by doing nothing" mechanism — a short run silently re-measures an earlier state. Its RED test must prove it rejects that, not just an empty run.*

- [ ] 5.1 RED, falsification: `scripts/geometriaHandheld.spec.ts` asserts non-zero exit when the number of reached states is below the committed constant (5, pre-slice-F). Run it first against a **naive stub harness that always reports "5 states reached" regardless of what it actually measured** — confirm this RED test alone does not catch that lie (it can't, by construction); then add the companion assertion that per-state control counts must also meet a floor, and confirm *that* assertion does catch a stub reporting 5 states with 0 controls each. This documents, not hides, the limit of state-count alone.
- [ ] 5.2 RED: dead preview server or missing `dist/` fails non-zero, naming the precondition. Must fail — script does not exist.
- [ ] 5.3 RED: zero-measurement run (0 states or 0 controls) fails non-zero, naming the shortfall.
- [ ] 5.4 GREEN: create `scripts/geometriaHandheld.ts` — Puppeteer at `^25.4.0` (matches `apps/api`'s pin), `vite preview` over real `dist/`, `page.setBypassServiceWorker(true)` before first navigation, `page.setRequestInterception(true)` fulfilling `/auth/*`/`/contratos/*` from committed fixtures, sessions seeded via `evaluateOnNewDocument`. Drives S1 (`/login`), S2 (`/` seeded técnico), S4 (`/panel-no-disponible`), S5 (`/panel` seeded oficina), S6 (`/panel/contratos/:id` seeded fixture) at 360/390/430px with `isMobile`/`hasTouch`.
- [ ] 5.5 Assertions per state/width: `scrollWidth === clientWidth`; every interactive element (same tag/prop/class-token heuristics `pisoDeToque.ts` will use, PR9) ≥48px both axes; `CabeceraDeSesion`'s rendered height at 390px stays within a committed single-row budget (regression witness: the measured 104px two-row height).
- [ ] 5.6 Commit the states-reached constant as **5** for this and every PR through PR12; add `handheld` script to `package.json`; add the handheld step to the `bundle` CI job after `pnpm size`.

## Phase 5B — PR5 close-out

- [ ] 5B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld` locally; record the 5-state pass and any técnico-flow phone-width finding.
- [ ] 5B.2 Open PR #5 targeting PR #4's branch.

## Phase 6 — PR6: collision cluster (guards 1/2/16, slice B)

*Highest single-PR legal-adjacent risk — Tailwind's own defaults reproduce two regressions this project already paid to fix once.*

- [ ] 6.1 RED: `convencionesDeCompilado.compilado.spec.ts`'s guard 2 case — Preflight's `[hidden]` rule plus a hypothetical project-authored `!important display` rule both present in compiled output fails, naming both rules. Must fail — no real assertion yet (PR3 left this a skeleton).
- [ ] 6.2 GREEN: delete `base.css`'s `[hidden] { display: none !important }` duplicate (D3); confirm Preflight's own rule is the sole `!important display` rule in compiled output.
- [ ] 6.3 RED: guard 1/16 compiled-scan case — a vendored component's internals applying `.sr-only` to a reading-gate-relevant label fails, naming the `overflow:hidden`/`clip-path` rule found. Must fail — no assertion yet.
- [ ] 6.4 GREEN: implement the compiled-CSS scan for `overflow:hidden|clip`/`clip-path` reachable by shipped markup; keep the narrow-layout `thead` displacement recipe (`panel.css:254-256`/`:303-305`) as a project utility so guard 16's protection survives through the swap.
- [ ] 6.5 RED then GREEN: guard 1's JSX token ban — a first-party component's JSX containing the literal `sr-only` class token fails, independent of whether a build has run; add to `convencionesDeUtilidades.spec.ts`.
- [ ] 6.6 Update `registro.ts` entries 1, 2, 16 to `AMBOS`.

## Phase 6B — PR6 close-out

- [ ] 6B.1 Run `pnpm --filter @contratos/web test:compilado` after `vite build`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 6B.2 Open PR #6 targeting PR #5's branch. Flag explicitly in the PR body: this is the collision cluster proposal risk row 1 names as highest-likelihood.

## Phase 7 — PR7: `Boton` + `CampoTexto` redesign (slice C1, guards 3/4/6)

- [ ] 7.1 RED: `convencionesDeUtilidades.spec.ts`'s guard 3 case — `Boton`'s `cva` variant map resolves every size variant to ≥48px on both axes. Must fail against pre-redesign `Boton` (still BEM-classed at this point, no `cva` size floor to find).
- [ ] 7.2 RED: guard 4 case — the `destructivo` variant differs from default by colour token, not DOM position, and sits with a ≥32px gap from adjacent controls in a fixture composition. Must fail — no `destructivo` variant exists yet.
- [ ] 7.3 RED: guard 6 case — a `focus-visible:ring-*`/`shadow-*` token with non-zero width and ≥3:1 resolved contrast against its adjacent background passes; bare `outline-none` with no ring fails. Must fail — no ring-aware judgment exists yet.
- [ ] 7.4 GREEN: redesign `Boton.tsx`'s and `CampoTexto.tsx`'s markup/variants (composition open per proposal In Scope 4) — `cva` variant map including `destructivo`, focus-visible ring per D6, all satisfying 7.1–7.3.
- [ ] 7.5 Update `registro.ts` entries 3, 4 (variant half), 6 to `JSX`.
- [ ] 7.6 Confirm PR1's `Boton.spec.tsx` `cn()`-merge scenario still passes unmodified.

## Phase 7B — PR7 close-out

- [ ] 7B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 7B.2 User visual review of the redesigned `Boton`/`CampoTexto` — "visibly new" is a judgment this suite cannot assert (Success Criteria).
- [ ] 7B.3 Open PR #7 targeting PR #6's branch.

## Phase 8 — PR8: `Etiqueta`/`MarcaProducto`/`Spinner` redesign (slice C1b, guards 9–12/18/21)

- [ ] 8.1 RED: guard 21 case — a fixture `<a>`/`<Link className="…">` without a block/flex/full-width utility is flagged as an inline box with silently-inert `min-height`. Must fail against pre-redesign markup (still CSS-rule-body scanned).
- [ ] 8.2 GREEN: redesign `Etiqueta.tsx`, `MarcaProducto.tsx`, `Spinner.tsx`; every `<a>`/`<Link>` in scope gets a real box (block/flex/full-width), satisfying 8.1.
- [ ] 8.3 RED then GREEN: brand-presentation's rebuilt contrast guard — `MarcaProducto`'s wordmark text/control usage resolves ≥4.5:1 against `#ffffff` and never equals `#008bff`; the icon's raster `#008bff` fill is confirmed **outside** the guard's reach (D1's "wordmark as live text" decision) rather than exempted by a scoping rule.
- [ ] 8.4 Guard 18 confirmed structurally MOOT for these 3 converted atoms — no `@apply`-based custom class introduced; note in the PR body, register stays `CSS` for entry 18 until PR16's full-codebase confirmation.
- [ ] 8.5 Update `registro.ts` entries 9, 10, 11, 12 real-coverage confirmed on `MarcaProducto`; entry 21 to `JSX`.

## Phase 8B — PR8 close-out

- [ ] 8B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 8B.2 User visual review of the redesigned atoms.
- [ ] 8B.3 Open PR #8 targeting PR #7's branch.

## Phase 9 — PR9: guard 20 engine + guard 8 rebuild (slice C2)

*Guard 8 is real work, not a line item — its filename-based exemption (`panel.css`) ceases to exist; the replacement is a component-path matcher, sized and tested on its own.*

- [ ] 9.1 RED: `estilos/guardias/pisoDeToque.spec.ts` — fixture cases mirroring the CSS engine's table (tag/prop/class-token interactive classification, `*-toque`/`h-N`≥48 sizing, `inline` veto without a flex/block/grid companion, `w-full`/block-display equivalents, `EXENCIONES` carried verbatim with its anti-rot floor). Must fail — module does not exist.
- [ ] 9.2 GREEN: create `estilos/guardias/pisoDeToque.ts` — exported pure functions, satisfying 9.1 on fixtures before any real scan uses them (D5's explicit ordering).
- [ ] 9.3 RED: `convencionesDeUtilidades.spec.ts`'s guard 20 integration — every interactive element in already-converted JSX (atoms from PR7/PR8) resolves ≥48px, using 9.2's functions. Must fail if any converted atom regressed.
- [ ] 9.4 GREEN: wire the integration scan; confirm all PR7/PR8 atoms pass with zero pre-existing violations.
- [ ] 9.5 RED: guard 8 case — a fixture component rendered under a `LayoutPanel`-rooted path (`componentes/**`/`funcionalidades/contratos/**`) is exempted from the ≥1rem floor; the same component rendered under `LayoutTecnico` is **not** exempted. Must fail — no path-based matcher exists (only the retired filename check).
- [ ] 9.6 GREEN: implement the component-path exemption axis (path-pattern matcher, not filename), replacing `panel.css`-name-based logic; add its own regression test proving a técnico-path component with sub-1rem type still fails.
- [ ] 9.7 Update `registro.ts` entries 8, 20 to `JSX`.

## Phase 9B — PR9 close-out

- [ ] 9B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 9B.2 Open PR #9 targeting PR #8's branch.

## Phase 10 — PR10: `BarraDeBusqueda`/`Paginador` redesign (slice D1, guards 12/13/15)

- [ ] 10.1 RED: guard 13 case — a fixture filter chip styled via `data-[state=on]`/`aria-pressed` at <3:1 on/off contrast fails, naming the offending token; this is the exact 1.32:1 defect class. Must fail against pre-redesign markup.
- [ ] 10.2 RED: guard 13's pagination half — the current-page indicator at <3:1 contrast fails.
- [ ] 10.3 RED: guard 15 case — `sticky` present without a `bottom-*` utility (the same silent-no-op shape as CSS `position:sticky` with no `bottom`) fails.
- [ ] 10.4 GREEN: redesign `BarraDeBusqueda.tsx`/`Paginador.tsx`; filter-chip and current-page states resolved ≥3:1 via 3.6/3.7's resolvers (explicitly override shadcn's default `--border` at 1.26:1 where state depends on it, per D-appendix on shadcn defaults); paginator ships `sticky bottom-0` with opaque background.
- [ ] 10.5 Update `registro.ts` entries 12 (real coverage), 13, 15 to `JSX`.

## Phase 10B — PR10 close-out

- [ ] 10B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld` (S5/S6 exercise these components); record results.
- [ ] 10B.2 User visual review of the redesigned search/pagination.
- [ ] 10B.3 Open PR #10 targeting PR #9's branch.

## Phase 11 — PR11: remaining molecules/organisms (slice D2, guards 9–11/14)

*Confirm the component inventory against `fd -e tsx . apps/web/src/componentes apps/web/src/funcionalidades` before starting — see the Guard landing map's inventory caveat.*

- [ ] 11.1 RED: guard 14 case — `InsigniaDeEstado`'s 4 estado colours each resolve to distinct values and the Spanish label stays present in every variant (never colour-only). Must fail against pre-redesign markup.
- [ ] 11.2 GREEN: redesign `InsigniaDeEstado`/`estadoDeContrato.tsx`, keeping its existing `[data-estado=...]` attribute strategy (already compatible per exploration row 14 — "SURVIVES best of all").
- [ ] 11.3 GREEN: redesign the remaining named self-contained molecules (`Toast`, `IndicadorDePaso`, `AvisoDeActualizacion`) and `CabeceraDeSesion`, plus any additional component surfaced by 11.0's inventory confirmation not already covered by PR7/PR8/PR10/PR12–15.
- [ ] 11.4 RED then GREEN: real-coverage confirmation for guards 9–11 (colour resolvers) against every component converted through this PR.
- [ ] 11.5 Update `registro.ts` entry 14 to `JSX`; confirm 9–11 coverage note.

## Phase 11B — PR11 close-out

- [ ] 11B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 11B.2 User visual review.
- [ ] 11B.3 Open PR #11 targeting PR #10's branch.

## Phase 12 — PR12: `VisorDeDocumento` redesign (slice F1, guard 17)

*Highest-stakes single guard in the file — legal reading-gate boundedness. Dedicated verification, not batch treatment.*

- [ ] 12.1 RED: guard 17 case — the converted iframe's height class resolves to an explicit `h-[NNvh]`/bounded value; `auto` or an unbounded `min-height` fails. Must fail against pre-redesign markup (CSS-rule scanned today).
- [ ] 12.2 GREEN: redesign `VisorDeDocumento.tsx`, preserving `puertaDeLectura.ts`'s reading-gate boundedness contract, satisfying 12.1.
- [ ] 12.3 Update `registro.ts` entry 17 to `JSX`.
- [ ] 12.4 Dedicated manual verification pass: confirm the reading gate behaves identically to pre-migration on a real converted render (legal-evidence-adjacent — not covered by the automated scan alone).

## Phase 12B — PR12 close-out

- [ ] 12B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 12B.2 User visual review, with explicit sign-off on the reading-gate manual pass (12.4).
- [ ] 12B.3 Open PR #12 targeting PR #11's branch.

## Phase 13 — PR13: `LienzoDeFirma` redesign + S3 driver (slice F2, guards 4-final/19)

*S3 cannot exist before this PR — it is the second of the two surfaces (`VisorDeDocumento`, `LienzoDeFirma`) it drives to.*

- [ ] 13.1 RED: guard 19 case — `elementFromPoint` at each of Deshacer/Borrar's coordinates hits the control itself, never an overlapping iframe. Must fail against pre-redesign markup.
- [ ] 13.2 RED: guard 4's final confirmation — the 32px gap and destructive colouring hold in `LienzoDeFirma`'s real composition, not just PR7's atom-level variant fixture.
- [ ] 13.3 GREEN: redesign `LienzoDeFirma.tsx`, satisfying 13.1–13.2.
- [ ] 13.4 RED, falsification: extend `geometriaHandheld.ts`'s visit script for S3 (fill `FormularioBorrador`, intercepted `POST /contratos` returns a fixture, tap "Continuar"). First run it against the **existing pre-13.5 script** to confirm S3 is correctly reported as unreached (not silently re-measuring S2) — this is `handheld-readiness`'s explicit drift scenario.
- [ ] 13.5 GREEN: commit the visit script; bump the states-reached constant to **6** (S1, S2, S4, S5, S6, S3); confirm all 6 states measured with `scrollWidth === clientWidth` and ≥48px controls at 360/390/430px.
- [ ] 13.6 Update `registro.ts` entries 4 (final), 19 to `JSX`.

## Phase 13B — PR13 close-out

- [ ] 13B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld` (6-state); record results.
- [ ] 13B.2 User visual review, with explicit sign-off on the signature-canvas manual pass.
- [ ] 13B.3 Open PR #13 targeting PR #12's branch.

## Phase 14 — PR14: `EscanerDeMac` redesign (slice F3, guard 2 final)

- [ ] 14.1 RED: real `[hidden]` containment on the converted `<video hidden>` camera preview — confirms PR6's compiled-scan guard still catches a regression on this specific component. Must fail if `hidden` is dropped or replaced incorrectly during redesign.
- [ ] 14.2 GREEN: redesign `EscanerDeMac.tsx`, preserving the `[hidden]` containment.

## Phase 14B — PR14 close-out

- [ ] 14B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 14B.2 User visual review.
- [ ] 14B.3 Open PR #14 targeting PR #13's branch.

## Phase 15 — PR15: `TablaDeContratos` redesign (slice F4, guards 5/16/20 final)

*Guard 20's primary target — the component the enumerated-list defect (two 24px links) originally slipped through.*

- [ ] 15.1 RED: guard 5 case — table rows/cells explicitly carry **no** ≥48px sizing class (rows must not look interactive, R-3.5). Must fail against pre-redesign markup.
- [ ] 15.2 RED: guard 20's site-wide confirmation on this component — every genuinely interactive element (sort controls, row actions) ≥48px, exempting non-interactive `<tr>` per the carried-over `EXENCIONES` entry.
- [ ] 15.3 RED: guard 16's final confirmation — the narrow-layout `thead` displacement recipe survives on the converted table at ≤390px, no `sr-only` reintroduced.
- [ ] 15.4 GREEN: redesign `TablaDeContratos.tsx`, satisfying 15.1–15.3.
- [ ] 15.5 Update `registro.ts` entries 5, 16 (final), 20 (primary-target confirmed) to `JSX`/`AMBOS` per the landing map.

## Phase 15B — PR15 close-out

- [ ] 15B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint`, plus `pnpm size && pnpm handheld`; record results.
- [ ] 15B.2 User visual review.
- [ ] 15B.3 Open PR #15 targeting PR #14's branch.

## Phase 16 — PR16: BEM deletion, final register audit, whole-flow pass (F-cleanup + G)

- [ ] 16.1 RED then GREEN: `registro.spec.ts` asserts zero entries remain `CSS` (all 21 have migrated to `JSX`/`AMBOS`/`MOOT`/`RESUELTA`) — this must fail if any guard is still only CSS-protected before proceeding to delete the sheets.
- [ ] 16.2 Delete `estilos/{tokens,base,atomos,organismos,panel,index}.css` (6 files, 1665 measured lines) and `estilos/convencionesDeEstilos.spec.ts` (1812 measured lines) — last, per D2.
- [ ] 16.3 Confirm guard 18 is now globally `MOOT` (no `@apply`-based custom class exists anywhere) and guard 7's rebind half is structurally impossible (no inherited `--fuente-base`-style custom property remains); update `registro.ts` entries 7, 18 accordingly.
- [ ] 16.4 `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint` — confirms nothing still imports a deleted stylesheet.
- [ ] 16.5 Run the full 6-state handheld pass (`pnpm handheld`) at 360/390/430px as the final whole-flow verification (proposal's slice G).
- [ ] 16.6 Success Criteria checklist: all 21 dispositions named; `pnpm -r test`/`typecheck`/`lint` green; no `.dark`/`@custom-variant dark`/`next-themes`; técnico flow scrollWidth/48px at 360–430px; every shipped colour ≥4.5:1 text / ≥3:1 non-text; no `LayoutTablet` identifier; `dist/` ≤665,600 B; `apps/api`/`prisma/plantillas/*.html`/signature logic byte-identical (confirm via `git diff --stat` against those paths across the whole chain).

## Phase 16B — PR16 close-out

- [ ] 16B.1 Run the full `pnpm -r test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1–PR16 diff; record results.
- [ ] 16B.2 Final user sign-off: "visibly new" confirmed across every redesigned screen (cumulative — not just this PR's diff).
- [ ] 16B.3 Open PR #16 targeting PR #15's branch. Retarget nothing further — this is the terminal child PR.
- [ ] 16B.4 Merge the chain into the tracker PR (retargeting is a no-op at this point — PR16 already targets the last child); merge the tracker into `master` last.

## Deferred / recorded, not resolved here

- **Proposal Q3 (client demo date).** Not applied to this chain order: PR3–PR5's infra must front-load per D7/D8's "measured from its first commit" requirement. If a demo needs earlier visual proof, PR7 (position 7 of 16) is the earliest redesigned, visually-demonstrable slice — reordering ahead of PR3–PR5 would mean shipping component redesigns before the ceiling/handheld harnesses exist to catch their regressions, which this plan does not recommend.
- **Guard 8's panel replacement type-scale values.** A per-screen redesign decision made organically inside PR10/PR11/PR15 wherever office-panel components land, not a blocking pre-decision.
