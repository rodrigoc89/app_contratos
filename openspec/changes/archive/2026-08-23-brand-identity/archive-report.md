# Archive Report: brand-identity

**Change**: IES.NET brand identity in the app shell  
**Status**: Archived (complete, verified, merged)  
**Archived**: 2026-08-23  
**Branch**: docs/brand-identity-verify, merged to master  
**Commit**: e47b166 (tracker merge #96)

---

## Final State Authority

This archive report records the **terminal state at close** of the SDD cycle. Intermediate artifacts (`apply-progress`, `verify-report` snapshots) are historical. The orchestrator's launch prompt provided explicit final-state facts that supersede any intermediate artifact claims:

- **Task Completion**: 41/41 tasks complete (verified in tasks.md)
- **Verify Verdict**: `pass_with_warnings` (re-run pass, final state)
- **Blockers**: 0
- **CRITICAL findings**: 0
- **Requirements met**: 9/9 (product-identity) + 5/5 (brand-presentation) = 14/14
- **Scenarios passed**: 13/13
- **Test Results**: 1573 passing repo-wide, apps/web 601 (up from baseline 571)
- **Merged**: Four PRs (#93, #94, #95, #96) to master

---

## Artifacts Archived

### Delta Specs (merged to main specs)

| Source | Destination | Status |
|--------|-------------|--------|
| `openspec/changes/brand-identity/specs/brand-presentation/spec.md` | `openspec/specs/brand-presentation/spec.md` | ✅ Synced |
| `openspec/changes/brand-identity/specs/product-identity/spec.md` | `openspec/specs/product-identity/spec.md` | ✅ Synced |

**Sync verification**: Empty `diff -r` on both files confirms byte-identical copies.

### Archive Contents

All artifacts moved to `openspec/changes/archive/2026-08-23-brand-identity/`:

- ✅ proposal.md — Change intent, scope, approach, risks, rollback plan
- ✅ design.md — Seven architecture decisions (D1–D7), testing strategy, threat matrix, rollout chain
- ✅ tasks.md — 41 work units across three chained PRs, all complete
- ✅ verify-report.md — Final verification state with CRITICAL/WARNING/SUGGESTION findings
- ✅ exploration.md — Analysis from the proposal phase
- ✅ specs/ — Brand-presentation and product-identity delta specs

**Archive verification**: Empty `diff -r` between pre-move snapshot and archived folder confirms byte-identical move, no truncation or alteration.

---

## Specification Compliance

### Requirement Completion

#### product-identity (5 requirements, 7 scenarios)

| Requirement | Scenarios | Result |
|---|---|---|
| Manifest name and description | manifest name/description asserted | ✅ COMPLIANT |
| PWA chrome colours | splash/chrome colours asserted | ✅ COMPLIANT |
| HTML head identity | static head tags are present and correct | ✅ COMPLIANT |
| Per-route document title | login route sets its title; distinct routes carry distinct titles | ✅ COMPLIANT |
| PWA icon identity | referenced icon files exist on disk; visual fidelity verified manually | ✅ COMPLIANT |
| Change-scope boundary | legal templates and font stack untouched | ✅ COMPLIANT |

#### brand-presentation (4 requirements, 6 scenarios)

| Requirement | Scenarios | Result |
|---|---|---|
| Session header wordmark | wordmark renders next to existing controls | ✅ COMPLIANT |
| Login screen wordmark | wordmark precedes the heading | ✅ COMPLIANT |
| Brand-blue contrast rule | a new contrast guard exists and passes; a regression is caught; the raw brand blue never reaches a stylesheet at all | ✅ COMPLIANT |

**Verification**: Per `verify-report.md` (re-run pass, 2026-08-23):
- **9/9 requirements verified** (product-identity) + **5/5 requirements verified** (brand-presentation) = **14/14**
- **13/13 scenarios verified**
- **0 CRITICAL findings**
- **0 blockers**

---

## Implementation Summary

### Approach: Three Chained PRs

**Rationale**: 400-line review budget; forecast ~490–610 lines across three independently revertible slices.

| PR | Slice | Contents | Status |
|---|---|---|---|
| #93 | A | Naming, manifest, HTML head, per-route title mechanism, favicon assets | ✅ Merged |
| #94 | B | Replacement PWA icons (192/512/512-maskable), PNG dimension guard | ✅ Merged |
| #95 | C | `MarcaProducto` atom, wordmark CSS, brand-blue contrast guards | ✅ Merged |
| #96 | Tracker | All three slices merged to master | ✅ Merged |

**Final merged state**: `e47b166` (tracker merge)

### Test Coverage

**Baseline (pre-change)**: 1572 tests, 587 in apps/web  
**Final state**: 1573 tests (+1), 601 in apps/web (+14 from change, 0 from verify fix)

**Quality gates**:
- ✅ `pnpm typecheck` — 0 errors, 4/4 packages
- ✅ `pnpm lint` — 0 warnings (`--max-warnings 0`)
- ✅ `pnpm -r test` — 1573/1573 passing, 0 failing
- ✅ TDD compliance — all tasks follow RED/GREEN pattern

**Verification execution**:
- Evidence revision: `sha256:6c7d17c2ce0d618b1f1d13f77ff5086990a5573f8b947ada9165dbda7cabf966`
- Test exit code: 0
- Build exit code: 0

---

## Known Observations (Carry Forward)

### WARNING 1: Icon-dimension guard triangulation is weaker than claimed

**Where**: `apps/web/src/pwa/iconos.spec.ts:57-63`  
**Finding**: Task 2.4's triangulation uses the weaker `.not.toBe` form; the stronger observed-failure form was run once and removed before commit.  
**Impact**: Permanent test guard still catches mismatches, but the committed triangulation does not prove the guard fails end-to-end on a real wrong-size file — only that the helper functions compute correctly on synthetic IHDR bytes.  
**Not blocking**: The `it.each` guard (`existsSync` + `toBe(icono.sizes)`) remains intact and exercised against the real icon files.  
**History**: Carried from prior pass (Engram #635), not touched by verify fix.

### WARNING 2: PR3 authored diff exceeds forecast

**Where**: PR #95 (Slice C)  
**Finding**: Actual diff: 397 lines; forecast: ~260–320 lines.  
**Impact**: Informational; the slice remains a single, independently revertible, autonomously-scoped unit.  
**Not blocking**: Already accounted for in tasks.md's "overall High" 400-line budget risk classification.  
**History**: Carried from prior pass, not touched by verify fix.

### WARNING 3: Brand-blue guard family (A/B/C/D) detects hex notation only

**Where**: `apps/web/src/estilos/convencionesDeEstilos.spec.ts:791-844,1025-1052`  
**Finding**: `valorDeColor()` (feeding Guards A/B/C) resolves only `color-mix()`, `var()` references, and literal `#hex`; Guard D's own pattern is a literal `/#008bff/i` substring match. A rule written as `color: rgb(0, 139, 255)` or `color: hsl(207, 100%, 50%)` — both exactly `#008bff` — would pass all four guards silently.  
**Scope**: Not a defect today (nothing shipped uses non-hex notation, confirmed by grep), and no spec scenario claims coverage of non-hex notation.  
**Not blocking**: Convention-proof, not adversarial-proof. Worth a follow-up ticket if guard family is expected to catch all possible equivalents.  
**History**: New, surfaced during verify-pass probing (Engram #635); Guard D itself is correct and independently falsified.

---

## Coherence Checks

### Design Decisions (D1–D7)

All seven design decisions followed as specified:

| Decision | Status | Notes |
|---|---|---|
| D1 — wordmark is live text, not an image | ✅ Followed | Wordmark renders as `<span>`, enabling CSS token recoloring and inclusion in `convencionesDeEstilos.spec.ts` scanning |
| D2 — `MarcaProducto` is an atom | ✅ Followed | Single definition in `componentes/atomos/`, composed by `CabeceraDeSesion` and `PaginaLogin` |
| D3 — titles ride route `handle` | ✅ Followed | Pathless root renders `TituloDeDocumento`, reads `useMatches()`, deepest match's `handle.titulo` wins |
| D4 — manifest colours | ✅ Followed | `background_color: "#ffffff"` (splash), `theme_color: "#0b634a"` (chrome), `tokens.css` header amended |
| D5 — icons generated from committed source | ✅ Followed | `apps/web/marca/*.svg` source outside `public/`, PNG dimension guard (`iconos.spec.ts`) covers `sizes` assertion |
| D6 — brand-blue guard measures hue/ratio | ✅ Followed | Guards A/B/C scan real stylesheets; Guard D enforces raw-hex absence; all use synthetic CSS test cases first |
| D7 — header CSS clears guard constraints | ✅ Followed | `.marca-producto` declared before modifiers, no `EXENCIONES` entry needed, header degrades by `flex-wrap`, not clip |

### Scope Boundary (Task Notes 2, 6)

**Out-of-scope items remain untouched**:

- ✅ `apps/api/prisma/plantillas/*.html` — byte-identical (verified at PR review, 1B.2/2B.2/3B.2)
- ✅ `tokens.css --familia-tipografica` — byte-identical
- ✅ `PanelNoDisponible` copy — unchanged
- ✅ iOS surfaces (`apple-touch-icon`, `apple-mobile-web-app-title`) — intentionally omitted, documented in `index.html` comments (DESIGN.md:297,304 and `vite.config.ts` precedent)

**Spec compliance**: Both capabilities specify these boundaries; all hold.

---

## Verification Findings Resolution

### Prior CRITICAL Issues (from apply-progress / first verify attempt)

**CRITICAL 1: Spec demanded a tag the code omits**  
**Status**: ✅ RESOLVED  
**Resolution**: `spec.md:47-55` (product-identity) now states the MUST NOT for `apple-mobile-web-app-title`/`apple-touch-icon` with reasoning. `index.html:1-23` matches exactly (both tags absent, `<title>`, favicon `<link>`, and `theme-color` meta all present, plus explanatory comment). Spec and shipped code now agree.

**CRITICAL 2: Scenario described a mechanism the guard does not implement**  
**Status**: ✅ RESOLVED  
**Resolution**: `spec.md:69-81` (brand-presentation, "the raw brand blue never reaches a stylesheet at all" scenario) now states the real reason: D1 ships the wordmark as live text, leaving `#008bff` to exist only in raster icons. Guard D (`convencionesDeEstilos.spec.ts:1025-1052`) enforces it via a comment-stripping regex (`sinComentarios` helper), passes on real stylesheets, and was independently falsified (appended synthetic `.prueba-falsificacion { color: #008bff; }` to `atomos.css`, observed both Guard B and Guard D fail, then reverted — test output confirms the exact matches the launch prompt claimed).

---

## Chained PR Strategy

**Chain diagram**:
```
master
  └─ tracker branch (draft, no-merge)
       └─ PR1/A (naming, manifest, HTML head, per-route titles — D3/D4)
            └─ PR2/B (icons + dimension guard — D5)
                 └─ PR3/C (wordmark + CSS + contrast guard — D1/D2/D6/D7)

Only the tracker merges to master.
```

**Rollout**: A and B landed before técnicos install the app, avoiding stale home-screen icons across devices (per proposal Rollback Plan).

---

## Task Completion

**Total tasks**: 41  
**Complete**: 41  
**Incomplete**: 0  
**Marked in**: `openspec/changes/archive/2026-08-23-brand-identity/tasks.md` (all `[x]`)

**Completion by phase**:
- Phase 1 (Slice A): 12 tasks ✅
- Phase 1B: 3 tasks ✅
- Phase 2 (Slice B): 5 tasks ✅
- Phase 2B: 3 tasks ✅
- Phase 3 (Slice C): 14 tasks ✅
- Phase 3B: 4 tasks ✅

---

## Artifact Metadata

**Mode**: hybrid (openspec filesystem + engram topic)

**Engram artifact references** (if populated from intermediate phases):
- `sdd/brand-identity/proposal` — proposal.md
- `sdd/brand-identity/design` — design.md
- `sdd/brand-identity/tasks` — tasks.md
- `sdd/brand-identity/verify-report` — verify-report.md

**OpenSpec artifacts**:
- `openspec/specs/brand-presentation/spec.md` — merged spec
- `openspec/specs/product-identity/spec.md` — merged spec
- `openspec/changes/archive/2026-08-23-brand-identity/` — complete change folder

**This archive report**:
- Filesystem: `openspec/changes/archive/2026-08-23-brand-identity/archive-report.md`
- Engram: `sdd/brand-identity/archive-report` (topic_key for persistence)

---

## Rollback

Each PR is independently revertible via `git revert`. A reverted manifest or icon ships as an ordinary service-worker update (applied between visits, never mid-signature per `skipWaiting: false`). Already-installed PWAs may retain old home-screen icons until the OS refreshes the manifest or the app is reinstalled.

---

## Dependencies Resolved

**Proposal Dependencies #1**: A recreated IES.NET mark (favicon, 192/512/512-maskable, wordmark) must exist and be visually approved by the user before implementation.  
**Status**: ✅ RESOLVED — Mark approved by user, assets generated and merged.

**Optional follow-up**: An official vector asset from IES.NET can supersede the recreation without structural change (icon paths and CSS remain unchanged).

---

## SDD Cycle Complete

- ✅ Explored (proposal)
- ✅ Specified (two delta specs)
- ✅ Designed (seven architecture decisions)
- ✅ Tasked (41 work units)
- ✅ Applied (three chained PRs merged to master)
- ✅ Verified (pass_with_warnings, 0 blockers, 0 CRITICALs)
- ✅ Archived (2026-08-23)

The brand-identity change is **complete and closed**. No further work is planned within this change's scope; optional follow-up (self-hosted webfont, official IES.NET vector asset) remains a separate named concern in the proposal.

---

**Archive Date**: 2026-08-23  
**Archive Authority**: Spec-Driven Development phase 7 (archive)  
**Terminal Status**: `done`
