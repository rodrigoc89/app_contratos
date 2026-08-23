# Tasks: IES.NET brand identity in the app shell

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 (A) ~170-200, PR2 (B) ~60-90, PR3 (C) ~260-320 — total ~490-610 |
| 400-line budget risk | PR1 Low, PR2 Low, PR3 Medium — overall **High** |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (Slice A) → PR2 (Slice B) → PR3 (Slice C) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (pre-cached by the orchestrator, same pattern as `production-deployment`; PR1 targets the tracker branch, PR2 targets PR1's branch, PR3 targets PR2's branch, only the tracker merges to `master`) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Why "Decision needed" is Yes even though the chain strategy is already fixed.** `feature-branch-chain` was pre-cached, so no chain-strategy question is needed. `delivery_strategy` for this session is `ask-on-risk`, and the forecast is High — the orchestrator still confirms with the user before `sdd-apply` starts, per the guard rule's literal mapping (`ask-on-risk` → `Yes`), not because the slicing itself is undecided.

## Notes — read before Phase 1

1. **Per-route titles follow the orchestrator's settled table** (`·` separator, `Inicio`/`Listado`/dynamic `Contrato {número}` labels), which supersedes design.md D3's illustrative table (em-dash separator, `Nuevo contrato`/`Detalle de contrato` labels). `spec.md`'s own scenarios already use `·`, so this is not a spec deviation — only design.md's diagram/example text differs and is non-binding.
2. **iOS surfaces dropped**, by settled decision: no `apple-touch-icon.png`, no `apple-mobile-web-app-title`. This overrides spec.md's "HTML head identity" scenario, which assumes `apple-mobile-web-app-title`. Recorded via a comment in `index.html`, not a guard test asserting the absence of something nobody was adding — `vite.config.ts`'s removed-`optimizeDeps.exclude` comment is the precedent: "a no-op carrying an explanation of why it is essential is worse than nothing."
3. **`/panel/contratos/:id`'s dynamic `Contrato {número}` title is a small, scoped extension** beyond D3's static-`handle` mechanism. The contract number is loaded via `usarContrato` (react-query, `PaginaDetalleContrato.tsx:29`), not available in a static route `handle` at match time. One additional call site (`PaginaDetalleContrato.tsx`'s own effect), not the six-call-site pattern D3 explicitly rejected.
4. **Favicon / mark-approval tension.** Proposal's Dependencies section blocks the favicon (like the icons) on the recreated-mark approval; design.md's Rollout table places favicon assets structurally in Slice A. Resolution: Slice A's naming/manifest/title tasks are mark-independent and proceed regardless; the favicon file-creation sub-task (1.7) is explicitly gated on approval and may land as a fast-follow amendment to PR1's branch if the mark is not ready when the rest of Slice A is done.
5. **`tokens.css` is touched twice**, matching design's own Rollout split: the D4 header-comment amendment ships in Slice A (with `background_color`); the new `--color-marca-azul` token ships in Slice C, where it is actually consumed.
6. **Design.md's two "Open questions" are closed by orchestrator directive**: no iPad/`apple-touch-icon` (Chromium-on-Android fleet, DESIGN.md:297,304); route-title wording is the settled table above.
7. **Threat matrix: N/A** per design.md ("no shell command, subprocess, VCS/PR automation... exists in this change") — no threat-matrix RED tasks below.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Naming, manifest, HTML head, per-route `document.title` mechanism (D3, D4) | PR1 | `pnpm --filter @contratos/web test src/pwa/configuracionPwa.spec.ts src/pwa/indiceHtml.spec.ts src/rutas/tituloDeDocumento.spec.ts src/rutas/rutas.spec.tsx src/funcionalidades/contratos/contenedores/PaginaDetalleContrato.spec.tsx` | Manual: `pnpm --filter @contratos/web build && pnpm --filter @contratos/web preview`, confirm the tab title per route and the favicon glyph at 16px in a real Chromium tab | `git revert` PR1's branch; nothing outside `apps/web` touched, no DB/API involved |
| 2 | Replacement PWA icons + PNG-dimension guard (D5) | PR2 | `pnpm --filter @contratos/web test src/pwa/iconos.spec.ts src/pwa/configuracionPwa.spec.ts` | Manual (also satisfies spec's "visual fidelity" scenario): `vite preview`, add-to-home-screen / inspect the three PNGs directly, confirm blue-field/white-"IES" monogram and the maskable 80% safe zone | `git revert` PR2's branch; an already-installed PWA may keep its old icon until the OS refreshes the manifest — same caveat proposal already states |
| 3 | `MarcaProducto` atom, header + login wiring, brand-blue contrast guards (D1, D2, D6, D7) | PR3 | `pnpm --filter @contratos/web test src/estilos/convencionesDeEstilos.spec.ts src/componentes/atomos/MarcaProducto.spec.tsx src/funcionalidades/auth/contenedores/CabeceraDeSesion.spec.tsx src/funcionalidades/auth/contenedores/PaginaLogin.spec.tsx` | Manual: real browser at 640px and 1024px (tokens.css breakpoints), confirm `.cabecera-sesion` wraps instead of clipping and rendered contrast reads correctly (jsdom checks text, not pixels) | `git revert` PR3's branch; header/login fall back to their pre-change markup, no data model involved |

## Chain diagram

```
master
  └─ tracker branch (draft, no-merge)
       └─ PR1 (A: naming, manifest, HTML head, per-route titles — D3/D4)
            └─ PR2 (B: icons + dimension guard — D5)
                 └─ PR3 (C: wordmark + CSS + contrast guard — D1/D2/D6/D7)

Only the tracker merges to master.
```

---

## Phase 1 — PR1: naming, manifest, HTML head, per-route titles (D3, D4)

- [x] 1.1 RED: `apps/web/src/pwa/configuracionPwa.spec.ts` — new cases: `manifest.name === "IES.NET Contratos"`; `manifest.description` contains `"IES.NET"` and is non-empty; `manifest.background_color === "#ffffff"`; `manifest.theme_color === "#0b634a"`. Must fail — current `name` is `"Contratos — Comodato"`, `description` never mentions IES.NET, `background_color` is `"#0b634a"`.
- [x] 1.2 GREEN: modify `apps/web/src/pwa/configuracionPwa.ts` — `name: "IES.NET Contratos"`, new `description`, `background_color: "#ffffff"`; `theme_color` and `short_name` unchanged. Confirm the two existing icon-size assertions (lines 46-56) still pass unmodified.
- [x] 1.3 Amend `apps/web/src/estilos/tokens.css:1-9` header comment (no test — design D4: "the review does" enforce this): stop tying the palette to "the brand colour already declared in `pwa/configuracionPwa.ts`'s manifest"; state the splash-vs-chrome split explicitly (white splash, green interior).
- [x] 1.4 RED: create `apps/web/src/rutas/tituloDeDocumento.spec.ts` (pure, no React/DOM) — three cases: deepest match's string `handle.titulo` wins over a shallower one; no match declares `titulo` → returns bare `NOMBRE_APP`; a malformed `handle` (non-object, or `titulo` not a string) is skipped, not thrown on. Must fail — module does not exist.
- [x] 1.5 GREEN: create `apps/web/src/rutas/tituloDeDocumento.ts` — exports `NOMBRE_APP = "IES.NET Contratos"`, `conSufijo(etiqueta: string): string` (`` `${etiqueta} · ${NOMBRE_APP}` ``), `tituloDeDocumento(manejadores: ReadonlyArray<unknown>): string`, with a type guard narrowing `handle: unknown`.
- [x] 1.6 RED **[desviación: implementado en `apps/web/src/rutas/TituloDeDocumento.spec.tsx`, no en `rutas.spec.tsx`]** — the orchestrator's hard constraint forbids modifying `rutas.spec.tsx` at all, so the same route tree is mounted in a new sibling spec. `git diff` on `rutas.spec.tsx` is empty; its 15 tests still pass. Original text: `apps/web/src/rutas/rutas.spec.tsx` — **new** `describe` block (existing `describe("route guards", ...)` and `describe("client routes never collide with API paths", ...)` blocks stay untouched): mounting `/login` sets `document.title === "Ingresar · IES.NET Contratos"`; mounting two distinct routes yields titles that both end in `" · IES.NET Contratos"` and differ. Must fail — no title mechanism exists yet.
- [x] 1.7 GREEN: modify `apps/web/src/rutas/rutas.tsx` — wrap the existing two top-level entries in a new pathless root `{ element: <TituloDeDocumento />, children: [...] }`; add `handle: { titulo: "Ingresar" }` (`/login`), `"Inicio"` (`/`), `"Listado"` (`/panel`), `"Detalle de contrato"` (`/panel/contratos/:id`, loading-state placeholder — see 1.10); no `handle` on `/panel-no-disponible` (falls back to bare `NOMBRE_APP`, D3/D10). Create `apps/web/src/rutas/TituloDeDocumento.tsx` — `useMatches()` → `tituloDeDocumento()` → `document.title = ...` in a `useEffect`; renders `<Outlet />` and nothing else.
- [x] 1.8 Confirm the existing `rutas.spec.tsx` guard-redirect and API-collision blocks (read before this phase) still pass **unmodified** — the regression net design.md names for the pathless-root risk.
- [x] 1.9 RED: `apps/web/src/funcionalidades/contratos/contenedores/PaginaDetalleContrato.spec.tsx` — new case: once the mocked `obtenerContrato` resolves with `numero: 42`, `document.title === "Contrato 42 · IES.NET Contratos"`. Must fail — no such effect exists (Note 3).
- [x] 1.10 GREEN: modify `apps/web/src/funcionalidades/contratos/contenedores/PaginaDetalleContrato.tsx` — add a `useEffect` that sets `document.title = conSufijo(\`Contrato ${data.numero}\`)` once `data` is defined, importing `conSufijo` from `rutas/tituloDeDocumento.ts`.
- [x] 1.11 RED: create `apps/web/src/pwa/indiceHtml.spec.ts` — reads `apps/web/index.html` (same `fileURLToPath`-relative read pattern as `convencionesDeEstilos.spec.ts`) and asserts `<title>IES.NET Contratos</title>`, a `<link rel="icon">` whose `href` resolves to an existing file under `apps/web/public/`, and `<meta name="theme-color" content="#0b634a">`. **Deliberately does not assert `apple-mobile-web-app-title`** (Note 2). Must fail — current file has `<title>Contratos</title>`, no favicon link, no theme-color meta.
- [x] 1.12 [BLOCKED until the recreated mark is approved — proposal Dependencies #1, Note 4] GREEN: modify `apps/web/index.html` — `<title>IES.NET Contratos</title>`, `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` + `<link rel="icon" type="image/png" href="/favicon-32.png">` fallback, `<meta name="theme-color" content="#0b634a">`; comment above the head block (citing DESIGN.md:297,304) recording that `apple-touch-icon`/`apple-mobile-web-app-title` are intentionally omitted, so nobody re-adds them believing they are load-bearing. Create `apps/web/public/favicon.svg` and `apps/web/public/favicon-32.png` from the approved mark, legible at 16px.

## Phase 1B — PR1 close out

- [x] 1B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint` against the PR1 diff; record results.
- [x] 1B.2 Manual: diff `apps/api/prisma/plantillas/*.html` and `tokens.css`'s `--familia-tipografica` against the pre-change state — confirm byte-identical (spec `product-identity`, "Change-scope boundary" — no existing test pins this).
- [x] 1B.3 Open PR #1 (opened as #93) targeting the tracker/feature branch (feature-branch-chain). Evidence: focused test command output, manual tab-title/favicon check, rollback boundary from the Work Units table.

## Phase 2 — PR2: replacement PWA icons (D5)

- [x] 2.1 [BLOCKED until the recreated mark is approved — proposal Dependencies #1] Commit `apps/web/marca/*.svg` (source, outside `public/` — never globbed or precached) plus a short regeneration note recording the 80% maskable safe-zone parameter and the steps to regenerate the three PNGs and the favicon SVG.
- [x] 2.2 RED: create `apps/web/src/pwa/iconos.spec.ts` — reads each PNG `OPCIONES_VITE_PLUGIN_PWA.manifest.icons` references, parses IHDR bytes (offset 16-24, no image dependency), asserts real width/height equal the promised `sizes` string; asserts every `icons[].src` resolves to a file that exists under `apps/web/public/`. Must fail — no such guard exists today (the existing `configuracionPwa.spec.ts` assertions check only the manifest string, never the file bytes).
- [x] 2.3 GREEN: regenerate `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` from the source in 2.1, preserving the maskable icon's existing 80% safe zone. Confirm 2.2 passes and the two existing size-string assertions in `configuracionPwa.spec.ts` still pass unmodified.
- [x] 2.4 Triangulate 2.2: add a deliberately mismatched-dimension fixture (a temp PNG whose real bytes are 100×100 asserted against a `"192x192"` manifest entry) proving the guard actually fails on a wrong-size file — not merely passing because the real files happen to match.
- [x] 2.5 Manual verification (not a test, stated plainly): user visually confirms the blue-field/white-"IES"-monogram appearance and the maskable safe zone on the three regenerated PNGs before merge — spec `product-identity`, "visual fidelity is verified manually, not by an automated test"; this suite cannot decode PNG pixel content.

## Phase 2B — PR2 close out

- [x] 2B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1+PR2 diff; record results.
- [x] 2B.2 Manual: confirm `apps/api/prisma/plantillas/*.html` and `tokens.css`'s font stack remain byte-identical (same check as 1B.2, cumulative).
- [x] 2B.3 Open PR #2 (opened as #94) targeting PR #1's branch (feature-branch-chain). Evidence per Work Units table; note the reinstall/home-screen-icon caveat from the proposal's Rollback Plan.

## Phase 3 — PR3: wordmark, CSS, brand-blue contrast guard (D1, D2, D6, D7)

- [ ] 3.1 RED: `apps/web/src/estilos/convencionesDeEstilos.spec.ts` — new `describe("matiz/saturacion resolve HSL hue and saturation")` block, direct assertions on synthetic hex strings (e.g. `#0076d9` → hue ≈207°, sat ≈100%; `#39454c` → hue ≈202°, sat ≈14%, proving the saturation floor excludes existing neutrals). Must fail — `matiz`/`saturacion` helpers don't exist yet.
- [ ] 3.2 GREEN: add `matiz(hex): number` and `saturacion(hex): number` helpers to `convencionesDeEstilos.spec.ts`, co-located with `valorDeColor`/`canales`/`contraste` (same file, same pattern).
- [ ] 3.3 RED: new `describe("brand-blue tokens and rules never carry illegible text (D6)")` — a synthetic-CSS fixture with `color: #008bff` on a text selector asserts the checking function fails, naming the offending selector and its computed ratio — spec `brand-presentation`, "a regression is caught" scenario. Must fail — the checking function doesn't exist yet.
- [ ] 3.4 GREEN: implement Guards A/B/C scanning real `apps/web/src/estilos/*.css` — Guard A: every `--color-marca-*` token clears 4.5:1 against `--color-fondo`; Guard B: any rule whose `color:` resolves into the brand-blue family (hue 190°-230°, saturation ≥50%) clears 4.5:1 against its own `background` or `--color-fondo`; Guard C: same, inverted, for `background:` against `color`/`--color-texto`. All three currently pass vacuously (no brand-blue CSS exists yet) — confirms wiring via 3.3, not yet exercised against real output.
- [ ] 3.5 Add `--color-marca-azul: #0076d9;` to `apps/web/src/estilos/tokens.css` (D1's consequence: `#008bff` appears in no stylesheet). Confirm Guard A now evaluates this real token and passes (4.57:1).
- [ ] 3.6 RED: create `apps/web/src/componentes/atomos/MarcaProducto.spec.tsx` — an element with accessible name matching `/IES\.NET/` is present; `queryByRole("heading")` is null; `queryByRole("link")` is null. Must fail — component doesn't exist.
- [ ] 3.7 GREEN: create `apps/web/src/componentes/atomos/MarcaProducto.tsx` — `<span className="marca-producto"><span className="marca-producto__empresa">IES.NET</span> Contratos</span>`, no props, no state (D1, D2).
- [ ] 3.8 Add CSS (D7): `apps/web/src/estilos/atomos.css` — `.marca-producto` (font-size: `var(--fuente-grande)`, no interactive pseudo-classes, declared before `.marca-producto__empresa`) and `.marca-producto__empresa` (`color: var(--color-marca-azul)`). `apps/web/src/estilos/organismos.css` — `.cabecera-sesion .marca-producto { margin-right: auto; }` and `.cabecera-sesion { flex-wrap: wrap; }` (degrade by wrapping, never clip). `apps/web/src/estilos/panel.css` — quiet `.marca-producto` font-size on `.layout-panel`, mirroring `.cabecera-sesion__usuario`'s existing treatment.
- [ ] 3.9 RED: `CabeceraDeSesion.spec.tsx` — new case: `MarcaProducto`'s accessible name (`/IES\.NET/`) is present in the header (existing username/logout-button tests, lines 28-38, stay unmodified — they already cover the "neither displaced" regression). Must fail — not rendered yet.
- [ ] 3.10 GREEN: modify `CabeceraDeSesion.tsx` — render `<MarcaProducto />` as the header's first child, before `.cabecera-sesion__usuario`.
- [ ] 3.11 RED: `PaginaLogin.spec.tsx` — new case: an element naming `/IES\.NET/` appears before the `<h1>` in document order. Must fail — not rendered yet.
- [ ] 3.12 GREEN: modify `PaginaLogin.tsx` — render `<MarcaProducto />` immediately above `<h1>Ingresar</h1>`. Confirm the existing "titles the screen" test (`PaginaLogin.spec.tsx:242-251`, `getByRole("heading", {level:1})`) still resolves to exactly one match — proves D2 constraint 1 held.
- [ ] 3.13 Triangulate Guard B (3.4) against the now-real `.marca-producto__empresa` rule (3.8): confirm it evaluates `color: var(--color-marca-azul)` at 4.57:1 and passes. Guard C has no real brand-blue `background:` rule in this change — stated plainly, not asserted as a gap, matching design's own caveat style.
- [ ] 3.14 Run the full `convencionesDeEstilos.spec.ts` suite; confirm no new `EXENCIONES` entry was needed (`.marca-producto` is not in `ELEMENTOS_INTERACTIVOS`) and no stale exemption exists.

## Phase 3B — PR3 close out

- [ ] 3B.1 Run `pnpm --filter @contratos/web test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1+PR2+PR3 diff; record results.
- [ ] 3B.2 Manual (final, authoritative check): diff `apps/api/prisma/plantillas/*.html` and `tokens.css`'s `--familia-tipografica` across the whole change — confirm byte-identical (spec `product-identity`, "Change-scope boundary").
- [ ] 3B.3 Manual: real browser at 640px and 1024px, confirm `.cabecera-sesion` wraps rather than clips and rendered contrast reads correctly.
- [ ] 3B.4 Open PR #3 targeting PR #2's branch (feature-branch-chain). Evidence per Work Units table.

## Non-goals / deferred (explicit, not silent)

- **A self-hosted brand webfont** — proposal's named follow-up, not this change.
- **A repaint in brand blue / flat button styling** — out of scope, both files independently argue the green palette (proposal).
- **`PanelNoDisponible` copy** — unchanged, must not name a home that does not exist yet.
- **`apps/api/prisma/plantillas/*.html`** — unchanged; verified at 1B.2/2B.2/3B.2.
