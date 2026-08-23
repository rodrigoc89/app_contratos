## Exploration: brand-identity

### Current State

The app carries almost no visual identity today. It is named generically
(`Contratos`), uses a placeholder icon (a flat `#0b634a` square with a white
"C"), and the one deliberate brand decision already in the codebase — a
single, no-dark-mode, high-contrast green palette built for a técnico
reading a tablet in direct Santiago del Estero sunlight — is real and
independently re-argued in two separate files
(`apps/web/src/estilos/tokens.css:1-9`, `apps/web/src/estilos/organismos.css:143-153`),
never contradicted anywhere in the code. The orchestrator's brief to avoid a
full repaint in brand blue is therefore not just consistent with the
codebase — the codebase argues it more strongly than the brief assumed.

Naming and icons are the two places currently locked to a placeholder value
in exactly one spot each, which makes them cheap to fix. Every other
"generic" surface (login screen, session header, buttons, typography,
loading states) is either deliberately plain for a documented reason, or
simply was never branded because nobody built that yet — this exploration
distinguishes the two throughout.

### Affected Areas

**Naming surfaces**
- `apps/web/index.html:6` — static `<title>Contratos</title>`. No
  `<link rel="icon">`, no `apple-mobile-web-app-title`, no `theme-color`
  meta anywhere in the HTML head.
