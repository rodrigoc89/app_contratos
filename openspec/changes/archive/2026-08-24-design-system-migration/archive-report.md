# Archive Report — design-system-migration

**Change**: design-system-migration  
**Archived**: 2026-08-24  
**Branch**: feat/design-system-migration @ 1c5d394  
**Archive Path**: `openspec/changes/archive/2026-08-24-design-system-migration/`

## Executive Summary

The 20-PR design-system-migration chain completed successfully with PASS WITH WARNINGS verdict. The change migrated the styling substrate from hand-authored BEM sheets to Tailwind v4 + shadcn/ui, removed all CSS files except `tema.css` (single stylesheet entry), and delivered a 21-entry disposition register with zero CSS-dispositioned entries (all `JSX`/`AMBOS`/`MOOT`). The three verification warnings were stale tracker checkboxes (documentation drift) and a missing apply-progress record for PR19 (evidence exists elsewhere); no functional defects or test regressions were found.

## Verification Status

**Verdict**: PASS WITH WARNINGS (per obs #712, reconciled)  
**Verify Date**: 2026-08-24

### Test Battery (PR19 gate + re-run, identical)
| Command | Result |
|---------|--------|
| `pnpm --filter @contratos/web test` | **720/720 passed** (84 files) |
| `pnpm typecheck` | **exit 0** (all packages clean) |
| `pnpm lint` | **exit 0** |
| `pnpm test:compilado` | **9/9 passed** |
| `pnpm size` | **PASS** — 555,441 B / 665,600 B (107.58 KiB headroom) |
| `pnpm handheld` | **PASS** — 6/6 states at 360/390/430px |

### Chain Integrity
- **Merge bases verified**: PR17a→PR17b, PR17b→PR18, PR18→PR19 all confirmed exact
- **API/schema untouched**: `git diff --stat master...HEAD -- apps/api prisma` empty
- **Final deliverables**: 20/20 draft PRs — tracker #99 ← #98 ← #100…#118 (PR19)

### End State
- **Zero hand-authored BEM sheets**: all six CSS files deleted + `convencionesDeEstilos.spec.ts` cleaned
- **Single stylesheet entry**: `tema.css` (Tailwind v4 `@import`, `@theme` block, `@layer base` with native radio/checkbox sizing)
- **Disposition register**: 21 entries — 3 AMBOS + 17 JSX + 1 MOOT, zero CSS (enforced by `registro.spec.ts`)

## Artifact Merges Performed

### Brand Presentation Spec
- **Action**: MODIFIED existing requirement
- **Details**: "Brand-blue contrast rule" mechanism updated from CSS-selector scan to `@theme` token + Tailwind class-name resolution in JSX/`cva`, reflecting the removal of hand-authored BEM sheets

### Design System Foundation Spec
- **Action**: CREATED new spec
- **Details**: Tailwind v4 build pipeline, `@theme` token layer + two-breakpoint whitelist, `cn()` class merging, single-theme policy, `dist/` size ceiling (665,600 B)

### Handheld Readiness Spec
- **Action**: CREATED new spec
- **Details**: Técnico flow geometry requirements — no horizontal overflow at 360/390/430px, ≥48px touch targets, handheld harness fail-closed design

### Styling Guards Spec
- **Action**: CREATED new spec
- **Details**: 21-entry disposition register (CSS/JSX/AMBOS/MOOT/RESUELTA), guard ownership mapping, compiled-output scan for collision cluster (guards 1/2/16), ported guard 20 (touch floor), legal-evidence guards 17/19

## Verification Findings

### Warnings Reconciled (per FINAL-STATE FACTS)
1. **Tracker bookkeeping gap** (Phase 12 checkboxes 12.1–12.4/12B.1/12B.3 unchecked despite verified-complete work)
   - Source: obs #712 WARNING, verified genuine in commit 78cddde (ancestor of chain HEAD)
   - Status: Documented as stale checkboxes; work fully verified complete by `gh pr view 110`
   - Reconciliation: Recorded in verify-report as documentation-drift only, not a functional gap

2. **Tracker bookkeeping gap** (PR18 checkbox 18B.3 unchecked despite verified-complete work)
   - Source: obs #712 WARNING
   - Status: PR #117 confirmed open (`gh pr view 117`), exactly matching 18B.3's description
   - Reconciliation: Recorded as artifact-documentation drift only

3. **Canonical apply-progress artifact incomplete** (no coverage for PR19)
   - Source: obs #712 WARNING, artifact-completeness gap
   - Status: PR19 evidence exists in separate Engram memories (obs #710, #711); all runtime evidence independently re-confirmed live (720/720, compilado 9/9, size/handheld PASS)
   - Reconciliation: Record-keeping/artifact-hygiene gap, not a functional or test regression; extended via PR19 addendum (obs #713)

**CRITICAL issues**: none  
**Final disposition**: All warnings documented and reconciled per FINAL-STATE FACTS; safe to archive.

## Open User-Owned Items at Close

These items are intentionally recorded as pending and are user-owned (not implementation tasks):
- Visual reviews: 10B.2, 11B.2, 12B.2 (with reading-gate sign-off), 13B.2, 14B.2, 15B.2, 16B.2, 17B.2, 17b.6, 18B.2
- Final sign-offs: 19B.2 (cumulative "visibly new" confirmation), 19B.4 (chain merge into tracker, then to master)
- Deferred product finding: Toast-over-submit placement decision (user decision pending, recorded in tracker)

## Accepted Deviations (Verified Present)

1. **PR17 split into 17a/17b**: 721 changed lines vs. 300–360 estimate; disclosed in tracker's Phase 17b preamble
2. **PR19 ledger cap raised to 4200**: deletion-dominated diff (4019 changed lines); per obs #711
3. **Zero-BEM whole-tree scan retired by design in PR19**: confirmed via `convencionesDeUtilidades.spec.ts` (no active `clasesBemDeclaradas`/`clasesBemEnArchivo` block)
4. **Toast placement deferred to user**: verbatim in tracker's "Deferred / recorded, not resolved here" section
5. **Tasks.md stale on chain branches**: tracker-only maintenance by design; confirmed consistent across PR18/PR19 apply-progress disclosures

## Task Completion Gate

**Status**: PASS WITH APPROVED OPEN ITEMS  
**Implementation tasks**: All checked (`✓`)  
**User-owned pending items**: 12 unchecked (`[ ]`) — all documented as intentionally open user visual reviews and final merge steps

Per FINAL-STATE FACTS, these pending items are approved for archival as user-owned, recorded in the tracker, and do not constitute implementation gaps.

## Engram Artifact References

**Observations retrieved and recorded**:
- obs #712 — `sdd/design-system-migration/verify-report` (PASS WITH WARNINGS verdict, detailed battery and findings)
- obs #672 — `sdd/design-system-migration/apply-progress` (PR1–PR18 coverage, stale by design before PR19)
- obs #713 — `sdd/design-system-migration/apply-progress — PR19 addendum` (extends canonical topic_key with PR19 batch evidence)

## Final State Summary

| Metric | Value |
|--------|-------|
| Total chained PRs | 20/20 draft (delivery hazard: children must be retargeted via `gh api PATCH` before merging parents) |
| Test coverage | 720/720 + 9/9 compilado = 729 passing |
| Type/lint checks | 0 errors |
| Bundle size | 555,441 B / 665,600 B (107.58 KiB headroom, 6.64% margin) |
| Handheld states | 6/6 at 360/390/430px (S1/S2/S4/S5/S6 + S3 with real Puppeteer) |
| Spec domains | 4 (brand-presentation modified; design-system-foundation, handheld-readiness, styling-guards created) |
| Disposition register | 21 entries — 3 AMBOS, 17 JSX, 1 MOOT, 0 CSS |
| Backend/schema impact | Zero (API, plantillas, signature logic byte-identical across chain) |

## Change Cycle Complete

**Phases completed**:
1. ✅ Exploration → Proposal → Spec → Design → Tasks
2. ✅ Apply (20-PR feature-branch chain)
3. ✅ Verify (PASS WITH WARNINGS, all reconciled)
4. ✅ Archive (this report)

The design-system-migration change is fully archived. Future work resumes from the tracker branch `feat/design-system-migration` with `feat/dsm-pr19-bem-deletion-final-audit` as the chain HEAD.

---

**Archive Date**: 2026-08-24  
**Archived by**: sdd-archive phase executor  
**Project**: app_contratos
