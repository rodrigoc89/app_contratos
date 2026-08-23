# Proposal: IES.NET brand identity in the app shell

## Intent

**Current-state gap.** The product never names itself. `apps/web/index.html:6` is a
bare `<title>Contratos</title>` — no favicon at all, no `apple-mobile-web-app-title`,
no `theme-color` meta — and that one static string serves login, drafting, signing and
the office panel alike (no `document.title` management exists anywhere in `apps/web/src`).
`CabeceraDeSesion.tsx:31-37` renders on **every** authenticated screen and shows only a
username and a "Cerrar sesión" button. `PaginaLogin.tsx:86-91`, the first screen anyone
sees, opens on `<h1>Ingresar</h1>`. The PWA icon is a placeholder: a flat `#0b634a`
square with a white "C". The only place "IES.NET" appears in the whole product is legal
boilerplate inside a PDF template.

**Why now.** Naming and icons are what a técnico installs to a tablet home screen.
Settling them before rollout avoids several stale labels and icons living across devices;
`configuracionPwa.ts`'s D9 comment confirms this is a rollout concern, not a technical
blocker (`registerType: "prompt"`, `skipWaiting: false` — updates apply between visits,
never mid-signature).

**Success.** The app says who ships it and what it does, on the tab, the home screen and
the screen, without a UX redesign and without repainting the palette.

## Scope

### In Scope

| # | Deliverable |
|---|-------------|
| 1 | Naming: `<title>` and manifest `name` = `IES.NET Contratos`; `short_name` stays `Contratos`; `apple-mobile-web-app-title`; description |
| 2 | Per-route `document.title`, suffixed with the app name (Spanish UI copy) |
| 3 | Favicon asset + `<link rel="icon">` (`globPatterns` already whitelists `png,svg,ico` — no build config change) |
| 4 | Replacement PWA icons (192, 512, 512-maskable), preserving the existing maskable safe zone |
| 5 | Visible wordmark on `CabeceraDeSesion` and `PaginaLogin` |
| 6 | A contrast guard in `convencionesDeEstilos.spec.ts` keeping brand blue off text-sized surfaces |

### Out of Scope — and why, so nobody "fixes" it later

- **The PDF contract templates (`apps/api/prisma/plantillas/*.html`).** Decided by the
  user: app only. The printed comodato is a legal document tracing to a paper form; its
  appearance is a business decision, not a design one, and it already names IES.NET in
  its legal text (`v1-condiciones-generales.html:106`).
- **A repaint in brand blue.** `tokens.css:1-9` (outdoor sunlight, no dark mode) and
  `organismos.css:143-153` (single theme, filled controls over outline) argue the green
  palette independently, in two files, and nothing contradicts them.
- **The system font stack** (`tokens.css:66-69`). Load-bearing: offline-first PWA, and
  the PDF renderer is headless Chromium with no network access.
- **Flat button/form styling.** Deliberate per `organismos.css:143-153`.
- **`PanelNoDisponible` copy.** Its own comment explains it must not name a home that
  does not exist yet.
- **A self-hosted brand webfont.** Technically possible (`woff2` already whitelisted),
  real bytes and licensing effort on an offline-first bundle. Named follow-up.
- Signature flow, contract state machine, routing, and the API — untouched.

## Capabilities

### New Capabilities

- `product-identity`: what the app calls itself on every naming surface — manifest,
  tab title per route, home-screen label, favicon and PWA icons.
- `brand-presentation`: where the mark appears in the UI (session header, login) and the
  contrast rule that governs brand blue.

### Modified Capabilities

None. `openspec/specs/` is currently empty.

## Approach

Adopt exploration Approach 2 — **three chained slices, ordered by risk**. Slices 1 and 2
touch no existing assertion beyond two icon-size strings in `configuracionPwa.spec.ts`
and ship the naming urgency immediately. Slice 3 is where the real work is: any new CSS
must satisfy `convencionesDeEstilos.spec.ts` (1548 lines — 48px touch floors, BEM
modifier-after-base ordering, exactly two breakpoints, no `font-size < 1rem` outside
`panel.css`, no `overflow: hidden`).