- `apps/web/src/pwa/configuracionPwa.ts:36-38` — manifest `name`,
  `short_name`, `description` (the orchestrator's decided values go here).
- `apps/web/src/funcionalidades/auth/contenedores/CabeceraDeSesion.tsx:21-38`
  — shared header rendered on **every** authenticated screen
  (`apps/web/src/rutas/rutas.tsx:44,57,72`). Shows only the username and a
  "Cerrar sesión" button. Never names the app — the single most
  consistently-visible surface in the whole product currently carries zero
  identity.
- `apps/web/src/funcionalidades/auth/contenedores/PaginaLogin.tsx:86-91` —
  first screen anyone sees, bare `<h1>Ingresar</h1>`, no logo, no name.
  `PaginaLogin.spec.tsx:242-251` only asserts *a* level-1 heading exists
  (`getByRole("heading", {level:1})`), not its text — adding a wordmark
  above it or changing the heading text is safe under the current suite.
- `apps/web/src/funcionalidades/auth/contenedores/PanelNoDisponible.tsx:1-11`
  — **deliberately** does not name the office/app (its own comment cites
  R-3.2/D10: naming it would go stale the moment any role has a real home).
  Do not touch this screen's copy.
- No per-route `document.title` management exists anywhere in
  `apps/web/src` (confirmed by grep — no `document.title`, no
  `<Helmet>`/react-helmet, no title hook). The browser tab reads the same
  static string for login, drafting, signing, and the office panel alike.
  This is an unbuilt feature, not a documented choice.
- `apps/api/prisma/plantillas/v1-condiciones-generales.html:106` is the
  **only** place in the entire product where "IES.NET" already appears
  verbatim, inside legal boilerplate text. `v1-comodato.html` never names
  the company at all. Both templates' `<title>` tags are print metadata,
  invisible to the customer signing on the tablet — irrelevant to this
  change.

**Icons**
- `apps/web/public/icons/{icon-192,icon-512,icon-512-maskable}.png` —
  confirmed by direct image inspection: flat `#0b634a` fill, single white
  "C" glyph, already well inside the maskable safe zone (the glyph occupies
  roughly the center third of the 512px canvas). The placeholder's geometry
  is not itself a trap; a replacement just needs to preserve that margin.
- `apps/web/src/pwa/configuracionPwa.ts:28,32,44-47` — `includeManifestIcons:
  true` plus `globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"]`
  already whitelist `png`/`svg`/`ico`, so a favicon dropped into
  `apps/web/public/` needs zero build-config changes — only one `<link
  rel="icon">` in `index.html`.
- `configuracionPwa.spec.ts:46-56` asserts only `manifest.display`,
  `manifest.start_url`, and that icon `sizes` include `"192x192"` and
  `"512x512"` — no path, `purpose`, or byte pinning. Icon replacement is
  unconstrained by tests as long as those two size strings survive.
- No file besides `configuracionPwa.ts` references the three icon filenames
  (grep across `apps/web/src` confirms).

**Generic-but-deliberate vs. generic-by-neglect**
- Typography: `tokens.css:66-69` — `system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif`. This is load-bearing, not an oversight: the app is
  offline-first (no network font fetch mid-visit) and the API's PDF
  renderer is headless Chromium with **no network access at all**
  (`apps/api/prisma/plantillas/*.html`'s own comment: "only families
  shipped by fonts-liberation and fonts-dejavu-core"). A self-hosted
  `.woff2` is technically possible (already whitelisted in `globPatterns`)
  but is real added effort and added bytes to a bundle deliberately kept
  offline-first — recommend treating this as a separate follow-up, not
  bundling it into this change.
- Buttons/forms (`atomos.css`): fully token-driven, deliberately flat/plain
  per `organismos.css:143-153`'s explicit rejection of the office panel's
  lighter aesthetic for técnico screens. Deliberate, not neglected.
- Empty/loading states: `Spinner.tsx` + `.progreso` (`organismos.css:325-329`)
  is a plain brand-green ring paired with Spanish status text everywhere it
  renders. No branded loading treatment exists, and nothing in the
  design docs argues for one — a legitimate "generic detail," not a bug.
- Favicon/tab icon: literally absent. On the office panel — used at a desk
  monitor per `panel.css`'s own comments — this is probably the single most
  visible "looks generic" cue, and it's pure upside: zero test coverage to
  break.
- Colour: nothing found anywhere in the codebase contradicts the
  orchestrator's no-repaint stance; if anything it's independently
  reinforced twice (outdoor-sunlight readability in `tokens.css`,
  single-theme-maintenance in `organismos.css`).

**Constraints**
- `apps/web/src/pwa/configuracionPwa.ts`'s own header comment (labelled D9
  in-file) states the whole file exists "to stop a service-worker update
  from swapping the app out from under a signature in progress" —
  `registerType: "prompt"`, `skipWaiting: false`, `clientsClaim: false`.
  Practically: a manifest name/short_name/icon change ships as an ordinary
  app-shell update, applied between visits, never mid-signature — no forced
  reinstall. The user's "settle before técnicos add the app" framing is
  about avoiding multiple stale icons across tablets during rollout, not a
  technical blocker — worth stating plainly to soften the urgency framing
  without contradicting the decision to settle it now.
- `apps/web/src/pwa/registro.ts`, `actualizacion.ts`,
  `controladorDeActualizacion.ts` — confirmed zero coupling to manifest
  strings; the update controller only tracks "técnico mid-visit" vs. "new
  SW waiting." Safe.
- `configuracionPwa.spec.ts` — as detailed above, asserts none of
  `name`/`short_name`/`description`/`theme_color`/icon *paths*. A rename
  touches zero of its assertions.
- `CabeceraDeSesion.spec.tsx` / `PaginaLogin.spec.tsx` — query by specific
  role/text, tolerant of added sibling markup. Adding a wordmark is
  additive-safe.
- `apps/web/src/estilos/convencionesDeEstilos.spec.ts` (1548 lines) is the
  real constraint surface for **any** new CSS in this change: bans
  `overflow: hidden/clip` anywhere; requires exactly one `!important
  display` (the `[hidden]` protection); requires `.boton` and
  `--tamano-toque-minimo` stay ≥ 48px; requires every new interactive
  control (`:hover`/`:focus`/`:disabled`/interactive tag/`cursor:pointer`)
  declare both a vertical and horizontal touch floor or be added to an
  explicit, justified `EXENCIONES` list; bans a third `@media` breakpoint
  or a `max-width` query; bans `font-size < 1rem` outside `panel.css`;
  requires a `.x--modifier` rule be declared textually after its bare `.x`.
  Any branded, clickable wordmark must satisfy all of these.
- `tokens.css:1-9`'s comment explicitly frames `--color-primario`
  (`#0b634a`) as "the brand colour already declared" in the manifest's
  `theme_color`/`background_color` — today those three values ARE meant to
  be the same colour, by prose convention, not by a test (grep confirms no
  spec checks `theme_color`/`background_color`). If the identity change
  wants OS chrome (splash background, status-bar tint) to read as brand
  blue instead, that decouples from this comment's stated framing and
  should get its own explicit design-phase note.
- Raw brand blue (`#008bff`/`#0092ff`) fails 4.5:1 on white per the
  orchestrator's own measurements; no existing CSS guard checks brand-blue
  contrast today — one would need to be added (mirroring the existing
  estado-chip contrast test pattern in `convencionesDeEstilos.spec.ts`) if
  blue text ships anywhere.
- PDF templates (`apps/api/prisma/plantillas/*.html`) render via headless
  Chromium, `--no-sandbox`, explicitly "must never touch the network." A
  logo there would need to be an inlined base64 data URI — the same pattern
  already used for signature images (`{{firmaComodante}}` etc. are
  template-injected `<img src="...">` values), so it's technically
  feasible. But these are legal documents tracing to a specific paper form
  (`contrato2026.docx`), which `DESIGN.md` calls "a hard requirement, not
  an implementation detail" for its two-document structure. This sits
  closer to "legal document" than "app UI."

### Approaches

1. **Single consolidated identity PR** — naming, favicon, icons, wordmark
   (header + login), and the PDF logo, all in one change.
   - Pros: one coherent story, one review pass.
   - Cons: mixes a legal-document edit (different risk/sign-off profile)
     with an app-shell edit; the CSS-guard-heavy wordmark work alone is
     likely to push past the 400-line review budget once test additions for
     `convencionesDeEstilos.spec.ts` are counted; icon/wordmark asset
     creation (binary/design work) blocks the whole PR on a dependency nothing
     else in it needs.
   - Effort: High

2. **Chained PRs, ordered by risk and by the user's own stated urgency**
   (recommended):
   - **PR1 — naming & metadata**: `index.html` title, manifest
     `name`/`short_name`/`description`, `apple-mobile-web-app-title` meta,
     favicon `<link>` + asset, a small `document.title`-per-route hook.
     Zero interaction with `convencionesDeEstilos.spec.ts`. Satisfies the
     "settle naming before técnicos install" motivation immediately.
   - **PR2 — icons**: replace the 3 placeholder PNGs, respecting the
     already-adequate maskable safe zone. No code changes beyond possibly
     tightening `manifest.icons`.
   - **PR3 — visible wordmark**: `CabeceraDeSesion` + `PaginaLogin`, using
     the darkened `#0076d9` (4.57:1, passes) for any blue text/control,
     built to satisfy every `convencionesDeEstilos.spec.ts` guard listed
     above (touch floor, BEM ordering, breakpoints, font-size floor). Needs
     a recreated wordmark asset first (see Risks).
   - **PR4 — PDF-template logo (optional/deferred)**: separate change,
     explicitly gated on business-owner sign-off given the legal-document
     lineage; not default-included in this change's scope.
   - Pros: each slice ships and is reviewable independently, keeps within
     the 400-line budget per slice, isolates the highest-risk piece (legal
     PDF) from the lowest-risk (naming), unblocks the técnico-install
     urgency first without waiting on design-asset work.
   - Cons: more PRs to sequence; PR3 has a real external dependency (a
     recreated wordmark asset) that PR1/PR2 don't.
   - Effort: Low / Low / Medium / Medium (per slice)

3. **Add a self-hosted brand webfont** — as its own follow-up, not part of
   this change.
   - Pros: closes the one genuinely open typography gap.
   - Cons: real licensing/selection/bundling effort, adds bytes to an
     offline-first, outdoor-read PWA; nothing in the user's ask specifically
     requested a typeface change — "menos genérica" is satisfied by naming +
     icon + wordmark first.
   - Effort: Medium, deliberately excluded from this change's scope.

### Recommendation

Approach 2 — chained PRs in the stated order. PR1 (naming/metadata) and PR2
(icons) are unconstrained by any existing test beyond the two icon-size
strings, ship the orchestrator's already-decided naming immediately, and
directly address the técnico-install urgency the user raised. PR3 (wordmark)
is where real design and CSS-guard work lives and should follow once a
recreated wordmark asset exists. The PDF-template logo (PR4) should be
proposed as explicitly separate and deferred pending the user's decision —
it is a legal-document change, not an app-identity change, and folding it in
silently would cross the stated "identity and presentation, not a UX
redesign" boundary into contract-content territory.

### Risks

- No vector/brand asset exists for the IES.NET wordmark or icon — only the
  112×43 screenshot the user pasted. Any wordmark/icon work is a
  "best-effort recreation," carrying colour/kerning-fidelity risk against
  the real company mark; needs explicit user sign-off before `/sdd-propose`
  locks scope, and likely needs the user to supply or approve the
  recreated asset directly (no code agent can safely improvise a company's
  visual mark from a screenshot without that approval).
- Raw brand blue fails contrast at 4.5:1; any wordmark rendered as live
  text (not a flat image) at body-text size must use `#0076d9`, and a new
  contrast guard should be added to `convencionesDeEstilos.spec.ts` to keep
  that enforced — today nothing in the test suite checks it.
- The PDF-template logo touches a legal document with an explicit paper-form
  lineage that `DESIGN.md` treats as non-negotiable structurally. Recommend
  keeping it out of this change's proposal unless the user explicitly asks
  for it and can confirm sign-off authority over the printed contract's
  appearance.
- `convencionesDeEstilos.spec.ts` is large and strict; whoever implements
  PR3 needs to budget real time for satisfying its touch-target, BEM-order,
  breakpoint, and font-size guards — this is not boilerplate CSS.
- Icon/favicon generation (cropping/vectorizing from the pasted screenshot,
  producing 192/512/512-maskable + a favicon) is an image-editing step no
  code agent performs blind — needs either a designer-supplied asset or an
  explicit "best-effort recreation, approved" decision from the user.

### Ready for Proposal

Yes, with one open question the orchestrator should put to the user before
`/sdd-propose` locks scope: **is the PDF-template logo in scope now, or
explicitly deferred**, and **is a best-effort wordmark/icon recreation from
the pasted screenshot acceptable**, or will the user supply a source asset?
Both directly change what PR3/PR4 can promise to deliver.
