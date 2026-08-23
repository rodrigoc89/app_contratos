```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6c7d17c2ce0d618b1f1d13f77ff5086990a5573f8b947ada9165dbda7cabf966
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 13/13
test_command: pnpm -r test
test_exit_code: 0
test_output_hash: sha256:af9aa49f15933ac124d0cd348beb80272c45c086ffad05adc115b433d02a6332
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:6b024533b1053d949efae9d3f2d2e2b751b544a0fafd442029ea988faef7b848
```

## Verification Report

**Change**: brand-identity
**Version**: N/A (no `openspec/specs/` predecessor — first version of both capabilities)
**Mode**: Strict TDD
**Branch**: `feat/brand-identity` @ `dfa534c` — "fix(sdd): make the specs say what the code does, and guard D1's consequence", on top of `0ca3187` (merged PR1/#93, PR2/#94, PR3/#95). This is a re-verify pass; only the fix commit is new relative to the prior FAIL report (Engram #635).

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 41 |
| Tasks complete | 41 |
| Tasks incomplete | 0 |

Unchanged from the prior pass — `dfa534c` touches only spec artifacts and one guard test, no `tasks.md` edits.

### Build & Tests Execution

**Typecheck**: PASS — `pnpm typecheck` (`pnpm -r typecheck`), exit 0, all 4 packages (`deploy`, `packages/esquemas`, `apps/api`, `apps/web`) report `Done`, zero errors.

**Lint**: PASS — `pnpm lint` (`eslint . --max-warnings 0`), exit 0, no output.

**Tests**: PASS — `pnpm -r test`, exit 0.
```text
packages/esquemas  Test Files  5 passed (5)   Tests 125 passed (125)
deploy              Test Files  9 passed (9)   Tests  63 passed (63)
apps/api            Test Files 58 passed (58)  Tests 784 passed (784)
apps/web            Test Files 77 passed (77)  Tests 601 passed (601)
TOTAL               149 files passed           1573 tests passed, 0 failing
```
Matches the stated post-fix baseline (1573 passing, `apps/web` at 601) exactly — the +1 test over the prior pass's 1572/600 is Guard D (`convencionesDeEstilos.spec.ts`), the only test added by `dfa534c`.

**Coverage**: Not available — no coverage tool configured in this monorepo.

### Independent verification performed this session

1. **Guard D comment-stripping is correct and necessary.** `tokens.css:21-27` documents `--color-marca-azul` in a `/** ... */` block that itself names `#008bff` in prose ("The icons' raw `#008bff` measures 3.42:1..."). Guard D's `sinComentarios` helper (`css.replaceAll(/\/\*[\s\S]*?\*\//g, "")`) strips exactly that block before scanning; read the regex and the source side by side — non-greedy, single-pass, matches CSS's actual (non-nestable) comment grammar. Without it Guard D would false-positive on its own rationale, which is precisely what the commit message says the first version did.
2. **Falsification reproduced independently.** Appended `.prueba-falsificacion { color: #008bff; }` to `apps/web/src/estilos/atomos.css` and ran `pnpm --filter @contratos/web exec vitest run src/estilos/convencionesDeEstilos.spec.ts`: 71 passed, 2 failed — both Guard B (`estilos/atomos.css paints text in the brand-blue family below 4.5:1: [".prueba-falsificacion (3.42:1)"]`) and Guard D (`[...] expected [ 'estilos/atomos.css' ] to deeply equal []`) went red, matching the orchestrator's claim exactly. Reverted with `git checkout -- apps/web/src/estilos/atomos.css`; `git status` confirmed clean before and after.
3. **Guard D defeat-vector probe (regex-level, no additional file edits).** Tested `/#008bff/i` — the exact pattern Guard D uses — against three vectors with a throwaway `node -e` snippet (no repo files touched):
   - Different casing (`#008BFF`, `#008Bff`): **not a defeat** — the `i` flag matches regardless of case.
   - Inside a string literal (e.g. `content: "#008bff"`): **not a defeat** — the regex is a raw substring match with no CSS-syntax awareness, so it fires inside quotes exactly as it would outside them.
   - Written as `rgb(0, 139, 255)` or `hsl(207, 100%, 50%)` (both exactly equal `#008bff`): **is a defeat** — the pattern only matches the literal hex string, so an equivalent colour in a different CSS notation passes both Guard D and Guards B/C unnoticed. See WARNING 3 below; this is not new to Guard D — `valorDeColor()` (used by Guards A/B/C) only resolves `color-mix()`, `var()`, and literal `#hex`, so the same notations already evaded the pre-existing guards.

### Spec Compliance Matrix — `product-identity`

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Manifest name and description | manifest name/description asserted | `configuracionPwa.spec.ts:65-73` | ✅ COMPLIANT |
| PWA chrome colours | splash/chrome colours asserted | `configuracionPwa.spec.ts:75-82` | ✅ COMPLIANT |
| HTML head identity | static head tags are present and correct | `indiceHtml.spec.ts:29-46` | ✅ COMPLIANT — see detail below |
| Per-route document title | login route sets its title | `TituloDeDocumento.spec.tsx:52-56` | ✅ COMPLIANT |
| Per-route document title | distinct routes carry distinct titles | `TituloDeDocumento.spec.tsx:58-70` + `PaginaDetalleContrato.spec.tsx:134-139` | ✅ COMPLIANT |
| PWA icon identity | referenced icon files exist on disk | `iconos.spec.ts:38-47` (`it.each`, 3 icons) | ✅ COMPLIANT |
| PWA icon identity | visual fidelity verified manually | (no automated test — by spec's own design) | ✅ MANUALLY-VERIFIED — unchanged since the prior pass, files untouched by `dfa534c` |
| Change-scope boundary | legal templates and font stack untouched | (no test — manual diff, by spec's own design) | ✅ MANUALLY-VERIFIED — unchanged since the prior pass |

**HTML head identity, detail**: `spec.md:40-55` now states a MUST NOT for `apple-mobile-web-app-title`/`apple-touch-icon`, citing `DESIGN.md:297,304` and the `vite.config.ts` no-op-comment precedent. `index.html:1-23` matches exactly — no such tags, `<title>`, favicon `<link>`, and `theme-color` meta all present, plus a comment at lines 10-17 explaining the omission for the same reason the spec gives. `indiceHtml.spec.ts` covers 3 of the amended scenario's 4 AND-clauses (title, favicon link, theme-color) with passing tests; the 4th ("no `apple-mobile-web-app-title` or `apple-touch-icon` tag is declared") is verified here by direct file inspection only (independently confirmed by reading `index.html` byte-for-byte), matching the file's own docstring ("Deliberately does NOT assert... An always-passing 'is absent' assertion would prove nothing"). Counted as COMPLIANT here, consistent with how this same spec file already treats its other two by-design-manual scenarios (icon visual fidelity, change-scope boundary) — but this one differs structurally: those two are each their OWN dedicated, explicitly-labeled manual scenario, while this untested clause is folded into a scenario whose other three clauses ARE test-covered. That inconsistency is real and worth fixing for clarity, even though nothing here contradicts the spec or the code — see SUGGESTION 1.

### Spec Compliance Matrix — `brand-presentation`

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Session header wordmark | wordmark renders next to existing controls | `CabeceraDeSesion.spec.tsx:49-55` | ✅ COMPLIANT |
| Login screen wordmark | wordmark precedes the heading | `PaginaLogin.spec.tsx:263-278` | ✅ COMPLIANT |
| Brand-blue contrast rule | a new contrast guard exists and passes | `convencionesDeEstilos.spec.ts:1006-1023,1054-1063` (Guards A/B/C vs real CSS) | ✅ COMPLIANT |
| Brand-blue contrast rule | a regression is caught | `convencionesDeEstilos.spec.ts:979-989` (synthetic `#008bff` rule) | ✅ COMPLIANT |
| Brand-blue contrast rule | the raw brand blue never reaches a stylesheet at all (amended) | `convencionesDeEstilos.spec.ts:1025-1052` (Guard D) | ✅ COMPLIANT |

**Compliance summary**: 13/13 scenarios compliant (10 fully test-covered + 1 mostly-test-covered-plus-inspection [HTML head identity, see detail above] + 2 manually-verified-by-design), 0 FAILING, 0 UNTESTED. Up from the prior pass's 11/13 (1 FAILING, 1 UNTESTED).

### CRITICAL findings from the prior pass — resolution status

**CRITICAL 1 (spec demanded a tag the code omits) — RESOLVED.** `spec.md:47-55` now states the MUST NOT and its reasoning; `index.html` and `indiceHtml.spec.ts` were not touched by `dfa534c` and already matched this position (confirmed independently — see matrix above). Spec and shipped code now agree. Residual: the amended scenario bundles one untested-by-design clause with three tested ones, unlike this same spec file's own precedent for that situation elsewhere (see SUGGESTION 1) — a structural/coverage-tracking imperfection, not a reopened contradiction.

**CRITICAL 2 (scenario described a mechanism the guard does not implement) — RESOLVED.** `spec.md:69-81` now states the real reason (D1 ships the wordmark as live text, so `#008bff` exists only in raster icons) instead of the false "scopes to text/control selectors" claim. Guard D (`convencionesDeEstilos.spec.ts:1025-1052`) enforces it, passes on the real shipped stylesheets, comment-stripping was verified correct (finding 1 above), and the falsification claim was independently reproduced (finding 2 above). New, narrower finding surfaced while checking this fix: the guard family (D and its pre-existing siblings B/C) can be evaded by a non-hex colour notation — see WARNING 3, not a reopening of CRITICAL 2, since the original scenario only ever claimed hex-string absence and neither the old nor new wording promises anything about `rgb()`/`hsl()`.

### Findings

**CRITICAL**: None.

**WARNING**:
1. **Task 2.4's triangulation is still weaker than "an observed guard failure."** Unchanged since the prior pass — `dfa534c` did not touch `iconos.spec.ts`. The committed permanent case (`iconos.spec.ts:57-63`) is:
   ```ts
   const dimensionesReales = dimensionesPng(pngFalso);
   expect(dimensionesReales).toEqual({ ancho: 100, alto: 100 });
   expect(formatoDeTamano(dimensionesReales)).not.toBe("192x192");
   ```
   This proves `dimensionesPng`/`formatoDeTamano` compute correctly on synthetic IHDR bytes, not that the real `it.each` guard (`existsSync` + `toBe(icono.sizes)`) actually fails end-to-end on a wrong-size file — `apply-progress` records that a stronger form (temporary `.toBe("192x192")`, a real captured `AssertionError`) was run once and removed before commit. Not a tautology, not CRITICAL, but `tasks.md` 2.4's "proving the guard actually fails" claim still overstates what ships. Confirmed by direct re-read this session, line-for-line identical to the prior pass.
2. **PR3's actual diff (397 authored lines) still exceeds its own forecast (~260-320).** Unchanged since the prior pass — informational, already flagged in `tasks.md`'s own "PR3 Medium / overall High" 400-line budget risk, and the slice remains a single, independently revertible, autonomously-scoped unit. `dfa534c` itself (this session's subject) is a separate, small, 234-line fix commit outside PR3's own review-workload accounting.
3. **New: the whole D6 guard family (A/B/C/D) trusts hex notation only.** `valorDeColor()` (feeds Guards A/B/C) resolves only `color-mix()`, `var()` references, and literal `#hex`; Guard D's own pattern is a literal `/#008bff/i` substring match. A rule written as `color: rgb(0, 139, 255)` or `color: hsl(207, 100%, 50%)` — both exactly `#008bff` — would pass all four guards silently (verified by regex-level probe, not by editing shipped CSS — see finding 3 above). This is not new to Guard D and not introduced by `dfa534c`; it is an existing limitation of `valorDeColor()` that Guard D inherits by using the same text-scanning approach. Not blocking: nothing in this change's shipped CSS uses non-hex colour notation (confirmed — `rg` found zero `rgb(`/`hsl(` declarations touching brand blue), and neither the original nor the amended spec scenario claims coverage of non-hex notation. Worth a follow-up ticket if this guard family is expected to be adversarial-proof rather than convention-proof.

**SUGGESTION**:
1. **Split the "static head tags are present and correct" scenario.** Its 4th AND-clause (no `apple-mobile-web-app-title`/`apple-touch-icon`) is deliberately untested, but it is folded into a scenario whose other 3 clauses ARE tested — unlike the spec's own precedent for this exact situation, used twice elsewhere in the same file ("visual fidelity is verified manually, not by an automated test" and the change-scope boundary scenario, each its own explicitly-labeled scenario). Splitting the absence clause into its own scenario, named the same way, would make the PARTIAL result above disappear into a clean COMPLIANT + a clean MANUALLY-VERIFIED-BY-DESIGN, and keep the spec file internally consistent about how it marks intentionally-untested clauses.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Manifest `name`/`description`/colours | ✅ Implemented | `configuracionPwa.ts:36-43` — unchanged |
| Per-route titles (D3) | ✅ Implemented | unchanged |
| Favicon + head tags | ✅ Implemented, spec now matches | `index.html:1-23`, `spec.md:40-55` |
| PWA icons (192/512/512-maskable) | ✅ Implemented | unchanged |
| IHDR dimension guard | ✅ Implemented, ⚠️ triangulation weaker than claimed | unchanged, see WARNING 1 |
| `MarcaProducto` atom (D1/D2) | ✅ Implemented | unchanged |
| Header/login wiring | ✅ Implemented | unchanged |
| Brand-blue token + guards (D6) | ✅ Implemented, now includes Guard D | `tokens.css:28`, `convencionesDeEstilos.spec.ts:791-844,1025-1052` |
| Header wrap CSS (D7) | ✅ Implemented | unchanged |
| Change-scope boundary | ✅ Held | unchanged — `dfa534c` does not touch `plantillas/` or `--familia-tipografica` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 — wordmark is live text, not an image | ✅ Yes | Now also the stated rationale for Guard D's exemption scenario |
| D2-D7 | ✅ Yes | Unchanged since the prior pass, not touched by `dfa534c` |
| Tasks Note 2 — iOS surfaces dropped | ✅ Yes, now mirrored into `spec.md` | Was the prior pass's CRITICAL 1; resolved |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress` (#629) carries the RED/GREEN table for PR1-3; `dfa534c` is a spec-artifact fix with no apply-progress entry of its own (expected — it is a `sdd-verify`-driven remediation, not a task-driven apply cycle) |
| All tasks have tests | ✅ | Unchanged |
| RED confirmed (tests exist) | ✅ | Guard D's RED state (failing on `tokens.css`'s own comment) is documented in the commit message and independently plausible from the code (the un-stripped-comment first version would indeed match) |
| GREEN confirmed (tests pass) | ✅ | 1573/1573 passing on this exact commit, 0 failing |
| Triangulation adequate | ✅ for Guard D (real, independently-reproduced falsification); ⚠️ still weak for icon-guard 2.4 | See WARNING 1 |
| Safety Net for modified files | ✅ | Guard D added to an existing, passing describe block; falsification reproduced against a clean tree and reverted |

**TDD Compliance**: 5/6 checks fully passed, 1 partial (carried over from the prior pass, unrelated to this fix).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (source scan) | +1 this fix (Guard D) | `convencionesDeEstilos.spec.ts` | Vitest |
| **Total this change (cumulative PR1-3 + fix)** | **+14 tests** vs the pre-change baseline (587→601 in `apps/web`) | | |

### Assertion Quality
Guard D's own assertion (`expect(conAzulCrudo, "...").toEqual([])`) is a real, specific, behavioral check against actual shipped files — not a tautology, not a ghost loop (the array can be non-empty, and was, during the reproduced falsification). No new trivial assertions found.

**Assertion quality**: 0 CRITICAL, 0 new WARNING (WARNING 1 above is carried over from the prior pass, not new).

### Quality Metrics
**Linter**: ✅ No errors (`eslint . --max-warnings 0`, exit 0)
**Type Checker**: ✅ No errors (`pnpm -r typecheck`, exit 0, 4/4 packages)

### Verdict
**PASS WITH WARNINGS** — both prior CRITICAL findings are resolved: `product-identity`'s "HTML head identity" spec now matches shipped `index.html` exactly (MUST NOT `apple-mobile-web-app-title`/`apple-touch-icon`, both absent, reasoning cited), and `brand-presentation`'s exemption scenario now states the real mechanism (D1 live text) and is enforced by a new, correct, independently-falsified Guard D. All 41 tasks complete, 1573/1573 tests pass (up from 1572, the +1 is Guard D), typecheck and lint clean, `git status` clean after this session's own falsification/probe experiments. 13/13 scenarios compliant (up from 11/13) — the 13th ("static head tags") carries one deliberately-untested clause verified here by direct inspection rather than by a passing test, a structural inconsistency with this same file's own precedent for that situation, not a spec/code contradiction (SUGGESTION 1). Two WARNINGs carry forward unchanged from the prior pass (icon-guard 2.4 triangulation strength; PR3's 397-vs-260-320 line forecast overage) — neither was touched by this fix, and dropping them here would have hidden real, still-open observations. One new WARNING surfaced while probing Guard D: the whole D6 guard family trusts hex notation only and would not catch `rgb()`/`hsl()` equivalents of the brand blue — not blocking (nothing shipped uses that notation, and no spec scenario claims that coverage), but worth tracking. Ready for `sdd-archive`.
