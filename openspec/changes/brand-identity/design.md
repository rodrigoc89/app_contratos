# Design: IES.NET brand identity in the app shell

The mark ships as **text and tokens wherever a test can see it, and as a raster asset only
where the OS demands one** (home screen, tab). That split is the whole design: every
falsifiable guarantee — the name, the per-route title, the colour ratio, the icon
dimensions — lands in TypeScript or CSS that `pnpm -r test` already scans, and the one thing
no test can judge (does the recreated mark look like IES.NET?) is a human approval gate the
proposal already declared as a dependency.

## What is provable, and what is a visual judgement (read this first)

| Concern | Provable in CI today | Human judgement |
|---|---|---|
| Manifest `name`/`description`/`background_color` | `configuracionPwa.spec.ts` (extends its existing manifest assertions) | — |
| Per-route `document.title` | Pure function unit tests + `rutas.spec.tsx` reading `document.title` | Wording of each Spanish title |
| Wordmark present on login and on every authenticated screen | `PaginaLogin.spec.tsx`, `CabeceraDeSesion.spec.tsx` | — |
| Brand blue never carries illegible text | New measured-ratio guard in `convencionesDeEstilos.spec.ts` (D6) | — |
| Icon files match the sizes the manifest promises | New PNG-header guard (D5) | — |
| Maskable safe zone, kerning, letterform fidelity | Generation parameter only (D5) | **All of it** |

## Architecture decisions

### D1 — The wordmark is live text, not an image

**Choice.** `IES.NET Contratos` renders as a `<span>` styled through `atomos.css`, inheriting
`--familia-tipografica`.

**Rejected.** (a) An `<img src="/marca.svg">` and (b) an inline SVG component. Both are argued
for by "the real letterforms" — and that argument is void here: **no vector source exists**
(exploration Risks), so an SVG would carry *our* recreation of the letterforms, not IES.NET's.
It would buy nothing real and cost three things that are real: it cannot be recoloured by a
token, it needs a hand-written accessible name that can drift from the visible text, and it is
invisible to `convencionesDeEstilos.spec.ts`, which reads CSS — so the contrast rule this change
exists to install would not apply to the one surface it was written for.

**Consequence.** Because the wordmark carries text, it takes `#0076d9` (4.57:1 on white), never
`#008bff`. `#008bff` therefore appears **nowhere in any stylesheet**: it exists only inside the
raster icons, where it is a mark at large size on a surface no CSS describes.

### D2 — `MarcaProducto` is an atom; the header and the login form compose it

**Choice.** New `apps/web/src/componentes/atomos/MarcaProducto.tsx` — no props, no state, no
`datos/` import. `CabeceraDeSesion` renders it as its first child; `PaginaLogin` renders it above
`<h1>Ingresar</h1>`.

