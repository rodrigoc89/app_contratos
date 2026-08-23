# Product Identity Specification

## Purpose

What the app calls itself on every naming surface a técnico or office user
can see before installing or opening it: the PWA manifest, the browser tab,
the home-screen icon and label, and the favicon. Out of scope, unchanged by
this capability: `apps/api/prisma/plantillas/*.html` (legal contract
templates), the system font stack, and `PanelNoDisponible`'s copy.

## Requirements

### Requirement: Manifest name and description

The manifest MUST declare `name` as `"IES.NET Contratos"` and a `description`
that mentions `"IES.NET"`. `short_name` is unaffected — it is already
`"Contratos"`.

#### Scenario: manifest name and description are asserted

- GIVEN `OPCIONES_VITE_PLUGIN_PWA.manifest` in `configuracionPwa.ts`
- WHEN `configuracionPwa.spec.ts` reads `manifest.name` and `manifest.description`
- THEN `name` equals `"IES.NET Contratos"`
- AND `description` contains `"IES.NET"` and is non-empty

### Requirement: PWA chrome colours

The manifest MUST declare `background_color` as `"#ffffff"` (the splash
screen, so the blue mark reads against white) and MUST keep `theme_color` as
`"#0b634a"` (the OS chrome matches the app's green interior). Neither value
has an assertion today.

#### Scenario: splash and chrome colours are asserted

- GIVEN `OPCIONES_VITE_PLUGIN_PWA.manifest`
- WHEN `configuracionPwa.spec.ts` reads `manifest.background_color` and `manifest.theme_color`
- THEN `background_color` equals `"#ffffff"`
- AND `theme_color` equals `"#0b634a"`

### Requirement: HTML head identity

`apps/web/index.html` MUST declare `<title>IES.NET Contratos</title>`, a
`<link rel="icon">` pointing to a favicon asset that exists under
`apps/web/public/`, and a `theme-color` meta tag equal to `"#0b634a"`
(mirrors the manifest).

It MUST NOT declare `apple-mobile-web-app-title` or `apple-touch-icon`.
Both are iOS-only surfaces, and `DESIGN.md:297,304` establish the fleet as
Chromium-on-Android and name the trigger if that ever changes. This
requirement originally called for the title meta; it was amended after the
orchestrator settled the decision, because a spec that contradicts shipped
code is a spec nobody can trust — and the absence is recorded as a comment
in `index.html` rather than a test asserting it, since an always-passing
assertion is worse than the comment (the same precedent `vite.config.ts`
already sets for a removed no-op).

#### Scenario: static head tags are present and correct

- GIVEN the built `apps/web/index.html` source
- WHEN a test parses its `<head>`
- THEN `<title>` reads `"IES.NET Contratos"`
- AND a `<link rel="icon">` element exists whose `href` resolves to a file under `apps/web/public/`
- AND `<meta name="theme-color" content="#0b634a">` is present
- AND no `apple-mobile-web-app-title` or `apple-touch-icon` tag is declared

### Requirement: Per-route document title

Every authenticated and unauthenticated route MUST set `document.title` to
`"{Route label in Spanish} · IES.NET Contratos"`. The static `<title>` in
`index.html` is only the pre-hydration fallback.

#### Scenario: login route sets its title

- GIVEN the app navigates to `/login`
- WHEN the route mounts
- THEN `document.title` equals `"Ingresar · IES.NET Contratos"`

#### Scenario: distinct routes carry distinct titles

- GIVEN the app navigates to two different routes (e.g. `/login` and `/panel`)
- WHEN each route mounts
- THEN both titles end with `" · IES.NET Contratos"`
- AND the two titles differ from each other

### Requirement: PWA icon identity

The three manifest icons and the favicon MUST use a `#008bff` blue field with
a white "IES" monogram; the existing 512-maskable icon MUST preserve its
current safe zone (glyph within the center 80% of the 512px canvas). The two
existing size assertions (`"192x192"`, `"512x512"`) in
`configuracionPwa.spec.ts` MUST continue to pass unchanged.

#### Scenario: referenced icon files exist on disk

- GIVEN `manifest.icons` in `configuracionPwa.ts`
- WHEN a test resolves each `src` against `apps/web/public/`
- THEN every referenced icon file exists

#### Scenario: visual fidelity is verified manually, not by an automated test

- GIVEN the recreated icons and favicon are a best-effort reproduction from a
  screenshot (no vector source exists)
- WHEN the assets are generated
- THEN the blue-field/white-monogram appearance and the maskable safe zone
  are confirmed by user visual review before merge — this project's suite
  cannot decode PNG pixel content, so no automated colour or geometry check
  exists for this scenario

### Requirement: Change-scope boundary

This change MUST NOT modify `apps/api/prisma/plantillas/*.html`, the font
stack declared in `tokens.css`, or `PanelNoDisponible`'s copy.

#### Scenario: legal templates and font stack are untouched

- GIVEN a diff of this change
- WHEN a reviewer inspects `apps/api/prisma/plantillas/*.html` and
  `tokens.css`'s `--familia-tipografica`
- THEN both are byte-identical to their pre-change state — verified by
  manual diff review at PR time, since no existing test pins their content