**Colour rule (measured, WCAG on white, 4.5:1 for normal text).** True `#008bff` is
3.42:1 and fails; it appears **only** where it is a mark at large size — icon and
wordmark. `#0076d9` (same hue 207°, same 100% saturation) is 4.57:1 and passes; it is
used anywhere blue carries text or a control. The palette primary `#0b634a` (7.25:1)
stays as it is.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/index.html` | Modified | Title, favicon link, `apple-mobile-web-app-title`, `theme-color` |
| `apps/web/src/pwa/configuracionPwa.ts` | Modified | Manifest `name`/`description` (`short_name` already correct) |
| `apps/web/src/rutas/` (title hook) | New | Per-route `document.title` |
| `apps/web/public/` + `public/icons/*.png` | New/Modified | Favicon, three replacement icons |
| `.../auth/contenedores/CabeceraDeSesion.tsx` | Modified | Wordmark alongside user + logout |
| `.../auth/contenedores/PaginaLogin.tsx` | Modified | Wordmark above `<h1>Ingresar</h1>` |
| `apps/web/src/estilos/` (tokens + CSS) | Modified | Brand-blue tokens, wordmark rules |
| `apps/web/src/estilos/convencionesDeEstilos.spec.ts` | Modified | New brand-blue contrast guard |
| `apps/api/prisma/plantillas/*.html` | Unchanged | Explicitly out of scope |

## Size forecast

| Slice | Content | Est. authored lines |
|-------|---------|--------------------|
| **A** | Naming, metadata, favicon, per-route title hook + tests | ~150 |
| **B** | Icon replacement (binary assets; near-zero authored text) | ~30 |
| **C** | Wordmark, CSS, component tests, contrast guard | ~250–350 |

Total ~430–530 against a 400-line budget. **Chained PRs recommended: Yes** — A → B → C,
each independently shippable and revertible. A single PR would breach the budget and
would block trivial naming work on design-asset creation it does not need.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The wordmark/icon is a best-effort recreation from a screenshot, not a vector source | **Certain — accepted** | Explicitly approved by the user. A real vector asset replaces it later at no structural cost (icon paths and CSS are unchanged by a swap) |
| Slice C's CSS trips a `convencionesDeEstilos.spec.ts` guard | Med | Guards enumerated up front; a clickable wordmark needs both touch floors or a justified `EXENCIONES` entry |
| Blue drifts onto text-sized surfaces later | Med | The new contrast guard, mirroring the existing estado-chip contrast test pattern |
| Blue icon over a green splash background (`theme_color`/`background_color` = `#0b634a`) reads inconsistently | Med | Open design-phase decision — `tokens.css:1-9` ties those manifest values to the green primary by prose convention, not by any test. Do not change silently |
| Stale icons across tablets during rollout | Low | Ship naming + icons (A, B) before técnicos install |

## Rollback Plan

- Each slice is an independent PR; `git revert` restores the previous state. Nothing
  outside `apps/web` is touched.
- A reverted manifest/icon ships as an ordinary service-worker update, applied between
  visits, never mid-signature (`skipWaiting: false`, `clientsClaim: false`).
- Caveat: an already-installed PWA may keep the previous home-screen icon until the OS
  refreshes the manifest or the app is reinstalled. Reverting fixes the source, not
  every device instantly — which is the argument for shipping A and B before rollout.

## Dependencies

Real-world sequencing, **not implementation tasks**:

1. A recreated IES.NET mark (favicon, 192/512/512-maskable, wordmark) must exist and be
   visually approved by the user before slices B and C can be implemented. No vector
   source exists — only a website screenshot.
2. Optional and later: an official vector asset from IES.NET, which supersedes the
   recreation without structural change.

## Success Criteria

- [ ] Manifest `name` is `IES.NET Contratos`, `short_name` is `Contratos`; the two
      icon-size assertions in `configuracionPwa.spec.ts` still pass
- [ ] A favicon renders in a desktop browser tab on the office panel
- [ ] The tab title differs per route and names the app
- [ ] The wordmark is visible on the login screen and on every authenticated screen
- [ ] No blue below 4.5:1 on white carries text or a control, enforced by a test
- [ ] `pnpm -r test`, `pnpm typecheck` and `pnpm lint` pass; `convencionesDeEstilos.spec.ts`
      passes with no new `EXENCIONES` entry left unjustified
- [ ] `apps/api/prisma/plantillas/` and the green palette are byte-identical