**Rejected.** (a) Inlining the markup in `CabeceraDeSesion` — that container's subject is the
session (who is signed in, and the way out); a product wordmark is not session data, and login
would need a second copy of the markup with no shared definition. (b) Putting it in
`LayoutTablet`/`LayoutPanel` — it would be duplicated across two templates, would render as a
sibling of the injected `cabecera` needing new layout CSS in both, and `/login` has no layout at
all, so login would still need its own copy. The atom keeps one definition; the header keeps one
subject and merely *composes* it, which is the container/presentational split this codebase
already runs (`LayoutPanel`'s own comment: templates stay presentational, the route tree injects).

**Two constraints this markup must respect.**

1. **Never an `<h1>`.** `PaginaLogin.spec.tsx:242-251` uses `getByRole("heading", {level:1})`,
   which throws on *two* matches. A second `<h1>` would break a passing test and, worse, would
   give the login screen two competing document headings.
2. **Never a link.** `convencionesDeEstilos.spec.ts:1459` scans every `<a>`/`<Link>` with a
   `className` and demands both touch floors of it. The wordmark is a name, not a control —
   there is nowhere for it to navigate to that the app does not already show.

### D3 — Titles ride route `handle`, read once by `useMatches`

**Choice.** Each leaf route declares `handle: { titulo: "…" }` in `rutas.tsx`; a new pathless
root route renders `TituloDeDocumento`, which reads `useMatches()` and assigns `document.title`
in an effect. The string itself is built by a pure module.

```
rutas.tsx  handle:{titulo:"Ingresar"}       ┐
           handle:{titulo:"Nuevo contrato"} ├─→ useMatches() ─→ tituloDeDocumento(handles)
           handle:{titulo:"…"}              ┘                        │
                                                                     ↓
                                                  document.title = "Ingresar — IES.NET Contratos"
```

```ts
// apps/web/src/rutas/tituloDeDocumento.ts — pure, no React, no router
export const NOMBRE_APP = "IES.NET Contratos";
export function tituloDeDocumento(manejadores: ReadonlyArray<unknown>): string;
```

Deepest match declaring a `string` `titulo` wins; the bare `NOMBRE_APP` is the fallback. `handle`
is typed `unknown` by react-router, so it is narrowed by a type guard, never cast.

| Route | `handle.titulo` | Resulting title |
|---|---|---|
| `/login` | `Ingresar` | `Ingresar — IES.NET Contratos` |
| `/` | `Nuevo contrato` | `Nuevo contrato — IES.NET Contratos` |
| `/panel` | `Listado de contratos` | `Listado de contratos — IES.NET Contratos` |
| `/panel/contratos/:id` | `Detalle de contrato` | `Detalle de contrato — IES.NET Contratos` |
| `/panel-no-disponible` | **none** | `IES.NET Contratos` |

`/panel-no-disponible` deliberately declares no title: DESIGN.md D10 forbids that screen from
naming a home that does not exist yet, and a title is copy like any other. The fallback names the
app and nothing else.

**Rejected.** (a) `react-helmet` — a runtime dependency and bundle bytes on an offline-first PWA,
for one string assignment. (b) A `usarTituloDeDocumento(titulo)` hook called by each page
container — six call sites, the title drifts away from the route that owns it, and the suffix gets
repeated six times. (c) An effect in the two layouts — `/login` has no layout, and a
presentational template would have to take a title prop it does not otherwise need.
(d) `router.subscribe` outside React — works, but puts navigation-derived state outside the tree
the tests mount.

**Risk this carries.** The pathless root is a route-tree change. `rutas.spec.tsx` mounts `rutas`
with `createMemoryRouter` and asserts every guard redirect; those tests are the regression net and
must stay green unmodified. The root's element renders `<Outlet />` and nothing else.

### D4 — Manifest: white splash, green chrome, and the comment that must move with it

`background_color: "#ffffff"`, `theme_color: "#0b634a"` (unchanged), `name: "IES.NET Contratos"`,
`short_name: "Contratos"` (unchanged), new `description`.

The splash is the one moment the blue mark is alone on screen and must read; the OS chrome tints
the frame around the app's *interior*, which is green. Two surfaces, two jobs.

**`tokens.css:1-9` must be amended in the same slice.** Its header states the palette is built
around "the brand colour already declared in `pwa/configuracionPwa.ts`'s manifest" — after this
change `background_color` is no longer that colour, and a file whose prose contradicts the
manifest is worse than one that never mentioned it. No test enforces this; the review does.

### D5 — Icons are generated from a committed source that is not shipped

**Choice.** Commit `apps/web/marca/*.svg` (source) **outside** `public/`, so it is never imported,
never bundled, and never precached — `globPatterns` whitelists `svg`, so a source file in
`public/` would be pushed to every tablet for nothing. Regeneration instructions live beside it.

**Guard.** A spec reads each PNG's IHDR bytes (offset 16–24, no image dependency) and asserts the
file exists and its real dimensions equal the `sizes` its manifest entry promises. That is the
regression that actually happens: a manifest claiming `512x512` while a 192px file sits behind it.

**Not guarded, stated plainly.** The 80% maskable safe zone is a *generation parameter* recorded
in the source SVG, not a proven property: proving it needs pixel decoding (zlib inflate plus
defiltering, ~100 lines) to catch a defect one look at the home screen reveals. Asserting the
inset's spelling in the SVG would prove the parameter is present, not that the rendered monogram
respects it — so it is recorded as a parameter and checked by eye, not dressed up as a test.

**Favicon.** `apps/web/public/favicon.svg` plus a 32×32 PNG fallback, referenced from
`index.html`. It is a *simplified* variant of the same mark: at 16px three letters are ~5px each,
so the criterion is legibility at 16px, not fidelity to the full wordmark.

### D6 — The brand-blue guard measures hue and ratio; it never enumerates blues

Mirrors the estado-chip test (`convencionesDeEstilos.spec.ts:801-898`) — a measured ratio, reusing
`valorDeColor` / `canales` / `contraste` — and follows that file's own inverted polarity: a list
of banned hexes only ever covers the blues someone thought to list.

| Guard | Rule | Why |
|---|---|---|
| **A** | Every `--color-marca-*` token in `tokens.css` clears **4.5:1** against `--color-fondo` | The next brand colour cannot ship as illegible text |
| **B** | Any rule whose `color:` resolves into the brand-blue family must clear 4.5:1 against its own declared `background`, or `--color-fondo` when it declares none | Catches `#008bff`, `#0092ff`, a token, or a `color-mix` — whatever gets typed next |
| **C** | Same rule inverted: any rule whose `background` resolves into that family must clear 4.5:1 against its own `color`, or `--color-texto` | Otherwise a filled blue button with white text slips past B, which only reads `color:` |

"Brand-blue family" = resolved hue **190°–230°** with HSL saturation **≥ 50%**. The saturation
floor is not decoration: `--color-estado-borrador-texto: #39454c` (hue 202°, 14%) and
`--color-borde: #4b5563` (hue 215°, 14%) are existing neutrals inside that hue window, and without
the floor the guard would fail on colours that were never blue in any meaningful sense. The new
`matiz`/`saturacion` helper gets its own direct assertions, exactly as the `valorDeColor` describe
block does — a helper feeding a loop that may run one iteration must be proven, not assumed.

### D7 — How slice C's CSS clears the guards it has to live with

| Guard (`convencionesDeEstilos.spec.ts`) | How the wordmark satisfies it |
|---|---|
| 48px touch floors on anything control-shaped (:1228) | `.marca-producto` declares no `:hover`/`:focus`/`:disabled`, no `cursor: pointer`, and its key element is a `span` — not in `ELEMENTOS_INTERACTIVOS`. It is not a control, so **no `EXENCIONES` entry is needed or wanted** |
| `font-size ≥ 1rem` outside `panel.css` (:732) | `font-size: var(--fuente-grande)` (22px) — above the floor in fact, not merely outside the `rem` regex. `panel.css` may quiet it on `.layout-panel`, as it already does for `.cabecera-sesion__usuario` |
| BEM modifier after base (:1100) | `.marca-producto` is declared before `.marca-producto__empresa`; no modifier is introduced |
| Two breakpoints, no `max-width` (`tokens.css:74-90`) | The mark adds **zero** `@media` rules. Panel sizing rides the existing `.layout-panel` scoping |
| No `overflow: hidden/clip` (:15) | Never declared. The header degrades by `flex-wrap: wrap` on `.cabecera-sesion` — the only fix that neither clips (banned) nor shrinks type below the floor (banned) |

Placement follows `index.css`'s stated layering: the atom defines itself in `atomos.css`;
`organismos.css` only adds spacing around it (`.cabecera-sesion .marca-producto { margin-right:
auto; }`, which keeps the existing `justify-content: flex-end` and needs no markup regrouping).

## File changes

| File | Action | Description |
|---|---|---|
| `apps/web/index.html` | Modify | `<title>IES.NET Contratos</title>`, favicon `<link>`s, `apple-mobile-web-app-title`, `theme-color` (A) |
| `apps/web/src/pwa/configuracionPwa.ts` | Modify | `name`, `description`, `background_color` → white (D4) |
| `apps/web/src/pwa/configuracionPwa.spec.ts` | Modify | Assert the new manifest strings; existing icon-size assertions untouched |
| `apps/web/src/estilos/tokens.css` | Modify | `--color-marca-azul: #0076d9`; amend the D4 header comment |
| `apps/web/src/rutas/tituloDeDocumento.ts` + `.spec.ts` | Create | Pure title composition (D3) |
| `apps/web/src/rutas/TituloDeDocumento.tsx` | Create | `useMatches` → `document.title`, renders `<Outlet />` (D3) |
| `apps/web/src/rutas/rutas.tsx` | Modify | Pathless root + `handle.titulo` per leaf route |
| `apps/web/public/favicon.svg`, `favicon-32.png` | Create | D5 |
| `apps/web/marca/*.svg` + regeneration note | Create | Icon source, deliberately outside `public/` (D5) |
| `apps/web/public/icons/icon-{192,512,512-maskable}.png` | Modify | Replacement raster assets (B) |
| `apps/web/src/pwa/iconos.spec.ts` | Create | PNG IHDR dimensions vs manifest `sizes` (D5) |
| `apps/web/src/componentes/atomos/MarcaProducto.tsx` + `.spec.tsx` | Create | D1, D2 |
| `.../auth/contenedores/CabeceraDeSesion.tsx` | Modify | Compose `MarcaProducto` (C) |
| `.../auth/contenedores/PaginaLogin.tsx` | Modify | `MarcaProducto` above `<h1>Ingresar</h1>` (C) |
| `apps/web/src/estilos/atomos.css`, `organismos.css`, `panel.css` | Modify | Wordmark rules, `flex-wrap`, panel scaling (D7) |
| `apps/web/src/estilos/convencionesDeEstilos.spec.ts` | Modify | Guards A/B/C + helper proofs (D6) |
| `apps/api/prisma/plantillas/*.html`, `DESIGN.md`, `CLAUDE.md` | Unchanged | Out of scope by decision |

## Testing strategy

| Layer | What | Approach |
|---|---|---|
| Unit (pure) | `tituloDeDocumento` — deepest handle wins, fallback, malformed handle | Vitest, no React, no DOM |
| Unit (source scan) | Guards A/B/C and their hue/saturation helper | `convencionesDeEstilos.spec.ts`, helpers proven on synthetic CSS first (D6) |
| Unit (assets) | PNG dimensions vs manifest `sizes`; every manifest icon path exists | `node:fs` byte read, no image dependency |
| Component | `MarcaProducto` renders the name as text and not as a heading or a link | Testing Library, `queryByRole("heading")` / `queryByRole("link")` empty |
| Integration | `document.title` after mounting each route; guard redirects still resolve | `rutas.spec.tsx` with `createMemoryRouter` — existing cases unmodified |
| Manual | Mark fidelity, maskable safe zone, favicon at 16px, splash on a real install | User approval, already a proposal dependency |

## Threat matrix

**N/A** — no shell command, subprocess, VCS/PR automation, executable-file classification, or
process integration exists in this change. The only "routing" it touches is the client-side React
Router tree, which resolves components, never processes or paths. The route-tree risk it *does*
carry (the pathless root in D3) is a behavioural regression covered by `rutas.spec.tsx`'s existing
guard assertions, not an adversarial boundary.

## Rollout

Chained PRs A → B → C; PR #1 targets the feature branch, each later PR targets the previous.

| Slice | Contents | Est. authored |
|---|---|---|
| **A** | `index.html` head, manifest + `background_color` (D4), `tokens.css` comment, favicon assets, title mechanism and its tests (D3) | ~150 |
| **B** | Three replacement PNGs, committed SVG source, dimension guard (D5) | ~60 (guard included; the proposal's ~30 counted the binaries only) |
| **C** | `MarcaProducto` (D1, D2), CSS (D7), header + login wiring, component tests, brand-blue guards (D6) | ~250–350 |

Each slice is independently revertible; a reverted manifest or icon ships as an ordinary
service-worker update, applied between visits, never mid-signature (`skipWaiting: false`).
**A and B should land before técnicos install the app**, per the proposal's rollout argument: an
already-installed PWA may keep its old home-screen icon until the OS refreshes the manifest.

## Open questions

- [ ] **Android or iPad for the técnico tablets?** iOS ignores the manifest's `icons` for the home
      screen, so only an iPad needs `apple-touch-icon.png` (180×180) plus its `<link>`. Default
      taken: ship it in slice B — one PNG and one line, and it is dead weight on Android rather
      than a missing icon on iOS.
- [ ] Exact Spanish wording of the four route titles (D3 table) — settled at implementation with
      the same reviewer who approves the mark.
