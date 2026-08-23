```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4fed1419bd67b7773a45279524dd63b12183dd2d9017714a3ea719bd63d9d359
verdict: fail
blockers: 2
critical_findings: 2
requirements: 7/9
scenarios: 11/13
test_command: pnpm -r test
test_exit_code: 0
test_output_hash: sha256:037ed44d05f2456f1eec4d715a0ebf7d69f07e5789b11a23b4c1a7bc9c76728b
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:dbea081af1672b4efdd8f92d922307290ec3f562e33cc5466828814ccb7824a2
```

## Verification Report

**Change**: brand-identity
**Version**: N/A (no `openspec/specs/` predecessor — first version of both capabilities)
**Mode**: Strict TDD
**Branch**: `feat/brand-identity` @ `0ca3187` (three PRs merged: #93, #94, #95; tracker PR #96 open against `master`, 1917+/-63, 37 files)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 41 |
| Tasks complete | 41 |
| Tasks incomplete | 0 |

Confirmed independently: `rg -c "^\s*- \[x\]" tasks.md` → 41, `^\s*- \[ \]` → 0.

### Build & Tests Execution

**Typecheck**: PASS — `pnpm typecheck` (`pnpm -r typecheck`), exit 0, all 4 packages (`deploy`, `packages/esquemas`, `apps/api`, `apps/web`) report `Done`, zero errors.

**Lint**: PASS — `pnpm lint` (`eslint . --max-warnings 0`), exit 0, no output.

**Tests**: PASS — `pnpm -r test`, exit 0.
```text
packages/esquemas  Test Files  5 passed (5)   Tests 125 passed (125)
deploy              Test Files  9 passed (9)   Tests  63 passed (63)
apps/api            Test Files 58 passed (58)  Tests 784 passed (784)
apps/web            Test Files 77 passed (77)  Tests 600 passed (600)
TOTAL               149 files passed           1572 tests passed, 0 failing
```
Matches the stated last-known-good baseline (1572 passing, `apps/web` at 600) exactly — no regressions, no growth beyond this change's own +14 tests (587→600 in `apps/web` across PR2's +1 and PR3's +13).

**Coverage**: Not available — no coverage tool configured in this monorepo (`vitest` runs without `--coverage`); not flagged as a failure per skill instructions.

### Spec Compliance Matrix — `product-identity`

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Manifest name and description | manifest name/description asserted | `configuracionPwa.spec.ts:65-73` | ✅ COMPLIANT |
| PWA chrome colours | splash/chrome colours asserted | `configuracionPwa.spec.ts:75-82` | ✅ COMPLIANT |
| HTML head identity | static head tags present and correct | `indiceHtml.spec.ts:28-47` | ❌ FAILING (as literally specified) — see CRITICAL 1 |
| Per-route document title | login route sets its title | `TituloDeDocumento.spec.tsx:52-56` | ✅ COMPLIANT |
| Per-route document title | distinct routes carry distinct titles | `TituloDeDocumento.spec.tsx:58-70` + `PaginaDetalleContrato.spec.tsx:134-139` | ✅ COMPLIANT |
| PWA icon identity | referenced icon files exist on disk | `iconos.spec.ts:38-47` (`it.each`, 3 icons) | ✅ COMPLIANT |
| PWA icon identity | visual fidelity verified manually | (no automated test — by spec's own design) | ✅ MANUALLY-VERIFIED — independently corroborated this session, see below |
| Change-scope boundary | legal templates and font stack untouched | (no test — manual diff, by spec's own design) | ✅ MANUALLY-VERIFIED — independently re-run this session |

### Spec Compliance Matrix — `brand-presentation`

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Session header wordmark | wordmark renders next to existing controls | `CabeceraDeSesion.spec.tsx:49-55` | ✅ COMPLIANT |
| Login screen wordmark | wordmark precedes the heading | `PaginaLogin.spec.tsx:263-278` | ✅ COMPLIANT |
| Brand-blue contrast rule | a new contrast guard exists and passes | `convencionesDeEstilos.spec.ts:999-1035` (Guards A/B/C vs real CSS) | ✅ COMPLIANT |
| Brand-blue contrast rule | a regression is caught | `convencionesDeEstilos.spec.ts:971-990` (synthetic `#008bff` rule) | ✅ COMPLIANT |
| Brand-blue contrast rule | the icon/wordmark mark is exempt | (none found) | ❌ UNTESTED — see CRITICAL 2 |

**Compliance summary**: 11/13 scenarios fully compliant (incl. 2 scenarios whose spec design itself declares them manually-verified, independently corroborated this session), 1 FAILING (as literally specified), 1 UNTESTED. Per this project's strict verify rule ("a spec scenario is compliant only when a covering test passed at runtime"), both are CRITICAL, not WARNING — see below.

### Independent verification performed this session (beyond re-reading claims)

The orchestrator's brief flagged three items not to take on trust. All three were independently checked with objective tooling, not by re-reading the apply-progress narrative:

1. **Task 1.6 deviation (`rutas.spec.tsx` untouched)**
   - `git diff master -- apps/web/src/rutas/rutas.spec.tsx` → empty output. Byte-identical to `master`, confirmed.
   - `pnpm exec vitest run src/rutas/rutas.spec.tsx` (apps/web) → **15/15 passing**, matching the claimed count.
   - The sibling file `apps/web/src/rutas/TituloDeDocumento.spec.tsx` exists, mounts the real `rutas` tree via `createMemoryRouter`, and asserts the title requirement's two scenarios — both pass. The deviation is real, documented, and does not weaken the route-guard regression net.

2. **Task 2.5 (maskable icon safe zone / visual fidelity)** — decoded `apps/web/public/icons/icon-512-maskable.png` with Pillow (`python3`/PIL 12.1.1, available on this machine) and computed the white-glyph bounding box directly from pixel data (thresholds 240/250/255 all agree):
   - Measured bbox: **x 151–357, y 214–305** (px, 0-indexed). Orchestrator's claimed bbox (152–356, 214–304) sits inside this by ≤1px — consistent with a slightly different white-pixel threshold, not a discrepancy.
   - Safe-zone bound for 512px at 80%: **51.2–460.8** (10%–90% of 512). The measured glyph is well inside it on both axes. **Confirmed.**
   - Additionally sampled the field colour at all three icon files' corners: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` all read exactly **`#008bff`** — matches the `PWA icon identity` requirement's stated blue field, independently of any human visual review.

3. **Task 3B.3 (header wrap/touch-floor/contrast at 360/640/1024px)** — this machine has a real, cached Chromium (`~/.cache/puppeteer/chrome/linux-151.0.7922.47`, brought in by `apps/api`'s `puppeteer@25.4.0` dependency, used to generate the icon PNGs — see `apps/web/marca/ies-monograma.svg`'s regeneration note). I built a static fixture reproducing the *exact shipped* markup (`CabeceraDeSesion` → `MarcaProducto` → `Boton`) and loaded the *real* `apps/web/src/estilos/index.css` cascade (`tokens.css` → `base.css` → `atomos.css` → `organismos.css` → `panel.css`) through headless Chromium, then measured real computed layout at 360/640/1024px:

   | Width | Boton height | Rows (by distinct `top`) | Horizontal scroll | Clipped |
   |---|---|---|---|---|
   | 360px | 48px | 2 (marca on row 1; usuario+boton on row 2) | none (`scrollWidth == 360`) | no |
   | 640px | 48px | 1 (all three share a row) | none (`scrollWidth == 640`) | no |
   | 1024px | 48px | 1 | none (`scrollWidth == 1024`) | no |

   `--tamano-toque-minimo: 48px` (`tokens.css:78`) matches the measured button height exactly at all three widths. Computed style also confirmed `.marca-producto__empresa`'s `color` renders as `rgb(0, 118, 217)` = `#0076d9` (the D6 token), and `.marca-producto`'s `font-size` renders as `22px` (≥ 1rem floor). **This independently confirms the orchestrator's claim** — wraps to two rows only at the narrowest width, 48px floor holds everywhere, no clipping, no horizontal scroll. This is a stronger, reproducible form of the same check (exact numeric layout data, not a visual read), built from the real shipped CSS/markup rather than a full app boot (auth/router/React were not exercised — only the CSS cascade and the exact DOM shape `CabeceraDeSesion` renders).

### Findings

**CRITICAL**:
1. **`apple-mobile-web-app-title` is missing from `index.html`, and `spec.md`'s "HTML head identity" scenario still requires it verbatim** (`specs/product-identity/spec.md:44,54`: `AND <meta name="apple-mobile-web-app-title" content="Contratos"> is present`). The implementation deliberately omits it — `tasks.md` Note 2 records a settled orchestrator decision (Android-Chromium-only fleet, DESIGN.md:297,304) overriding this scenario, and `index.html:10-17` carries an explanatory comment; `indiceHtml.spec.ts:14-18` explicitly documents why it does **not** assert the tag. This is a real, deliberate, and reasoned product decision — not a bug — but `specs/product-identity/spec.md` itself was never amended to match it, so the spec artifact and the shipped code disagree on a MUST requirement, and no test proves the full scenario as written. Per this project's own verify rule, a scenario with no passing covering test for one of its AND-clauses is FAILING, not a warning. **Required before archive**: amend `spec.md`'s "HTML head identity" scenario (drop the `apple-mobile-web-app-title` clause, or explicitly scope it to a future iOS fleet) so the archived spec matches what was actually built and approved.
2. **The `brand-presentation` "icon and wordmark mark are exempt" scenario has no covering test.** It is true *by construction* — the D6 guards (`violacionesGuardiaDeMarca`/`violacionesGuardiaDeTokenDeMarca`) only scan `apps/web/src/estilos/*.css`, and `#008bff` appears in zero production `.css` files (confirmed via `rg -ni "008bff" apps/web/src -g'*.css'` → only a comment, `tokens.css:23`); the literal colour lives only in `favicon.svg`/`marca/ies-monograma.svg`, which the guard never reads. But no test asserts this scoping decision, so a future refactor that widened the guard's file glob to include SVGs would have no regression net to catch it, and the scenario has zero covering test today. **Required before archive**: add a one-line assertion (e.g. a synthetic SVG-shaped fixture, or an explicit "guard only ever receives `.css` content" test), or explicitly downgrade the scenario in `spec.md` to a documented-by-construction note if a test is judged unnecessary.

**WARNING**:
1. **Task 2.4's triangulation is weaker than "an observed guard failure."** The committed permanent case (`iconos.spec.ts:57-63`) is:
   ```ts
   const dimensionesReales = dimensionesPng(pngFalso);
   expect(dimensionesReales).toEqual({ ancho: 100, alto: 100 });
   expect(formatoDeTamano(dimensionesReales)).not.toBe("192x192");
   ```
   This exercises `dimensionesPng`/`formatoDeTamano` correctly on synthetic IHDR bytes and proves their *output* differs from an arbitrary string — real, but weaker than proving the actual `it.each` guard (existsSync + `toBe(icono.sizes)`) fails end-to-end on a wrong-size *file*. `apply-progress` itself says the stronger form — a temporary `.toBe("192x192")` case against the same fixture, run once to capture a real `AssertionError`, then reverted — existed and was removed before commit. What ships is the `.not.toBe` (parser-correctness) form, not the stronger observed-failure form. Not a tautology, not CRITICAL, but the triangulation claim in `tasks.md` 2.4 ("proving the guard actually fails") slightly overstates what the committed test demonstrates.
2. **PR3's actual diff (397 authored lines, PR2 tip → PR3 tip) exceeded its own forecast (~260–320)**, already flagged by `apply-progress` and consistent with the tasks-doc's own "PR3 Medium" / "overall High" 400-line budget risk. Informational — the slice is still a single, independently revertible, autonomously-scoped unit; nothing outside `apps/web` is touched.

**SUGGESTION**: None beyond the above.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Manifest `name`/`description`/colours | ✅ Implemented | `configuracionPwa.ts:36-43` |
| Per-route titles (D3) | ✅ Implemented | `tituloDeDocumento.ts`, `TituloDeDocumento.tsx`, `rutas.tsx:35-100`, `PaginaDetalleContrato.tsx` effect |
| Favicon + head tags | ✅ Implemented (minus `apple-mobile-web-app-title`, deliberate) | `index.html:1-23` |
| PWA icons (192/512/512-maskable) | ✅ Implemented, dimensions and field colour independently confirmed | `apps/web/public/icons/*.png` |
| IHDR dimension guard | ✅ Implemented, ⚠️ triangulation weaker than claimed | `iconoPng.ts`, `iconos.spec.ts` |
| `MarcaProducto` atom (D1/D2) | ✅ Implemented | `componentes/atomos/MarcaProducto.tsx` |
| Header/login wiring | ✅ Implemented | `CabeceraDeSesion.tsx:33`, `PaginaLogin.tsx:92` |
| Brand-blue token + guards (D6) | ✅ Implemented | `tokens.css:28`, `convencionesDeEstilos.spec.ts:711-844` |
| Header wrap CSS (D7) | ✅ Implemented, independently confirmed in real Chromium | `organismos.css:381-401` |
| Change-scope boundary | ✅ Held | `git diff master --stat -- apps/api/prisma/plantillas/` empty; `--familia-tipografica` line has zero diff |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 — wordmark is live text, not an image | ✅ Yes | `MarcaProducto.tsx`, no `<img>`/SVG |
| D2 — atom composed by header + login, never `<h1>`, never a link | ✅ Yes | Confirmed by `MarcaProducto.spec.tsx`, `PaginaLogin.spec.tsx`'s single-heading re-check |
| D3 — titles via route `handle` + `useMatches` | ✅ Yes | `rutas.tsx`, `TituloDeDocumento.tsx` |
| D4 — white splash / green chrome split, `tokens.css` header amended | ✅ Yes | `configuracionPwa.ts`, `tokens.css` comment (git-log confirms slice A commit) |
| D5 — icons generated from a committed, unshipped SVG source + IHDR guard | ✅ Yes | `apps/web/marca/ies-monograma.svg` outside `public/`; `iconos.spec.ts` |
| D6 — hue/saturation-scoped guard, never an enumerated blue list | ✅ Yes | `matiz`/`saturacion`/`esFamiliaDeMarca` |
| D7 — CSS clears existing convention guards (touch floor, BEM order, breakpoints, no clipping) | ✅ Yes | Independently confirmed via real Chromium layout (no `overflow: hidden`, `flex-wrap` degrade) |
| Tasks Note 2 — iOS surfaces dropped | ⚠️ Followed, but not mirrored into `spec.md` | See CRITICAL 1 |
| Tasks Note 4 — favicon gated on mark approval | ✅ Yes | Landed in PR1 after approval, per commit history |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress` (#629) carries a full RED/GREEN/TRIANGULATE/REFACTOR table for PR3; PR1/PR2 condensed but present in prior revisions |
| All tasks have tests | ✅ | Every RED/GREEN task pair in `tasks.md` maps to an existing spec file |
| RED confirmed (tests exist) | ✅ | All referenced test files exist and were read this session |
| GREEN confirmed (tests pass) | ✅ | 1572/1572 passing on this exact commit, 0 failing |
| Triangulation adequate | ⚠️ | One instance (icon-guard 2.4) triangulates the parser, not the guard's own failure path — see WARNING 1 |
| Safety Net for modified files | ✅ | `apply-progress` records pre-edit baselines (e.g. 82/82 before PR3) |

**TDD Compliance**: 5/6 checks fully passed, 1 partial (triangulation).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure) | ~11 | `tituloDeDocumento.spec.ts`, `iconos.spec.ts` (parser proof), `convencionesDeEstilos.spec.ts` (matiz/saturacion, D6 synthetic) | Vitest |
| Component | ~6 | `MarcaProducto.spec.tsx`, `CabeceraDeSesion.spec.tsx` (new case), `PaginaLogin.spec.tsx` (new case) | Testing Library |
| Integration | ~5 | `TituloDeDocumento.spec.tsx`, `PaginaDetalleContrato.spec.tsx` (new case), `indiceHtml.spec.ts` | Testing Library + `createMemoryRouter` |
| Manual (spec-designed) | 2 scenarios | icon visual fidelity, change-scope diff | Human review (independently corroborated this session via pixel/diff tooling) |
| **Total this change** | **+14 tests** (587→600 in `apps/web` net across PR2+PR3, plus PR1's contribution already in the 587 baseline) | | |

### Assertion Quality
No tautologies, ghost loops, or assertion-free tests found across the reviewed files (`MarcaProducto.spec.tsx`, `CabeceraDeSesion.spec.tsx`, `PaginaLogin.spec.tsx`, `PaginaDetalleContrato.spec.tsx`, `configuracionPwa.spec.ts`, `indiceHtml.spec.ts`, `tituloDeDocumento.spec.ts`, `TituloDeDocumento.spec.tsx`, `convencionesDeEstilos.spec.ts` D6 additions, `iconos.spec.ts`). One WARNING already covered above (2.4's `.not.toBe` triangulation strength).

**Assertion quality**: 0 CRITICAL, 1 WARNING (already listed as WARNING 1, formerly numbered 3 before CRITICAL promotion above).

### Quality Metrics
**Linter**: ✅ No errors (`eslint . --max-warnings 0`, exit 0)
**Type Checker**: ✅ No errors (`pnpm -r typecheck`, exit 0, 4/4 packages)

### Verdict
**FAIL** — all 41 tasks are complete, all 1572 tests pass, typecheck and lint are clean, and 11 of 13 spec scenarios are genuinely, verifiably compliant (including the two manually-verified scenarios, independently corroborated this session via pixel measurement and real headless-Chromium layout). But 2 scenarios are CRITICAL under this project's own strict rule ("a spec scenario is compliant only when a covering test passed at runtime"): `product-identity`'s "HTML head identity" scenario is FAILING as literally written (`apple-mobile-web-app-title` was deliberately dropped by a documented, reasoned decision, but `spec.md` was never amended to match), and `brand-presentation`'s "icon and wordmark mark are exempt" scenario is UNTESTED (true by construction, but asserted by nothing). Neither reflects a functional defect in the shipped app — both are process gaps between the spec artifact and an already-approved implementation decision. Recommended remediation is narrow and fast: amend `spec.md`'s HTML-head scenario to match the settled iOS-drop decision (or scope it explicitly), and add one covering assertion for the exemption scenario (or document it as satisfied by construction in `spec.md` itself). Once either resolved, re-run `sdd-verify`; nothing else in this change needs rework. Also carried forward as WARNINGs (non-blocking): the IHDR guard's permanent triangulation (task 2.4) is weaker than "an observed guard failure," and PR3 exceeded its own line forecast (397 vs ~260–320, informational only).
