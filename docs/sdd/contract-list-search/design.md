# Design: Contract list and search for the office panel

## Technical Approach

A persisted, application-computed search column plus a read-model port method, delivered as two independently deployable pull requests. PR #1 is API + `packages/esquemas` only and is useful over curl with no frontend. PR #2 is `apps/web` only and consumes PR #1's wire contract. No file in PR #1 references anything PR #2 introduces.

The whole backend hangs off one pure function, `normalizarTexto`, which governs four call sites (write mapper, query interpretation, backfill, in-memory double). Everything else is arranged so that function cannot be bypassed or duplicated.

**Supersedes the proposal in two places.** (1) `ñ` is preserved, not folded — user decision after the proposal. (2) The proposal's `creadoEn` derivation is impossible; see D3.

**Revision 2 (device constraint).** The office panel runs on notebooks and desktop monitors across ~360–1920px+, not only on tablets. The backend design below is unchanged. The web design was revised: D12 replaced, D13–D15 added, and two claims from revision 1 retracted as factually wrong (see "Retractions").

---

## Architecture Decisions — Backend (PR #1)

### D1 — `normalizarTexto`: preserve `ñ`, strip every other Spanish diacritic

`apps/api/src/shared/domain/normalizarTexto.ts`. Zero imports, no I/O, no framework, no clock. Spec runs with no database and no browser, satisfying `CLAUDE.md`'s hard rule.

**Signature**: `normalizarTexto(valor: string): string`.

**Exact rule sequence** (order is load-bearing):

| # | Step | Why this step exists |
|---|---|---|
| 1 | `NFD`-decompose | The precomposed/decomposed problem. `U+00F1` and `n`+`U+0303` are different strings that must produce the same stored value. After NFD they are byte-identical, so every later step sees one form. |
| 2 | `toLowerCase()` | After step 1, so the mark filter in step 3 only ever inspects lowercase base letters and its test is a single comparison against `"n"`. |
| 3 | Scan code points, tracking the last **retained** base character. Drop every combining mark in `U+0300–U+036F` **except** `U+0303` when the last retained base is `"n"`. A dropped mark does not move the cursor. | This is the one line the whole change turns on. It keeps `ñ` and drops `á é í ó ú ü`. |
| 4 | `NFC`-recompose | Surviving `n`+`U+0303` becomes `U+00F1`. **This is what makes the JS double and Postgres agree**: SQL `LIKE` is byte-exact and performs no Unicode normalization, so a column holding `n`+`U+0303` would never match a term holding `U+00F1`. |
| 5 | Collapse whitespace runs to one `U+0020`, trim | Typed input has stray spaces; stored names do not. |

**Behaviour table (the spec's cases):**

| Input | Output | Proves |
|---|---|---|
| `"Pérez"` / `"PÉREZ"` | `"perez"` | case + acute |
| `"Núñez"` (NFC `ñ`) | `"nuñez"` | `ñ` survives, `ú` does not |
| `"Nuñez"` (NFD `ñ`) | `"nuñez"` | **identical to the row above** — write path and search path cannot disagree |
| `"Ñandú"` | `"ñandu"` | leading `Ñ` lowercases to `ñ`, not to `n` |
| `"Müller"` | `"muller"` | diaeresis stripped |
| `"João"` | `"joao"` | tilde dropped because its base is `a`, not `n` |
| `"  Juan   Carlos "` | `"juan carlos"` | whitespace |

**Alternatives rejected:**

| Approach | Why rejected |
|---|---|
| `.normalize("NFD").replace(/\p{Diacritic}/gu, "")` | The idiomatic one-liner. NFD splits `ñ` into `n`+`U+0303`, the class deletes the tilde, and it silently yields `n`. Nothing fails unless a `ñ` case exists in the suite. |
| Sentinel swap (`ñ` → private-use char → strip → restore) | Needs both NFC and NFD `ñ` handled *before* the swap, and the sentinel must survive `toLowerCase` and NFC. Three invariants where step 3 needs one. |
| Lookbehind regex over the mark block | Correct on Node, but the rule becomes character-class arithmetic no reader can verify, and it misbehaves when another mark sits between the `n` and its tilde. |
| `Intl.Collator({ sensitivity: "base" })` | Compares; does not transform. Produces no value to store or index. |
| Postgres `unaccent` / `translate()` | An extension (banned) or a second implementation free to drift (banned). |

### D2 — The normalized column is a required field of the row type, not a remembered call

`FilaContrato` (`infrastructure/mappers/ContratoMapper.ts`) gains a **required** `comodatarioNombreBusqueda: string`, computed inside `filaContratoDesde` from `comodatario.nombreCompleto`.

This is the "impossible to forget" mechanism, and it is type-level rather than disciplinary: `filaContratoDesde` is the only function that constructs a `contratos` row, and TypeScript refuses any construction that omits a required property. `PrismaContratoRepository.guardar` spreads `...fila` into **both** branches — `create` and `updateMany` — so the column is rewritten on every save. A stale value is structurally unreachable: `ActualizarBorrador` changes the comodatario, the next `guardar` rebuilds the whole row, the column moves with it.

Rejected: computing it in the use case or controller (forgettable); a Postgres generated column or trigger (a second implementation of the rule in SQL, exactly the drift D1 exists to prevent, and Prisma manages neither cleanly).

### D3 — `creadoEn` is storage-assigned, not domain state (corrects the proposal)

**Finding.** The proposal's fix — derive `creadoEn` from the `creado` event's `registradoEn` — cannot be implemented. `EventoContrato` is `{ tipo, fecha, detalle }` (`domain/Contrato.ts:45-49`). `crearBorrador` records `registrar("creado", null, null)`, so even `fecha` is null. `registradoEn` is not a domain field at all: the Prisma adapter synthesizes it at write time (`filaEventoDesde(..., new Date(ancla + indice))`) and `FilaEventoLeida = Omit<FilaEvento, "contratoId" | "registradoEn">` discards it on read. There is nothing to derive from, in memory or anywhere else.

**Decision.** `creadoEn` is the storage-assigned column `contratos.creado_en @default(now())` (`schema.prisma:199`) — a column no aggregate field mirrors and `filaContratoDesde` never writes. `ContratosEnMemoria` therefore takes on the same responsibility Postgres already has: it stamps `creadoEn` **on first insert only**, selected by `contrato.versionAlmacenada === VERSION_SIN_PERSISTIR` — the exact predicate `PrismaContratoRepository.guardar` uses to choose create over update — and never touches it again. `agregar(contrato, creadoEn?)` accepts an explicit instant so sort specs read as data; without one, an internal monotonic counter supplies strictly increasing instants, making insertion order the default order.

`creadoEn: Date` sits on the application read model `ResumenDeContrato`, so the ordering key is contractual and assertable with no database. It is **not** on the wire DTO: the settled row field list excludes it and widening the response is scope creep.

| Alternative | Why rejected |
|---|---|
| Derive from the `creado` event (proposal) | The field does not exist and is dropped on read. |
| Add `creadoEn` to `Contrato` + `rehidratar` + a `Reloj` in `CrearBorrador` | Puts a storage timestamp into the aggregate no domain rule reads, forces a clock into the one use case deliberately kept clock-free, and changes `EstadoPersistido` — a domain change to serve a list sort. |
| Sort by `id DESC` alone | `id` is a v4 UUID. "Newest first" would be random order. |
| Sort by `numero DESC` | Drafts have `numero = null`, which Postgres sorts FIRST under `DESC`. Every draft pins to the top. |

Sort stays `creadoEn DESC, id DESC`. The tiebreaker is not decoration: offset pagination over a non-total order can repeat or skip a row across a page boundary.

### D4 — `buscar` returns a read model on the aggregate's port

```ts
// ports/ContratoRepository.ts
export interface ResumenDeContrato {
  readonly id: string;
  readonly numero: number | null;
  readonly estado: EstadoContrato;
  readonly comodatarioNombreCompleto: string;   // display form, untouched
  readonly comodatarioDni: string;              // digits only, as stored
  readonly fechaFirma: FechaCalendario | null;
  readonly creadoEn: Date;                      // the ordering key
}

export interface CriteriosDeBusqueda {
  readonly termino: TerminoInterpretado | null; // already dispatched, never raw
  readonly estados: readonly EstadoContrato[];  // empty = every state
  readonly pagina: number;                      // 1-based
  readonly tamanoPagina: number;
}

export interface ResultadoDeBusqueda {
  readonly resumenes: readonly ResumenDeContrato[];
  readonly total: number;                       // untruncated, before paging
}

buscar(criterios: CriteriosDeBusqueda): Promise<ResultadoDeBusqueda>;
```

`TerminoInterpretado` is owned by `application/interpretarTerminoDeBusqueda.ts` (the module that produces it); the port imports the type.

- **Read model, not `Contrato`**: hydrating 20 aggregates to render five fields pulls every `firma`, `documento` and `evento` with them — slow, and a privacy over-fetch of exactly the evidence `vistas.ts:14-30` exists to keep server-side under Ley 25.326.
- **`fechaFirma` as `FechaCalendario`, not `Date`**: `fecha_firma` is `@db.Date` (`schema.prisma:168`). A raw `Date` off that column is a UTC-midnight instant that renders as the previous day in Argentina — the exact bug class `FechaCalendario` exists to prevent. The adapter reuses the tested `fechaCalendarioDesdeColumnaOrNull`.
- **DNI digits-only on the read model**: the dotted form is presentation. `vistaDeResumen` calls `Dni.crear(digitos).formateado`, reusing the tested formatter (`value-objects/Dni.ts:31`) instead of a second dotting rule.
- **Tradeoff accepted**: a read model on the aggregate's port is mild CQRS leakage. One method does not justify a second port and a second module wiring.

`BuscarContratos` stays a thin delegate in `ConsultarContrato`'s idiom: it calls `interpretarTerminoDeBusqueda` once and hands the interpreted criteria to the port, so neither adapter can reinterpret what the user typed.

### D5 — The search box searches for text, not for patterns

`interpretarTerminoDeBusqueda` removes `%`, `_` and `\` from the name term after normalizing it.

Without this, the two implementations disagree on the same input. Prisma's `contains` compiles to `LIKE '%' || $1 || '%'` — parameterized, so not an injection, but `%` and `_` **inside the value are still LIKE wildcards**, while `String.includes` in the double treats them literally. A user typing `a%z` gets Álvarez from Postgres and nothing from the double. Stripping in the pure interpreter keeps both sides identical, is unit-testable with no database, and needs no adapter-level escaping (Prisma's `contains` offers no `ESCAPE` hook). The DNI branch is inherently safe — it already reduces to digits.

Rejected: stripping inside `normalizarTexto` (that function is about case and diacritics; pattern-safety is "interpret what the user typed"), and escaping in the adapter (forces `$queryRaw` and puts a LIKE detail in the one place the double cannot mirror).

### D6 — `estados` is one comma-separated query parameter

`?estados=vigente,borrador`, parsed and validated by `EsquemaConsultaDeContratos` in `packages/esquemas/src/peticiones.ts` with `z.coerce.number()` for the numerics, defaults `pagina: 1` / `tamanoPagina: 20`, and `.max(100)` on `tamanoPagina`.

The over-max rule therefore lives in the shared schema and produces the existing 400 envelope through `ZodValidationPipe` — declared once, reusable by the web, and never silently clamped.

Rejected: repeated `?estado=a&estado=b` params. Express yields a string for one value and an array for two, so the schema needs a union and the classic "works with two filters, breaks with one" bug becomes available.

### D7 — Migration sequence, and what a running app sees

| Step | Action | What the running app sees |
|---|---|---|
| 1 | **Migration A**: `ADD COLUMN comodatario_nombre_busqueda text` (nullable) + `CREATE INDEX idx_contratos_comodatario_nombre_busqueda` | Postgres 11+ adds a nullable column with no default as metadata only — no rewrite, no long lock. Old code omits the column, Prisma inserts NULL, the nullable column accepts it. **That compatibility window is the entire reason A is nullable.** Plain `CREATE INDEX` takes a brief SHARE lock; `CONCURRENTLY` cannot run inside Prisma Migrate's transaction and is unwarranted on a few thousand rows. |
| 2 | Start the new API (same release as A) | Every insert and every update now writes the column (D2). New rows are correct from this instant. |
| 3 | **Backfill**: `pnpm --filter api backfill:nombre-busqueda` | Old rows still NULL until this runs. A name search under-reports in that window — harmless here, because no UI reaches the endpoint until PR #2 ships. Run it in the same maintenance window. |
| 4 | **Migration B** (follow-up release): `SET NOT NULL` | Gated on `SELECT count(*) … WHERE comodatario_nombre_busqueda IS NULL` returning 0. If a null survives, the migration aborts — a loud failure, which is the desired outcome. |

**B ships in a later release than A, not in PR #1.** `prisma migrate deploy` applies all pending migrations in one run, so A and B in the same release would execute B before the backfill and abort the deploy.

**Backfill script** — `apps/api/prisma/backfill/nombreDeBusqueda.ts`:

- Imports the real `normalizarTexto`. Never hand-written SQL, which would be a second implementation free to drift.
- Pages `WHERE comodatario_nombre_busqueda IS NULL ORDER BY id LIMIT 500`, updates by id. Idempotent and re-runnable; the `IS NULL` filter means it can never overwrite a value the live app just wrote.
- Uses parameterized `$executeRaw`, **not** `prisma.contrato.update`. Two reasons: `actualizadoEn` is `@updatedAt`, so Prisma would bump it and make every contract look edited today; and it must not touch `version`, or every in-flight optimistic lock would be invalidated into a spurious 409.
- Prints the remaining-null count on exit. That number is Migration B's gate.

**Rollback**: revert the code. The column is additive and nullable, so prior behaviour returns with no down-migration. Dropping the column is a separate, unhurried migration; leaving it costs one unused text column.

### D8 — One scenario table drives both implementations

`apps/api/src/contratos/application/escenariosDeBusqueda.testing.ts` exports two frozen tables:

- `SEMILLAS_DE_BUSQUEDA` — seed descriptors `{ id, nombreCompleto, dni, estado, creadoEn }`, including a `Núñez`, a `João`, a `Pérez`, a draft with `numero: null`, and two rows sharing a `creadoEn` to exercise the `id DESC` tiebreaker.
- `ESCENARIOS_DE_BUSQUEDA` — `{ nombre, criterios, idsEsperados, totalEsperado }[]`.

`BuscarContratos.spec.ts` (in-memory, no database) and `PrismaContratoRepository.integration.spec.ts` (real Postgres) both drive `it.each(ESCENARIOS_DE_BUSQUEDA)`. Seeding differs — one calls `agregar`, the other inserts rows — and the assertions are identical. Adding a scenario fails both suites until both implementations agree.

Honest limits: the table catches behavioural drift; `implements ContratoRepository` catches signature drift. Neither catches collation-dependent behaviour — but nothing here is collation-dependent. `LIKE` substring matching compares character sequences, not collation weights, and after D1 step 4 both sides compare canonical NFC. Collation affects only whether a prefix `LIKE` can use the btree, which is performance, not correctness.

A shared *harness* was rejected: it would hide the adapter-specific setup that is the most likely place for a real difference to live.

---

## Architecture Decisions — Web (PR #2)

### Retractions from revision 1

| Revision 1 claim | Status | Evidence |
|---|---|---|
| "A `<600px` card re-flow is unpaid complexity — the office is on desktop and `tecnico` is the only tablet role." | **Retracted.** The panel must work 360–1920px+, both ends real. | User constraint. |
| "A native checkbox box cannot be resized to 48px reliably across browsers, so labels carry the touch target." | **Retracted — factually wrong for this repo.** `base.css:81-86` already declares `input[type="radio"], input[type="checkbox"] { width: var(--tamano-toque-minimo); height: var(--tamano-toque-minimo); }` globally. Checkboxes here are already 48×48. | `apps/web/src/estilos/base.css:81-86` |
| "No responsive precedent to copy." | **Confirmed.** Zero `@media`, `@container`, `clamp()`, `minmax()` or `vw` anywhere in `apps/web/src`. | Repo-wide search, no matches. |

### D9 — `GuardiaDeRoles({ permitidos })` + pure `rutaInicialPara(rol)`

```tsx
export function GuardiaDeRoles({ permitidos }: { readonly permitidos: readonly Rol[] }) {
  const sesion = obtenerSesionActual();
  if (sesion !== null && !permitidos.includes(sesion.usuario.rol)) {
    return <Navigate to={rutaInicialPara(sesion.usuario.rol)} replace />;
  }
  return <Outlet />;
}
```

**Deliberately keeps the non-reactive `obtenerSesionActual()`.** `GuardiaDeSesion` above it is already reactive and owns session-death redirects; switching the role guard to `usarSesionActual()` while generalizing it would be an unrelated behaviour change smuggled into a refactor.

`apps/web/src/funcionalidades/auth/logica/rutaInicialPara.ts` — pure, no React, no router:

```ts
const INICIO_POR_ROL: Record<Rol, string> = {
  tecnico: "/", oficina: "/contratos", admin: "/contratos",
};
export function rutaInicialPara(rol: string): string {
  return INICIO_POR_ROL[rol as Rol] ?? "/panel-no-disponible";
}
```

`Record<Rol, string>` makes adding a role a compile error (exhaustiveness); the `??` makes the unknown-role fallback reachable and therefore testable, which is the guard's whole job. `PaginaLogin` navigates through the same helper so the landing is direct.

**Route tree:**

```
GuardiaDeSesion
├── /panel-no-disponible                    ← outside every role guard
├── GuardiaDeRolTecnico                    → /            (LayoutTablet)
└── GuardiaDeRoles ["oficina","admin"]     → /contratos   (LayoutPanel)
```

`/panel-no-disponible` stays a direct child of `GuardiaDeSesion`, outside both role guards. That placement is what prevents a redirect loop for an unknown role.

`GuardiaDeRolTecnico` survives as `() => <GuardiaDeRoles permitidos={["tecnico"]} />`, so its single call site compiles untouched and the tablet gating is byte-identical. Its redirect *target* for a non-tecnico intentionally moves from `/panel-no-disponible` to `rutaInicialPara(rol)` — that is the change, not a regression.

### D10 — `PanelNoDisponible` stays, with role-agnostic copy, in PR #2

It stops being oficina/admin's destination but remains `rutaInicialPara`'s unknown-role fallback. Deleting it leaves that branch pointing at nothing.

Copy: `"El panel de oficina no está disponible todavía."` → `"Todavía no hay un panel disponible para su rol."` `PanelNoDisponible.spec.tsx` asserts the exact string and changes in the same commit. This belongs to PR #2, not PR #1 — after PR #1 deploys the old copy is still true.

### D11 — First TanStack Query conventions (the pattern every later feature copies)

| Decision | Chosen | Rejected | Rationale |
|---|---|---|---|
| Key ownership | `clavesDeContratos` factory in `datos/consultas/` | inline array literals | `clavesDeContratos.todo` / `.lista(filtros)` gives hierarchical invalidation; no call site writes a string literal, which is how key drift starts |
| Key shape | `["contratos","lista",{termino,estados,pagina,tamanoPagina}]` | one flat string | TanStack hashes object keys deterministically regardless of property order |
| Debounce placement | `usarValorDebounced(termino, 300)` feeds the **key** | debounce inside the fetcher; an `enabled` gate | the input stays controlled and instantly responsive; only the key settles. Debouncing in the fetcher leaves a query in flight while the cache believes it is fresh. 300 ms is above inter-keystroke time, below the ~1 s "did it break" threshold |
| Debounce **flush** | `usarValorDebounced` returns `[valorDebounced, aplicarAhora]` | value-only return | **Changed in revision 2.** Enter in the search box must search *now*, not in 300 ms (D14). A value-only hook cannot express that |
| Page reset | reset `pagina` to 1 on the **raw** term/estados change | reset on the debounced value | resetting on the debounced value fires `{termino:new, pagina:5}` first — a wasted request and a flash of "no results" — before `{termino:new, pagina:1}` lands |
| `placeholderData` | `(anterior) => anterior` | library default | without it the table collapses to zero rows on every keystroke and page turn |
| `retry` | `queries.retry: 1`, set **globally** in `providers.tsx` | per-hook; library default 3 | `providers.tsx` already declares `mutations.retry:false` so retry policy is visible in exactly one file. Leaving `queries` implicit means every future query silently inherits 3 |
| `staleTime` | `30_000`, **per-hook** | global | staleness is a property of *this* data. A future signing-status query would want 0 |
| Response parsing | none — `clienteHttp<DatosListaContratos>` | `EsquemaListaContratos.parse(...)` | matches `obtenerContrato.ts` exactly; runtime response parsing is a repo-wide convention change |
| Error surface | `ErrorDeApi` → Spanish copy + in-place retry | Toast | a failed list is a state of the screen, not a transient notification. `base.css:70-79` already styles every `[role="alert"]` as a bordered block with its retry control visually bound to it — inherited free |

Hooks live at `funcionalidades/contratos/usar*.ts`, mirroring `funcionalidades/auth/usarSesionActual.ts`.

Three separately tested states, all Spanish: loading (`Spinner`); `"Todavía no hay contratos cargados."`; `"No hay contratos que coincidan con la búsqueda."` Collapsing the last two makes "no results" read as "the system is broken".

### D12 — Table layout across 360–1920px: CSS-only reflow, one DOM tree

**Chosen: a real `<table>` at ≥640px; below 640px the same markup reflows to stacked cards via CSS.** No horizontal scroll as the primary strategy, no hidden columns, no second DOM tree.

| Option | Verdict |
|---|---|
| Horizontal scroll on a bounded `overflow-x: auto` region | **Rejected as the primary strategy.** Guard-legal, but scanning is a *vertical* activity — the office typed a name and is looking down a column of names. Horizontal scroll forces a per-row horizontal movement to compare a name (left) against its estado (right), and the header scrolls out of view. Kept only as the mid-range safety net (below). |
| Column priority / progressive disclosure (hide `fechaFirma`, then `numero`) | Rejected. Hiding `numero` removes the identifier the office uses to *refer* to a contract, and silently dropping data is its own failure. |
| **Card/list reflow below 640px** | **Chosen.** Keeps vertical scanning at every width, hides nothing, and matches how the same five fields read on a phone. |

**Mechanism — one DOM tree, not two.** The component always renders semantic table markup with explicit `role="table" / "row" / "columnheader" / "cell"` attributes and a `data-etiqueta` on every cell carrying its column's Spanish label. Below 640px the CSS sets `display: block` on the table elements and reveals the label via `td::before { content: attr(data-etiqueta); }`.

- Explicit ARIA roles are **required**, not decorative: `display: block` on table elements destroys the implicit table semantics in several screen readers. Restating the roles is the documented fix.
- `data-etiqueta` is markup, so jsdom can assert every cell carries the right label even though it cannot assert the reflow happened (D16).
- Two DOM trees toggled by CSS was rejected: two sources of truth for the same row, and jsdom cannot tell which one is visible, so tests would silently assert against the wrong one.

**Mid-range safety net.** Between 640px and roughly 900px a real table with five columns can still overrun. The table stays inside `.tabla-de-contratos__desplazamiento { overflow-x: auto; }` — legal, because `convencionesDeEstilos.spec.ts:52` bans only the *values* `hidden|clip` (`/overflow(?:-y|-x)?\s*:\s*(hidden|clip)\b/i`), never `auto`. That region carries `role="region"`, `aria-label` and `tabIndex={0}`.

`tabIndex={0}` is unconditional even though the region often does not scroll. A scrollable container that cannot receive focus is an actual WCAG 2.1.1 failure; a focusable container that happens not to scroll is one harmless extra tab stop. The harmless side is the correct one to err toward, and conditional focusability would require JS measurement the component has no business doing.

### D13 — Breakpoints and typography: establishing the convention

No precedent exists — confirmed, not assumed: zero `@media`, `@container`, `clamp()`, `minmax()` or `vw` anywhere in `apps/web/src`. This sets the convention, so it is treated like the TanStack decisions rather than as incidental CSS.

| Decision | Value | Rationale |
|---|---|---|
| Number of breakpoints | **Two**: 640px and 1024px | Two is enough for one screen with two layouts plus a comfort width. Every additional breakpoint is a state nobody tests. |
| Direction | **Mobile-first `min-width` only.** No `max-width` queries anywhere. | Mixing directions is how overlapping bands and specificity fights start. The base stylesheet is the narrow layout; each query adds. |
| Where the values live | Documented as named constants in a comment header in `tokens.css`, repeated literally in the queries | **CSS custom properties are invalid inside media conditions** — `@media (min-width: var(--x))` does not work. This is a language limitation, not a style choice, and it is the reason a breakpoint cannot be a `--var` token like every other value in this file. |
| Sprawl control | A source-scan spec asserts `estilos/` declares exactly these two breakpoint values and no others | The repo's own idiom (`convencionesDeEstilos.spec.ts`, `convencionDeCapas.spec.ts`). Without it, breakpoint three appears in the next feature and nothing notices. |
| Container queries | **Rejected for now** | `@container` is semantically better here — the table should reflow on *its own* width, not the viewport's — but establishing two new responsive conventions at once for one screen is not warranted. `container-type: inline-size` does not set `overflow: hidden`, so the guard leaves the door open. |

**Shell.** A new `componentes/plantillas/LayoutPanel.tsx` + `.layout-panel__contenido { max-width: 1280px; margin: 0 auto; }`. `LayoutTablet` is **not** modified or reused: its name declares a device assumption, its `max-width: 720px` (`organismos.css:126`) would waste 60% of a 1920px monitor, and it has its own spec plus a técnico flow depending on it. A sibling template is zero-risk.

The 1280px cap is deliberate rather than full-bleed: stretched to 1920px, a row's name and its estado sit ~1800px apart and the eye loses the line. 1280px still uses far more monitor than 720px while keeping a row scannable in one fixation sweep.

**Type size.** `.layout-panel` rebinds `--fuente-base: 16px` for its subtree **and reads it back with `font-size: var(--fuente-base)` on the same rule**. The `:root` value stays 18px, so the tablet is untouched, and every atom inside the panel (`.boton`, `.campo-texto`, `.etiqueta` all read `var(--fuente-base)`) becomes consistent automatically — that is why this is a scoped token rebind rather than a parallel `--fuente-panel` token no atom reads.

The read-back is not redundant. See "Correction — the rebind was inert for inherited text" below; the original design shipped the rebind alone and it only ever reached the atoms.

The justification is **viewing distance, not density**: `tokens.css:39-40` documents 18px as "assumes a tablet held at arm's length, not read up close". A desktop monitor at 50–70cm with an operator reading for hours wants the 16px browser default that user zoom is calibrated around. We do not go below 16px. Density is explicitly **not** the reason, which is just as well — see the correction below, where the density claim is retracted too.

A source-scan assertion pins `:root --fuente-base` at 18px so nobody later "fixes" the panel by shrinking the tablet.

#### Correction — the rebind was inert for inherited text (2026-08-14)

**The decision stands; the implementation did not implement it.** For the whole life of this feature the office panel rendered its prose and its table at 18px, the tablet value D13 exists to move away from.

`base.css:40` declares `body { font-size: var(--fuente-base) }`. That `var()` is resolved **on `body`**, which is an *ancestor* of `.layout-panel`. Rebinding a custom property on a descendant cannot retroactively change a value already computed further up the tree, so `body`'s 18px computed font-size stood and every element in the panel that merely *inherits* its size inherited 18px.

What the rebind did reach were the atoms that read `var(--fuente-base)` in **their own** rule (`atomos.css:22, 79, 91` and `panel.css`'s form field). Those did resolve the panel-scoped 16px. So the panel was not "18px throughout" and not "16px throughout" — it was **split across two type sizes**, which is worse than either and is the thing nobody noticed for the same reason the inert rule read as a working one.

Measured in Chrome (`--fuente-base` rebind only, no read-back), at 360, 1366 and 1920px wide:

| Element | Before | After |
|---|---|---|
| `.layout-panel` computed | 18px | **16px** |
| `td` (data cell) | 18px | **16px** |
| `td::before` (narrow-layout column label) | 18px | **16px** |
| `dd`, `.detalle-contrato__evento-*` | 18px | **16px** |
| `.tabla-de-contratos__enlace` (row link) | 18px | **16px** |
| `th` at <640px | 18px | **16px** |
| `.boton`, `.campo-texto`, `.etiqueta` | 16px | 16px (unchanged — these already saw the rebind) |
| `th` at ≥640px, `h1`, `.insignia-estado`, `p[role="status"]` | 12/28/13/15px | unchanged (`rem`-based; `rem` resolves against `html`, never against `.layout-panel`) |

**Fix:** one declaration, `font-size: var(--fuente-base)`, on `.layout-panel` itself. Read back on the element that declares it, the property re-resolves to 16px there and the whole subtree inherits one base. The alternative — deleting the rebind and accepting 18px — was rejected: it would have meant *widening* the split (the atoms would have stayed at their own 16px unless `atomos.css` changed too, which is shared with the tablet), retiring a decision whose viewing-distance rationale is unchallenged, and deleting a guard for a rule that was never actually tried.

`convencionesDeEstilos.spec.ts` now asserts the read-back as well as the rebind. The old assertion checked only that the declaration existed, which is precisely the check an inert declaration passes.

**Retracted: "roughly one extra row per screen."** Measured at 1366×768 the row height is **73.5px before and after** — unchanged. Since PR #69 the row is set by `.tabla-de-contratos__enlace`'s 48px touch-target floor plus cell padding, not by the text, so shrinking the type buys no rows at all on desktop. The narrow card does shrink, 249.1px → 232.1px at 360px. The density argument was never the justification (see above) and is now known to be false for the desktop case; viewing distance remains the whole reason.

Re-checked after the change, at 360px: document `scrollWidth === clientWidth === 360` (no horizontal scroll, R-3.6), no cell where `scrollWidth > clientWidth`, and every interactive control still at or above the 48px floor — smaller text cannot shrink a box whose `min-height` is `var(--tamano-toque-minimo)`, and no measured target moved. The two 0×0 boxes the sweep reports at 360px are `.paginador__numeros`' page buttons, `display: none` by D16, before and after alike.

### D14 — The 48px minimum, row density, and what the guard actually says

**Exactly what `convencionesDeEstilos.spec.ts:110-139` asserts, verified:**

1. The `.boton` rule **in `estilos/atomos.css`** declares `min-height` *and* `min-width` as either `var(--tamano-toque-minimo)` or a literal ≥48px.
2. `--tamano-toque-minimo` **in `estilos/tokens.css`** is ≥48px.

That is the entire scope. It is **scoped to the `.boton` atom and the token's value** — it says nothing about rows, links, inputs, or checkboxes. Separately, `base.css:81-86` sizes every checkbox and radio to 48×48 globally; that is a project convention, not a guard.

**Decision: the guard is not weakened, not scoped, not touched.** Consequences, taken deliberately:

| Control | Outcome |
|---|---|
| Paginator buttons | Render through `Boton` → 48×48 minimum. Large for a mouse, but it is one control row per page, costing ~72px of vertical space once. Accepted. |
| Search input | `CampoTexto` → `min-height: 48px`. Correct on a search-first screen anyway. |
| **Table rows** | **Exempt, and legitimately so.** Rows are not clickable (settled decision), contain no controls, and are not focus targets. A 48px *touch-target* minimum applies to targets; a non-interactive row is not one. Row height is therefore free to be density-optimized without any guard interaction. |
| **`estado` filter** | Rendered as a group of toggle **buttons** with `aria-pressed`, inside `role="group" aria-label="Filtrar por estado"` — **not** checkboxes. |

The estado decision is the one real conflict the constraint surfaced. Four checkboxes at the globally-mandated 48×48 make a filter bar that is mostly checkbox. The options were: accept it; override the global rule for this screen (creating a checkbox that behaves unlike every other checkbox in the app, and edging toward weakening a convention); or reuse the `Boton` atom, which already satisfies the guard, as filter chips. Toggle buttons win because they sidestep the global rule instead of fighting it, give one uniform control height across the whole bar, wrap naturally at narrow widths since `.boton` is `inline-flex`, and expose `aria-pressed` — which jsdom can assert directly. Honest tradeoff: a `<fieldset>` of checkboxes is the more conventional multi-select semantic; `role="group"` plus `aria-pressed` is the accepted filter-chip alternative and is what the existing atom supports.

**Row density, measured.** At 16px/1.5 (24px line) + `--espacio-2` (8px) padding top and bottom + 1px border = **41px per row**. Screen furniture totals ~337px (header 56 + search/filter bar 104 + count line 32 + table header 41 + paginator 72 + shell padding 32).

| Viewport | Approx. content height | Rows visible without scrolling |
|---|---|---|
| 1366×768 | ~700px | **8** |
| 1440×900 | ~832px | **12** |
| 1920×1080 | ~1012px | **16** |

**A 20-row page therefore never fits entirely, even on 1080p.** That is an honest consequence, not a defect to hide, and it drives two things: the result count sits **above** the table so it is readable without scrolling, and vertical page scroll is the expected interaction. The default page size stays 20 — it is settled and backend-side.

A sticky paginator (`position: sticky; bottom: 0` — legal, no `overflow: hidden` involved) was rejected: it permanently spends ~72px of the vertical space just optimized, on every screen, to save one scroll gesture.

### D15 — Mouse and keyboard: what the tablet UI never needed

**Focus is already solved and needs no new CSS.** `base.css:55-58` declares `:focus-visible { outline: 3px solid var(--color-foco); outline-offset: 2px; }` globally. Every control on the panel, including the `tabIndex={0}` scroll region, inherits a visible ring. Stated as evidence rather than re-specified.

| Concern | Decision |
|---|---|
| Tab order | DOM order only: search box → estado toggles → scroll region → prev → page numbers → next. **No positive `tabIndex` anywhere**; the sole explicit value is `tabIndex={0}` on the scroll region. A spec asserts no element carries `tabIndex > 0`, because a positive tabindex silently reorders the whole document. |
| Hover | `.boton:hover` already exists (`atomos.css:27`). New: row hover tint plus `tr:nth-child(even)` zebra striping. This is the one genuinely desktop-only addition — on a wide row the eye loses its line between the name on the left and the estado on the right, and striping is the standard fix. Deliberately a background tint only: **no pointer cursor, no underline**, because rows are not clickable and must not pretend to be. |
| **Enter in the search box** | **Flushes the debounce immediately.** The input sits in `<form role="search" onSubmit={…}>`; submit calls `preventDefault()` then `aplicarAhora()`. Without a form, Enter would do nothing at all and a keyboard operator gets no acknowledgement; with a form and no handler, Enter triggers a full page reload. This is why `usarValorDebounced` returns a flush function (D11). |
| Escape in the search box | Clears the term. One line in the container, jsdom-testable, and it saves an all-day operator a select-all-delete on every new lookup. |
| Screen-reader announcement | The result count line (`"4 contratos"`) is `role="status"` — the **single** live region on this screen. `organismos.css:154-163` documents the existing rule that a Spinner beside a live region must be `aria-hidden` so nothing is announced twice; this screen follows it exactly. Without a live region, a sighted user sees the table change after a search and a screen-reader user gets silence. |

### D16 — Paginator density: CSS-only adaptation, both controls always in the DOM

`Paginador` always renders prev/next **and** the numbered page list. Below 640px the numbered list is `display: none`.

Rejected: a `modo: "numerado" | "compacto"` prop. It would force the container to read the viewport via `matchMedia`, which means a jsdom stub in every test and a presentational concern promoted into a container for no behavioural gain. The CSS-only version keeps `Paginador` a pure props component.

Consequences, stated plainly: prev/next is reachable at every width, so nothing is ever unusable; narrow viewports lose jump-to-page, which is acceptable because the search box is the narrow workflow; and because `display: none` also removes the numbers from the accessibility tree, a screen reader at narrow width hears exactly what is visible. A plain `display: none` carries no `!important`, so it does not affect the guard that counts `!important` display declarations (`PATRON_DISPLAY_IMPORTANT`, which must stay at exactly 1).

---

## Data Flow

```
GET /contratos?termino=&estados=&pagina=&tamanoPagina=
        │
   ZodValidationPipe(EsquemaConsultaDeContratos)   ← 400 on tamanoPagina>100
        │
   ContratosController.listar   @Roles("oficina","admin")   ← 403 for tecnico
        │
   BuscarContratos.ejecutar
        │  interpretarTerminoDeBusqueda(termino)   ← normalizarTexto + wildcard strip
        │  → {tipo:"dni",digitos} | {tipo:"nombre",normalizado} | null
        ▼
   ContratoRepository.buscar(criterios) ──┬── PrismaContratoRepository (Postgres)
        │                                 └── ContratosEnMemoria   (specs, no DB)
        │  both: filter estados → match term → sort creadoEn DESC,id DESC
        │        → slice page → count total
        ▼
   ResultadoDeBusqueda { resumenes, total }
        │
   vistaDeListaContratos → { elementos, total, pagina, tamanoPagina }

WRITE PATH (the other half of the same rule)
   Contrato ──filaContratoDesde──► FilaContrato
                 │ comodatarioNombreBusqueda = normalizarTexto(nombreCompleto)
                 └─► create / updateMany  (both spread ...fila)

WEB — one markup, two layouts
   PaginaListaContratos (container: query, debounce+flush, filters, page reset)
        │ props only
        ├─ BarraDeBusqueda  <form role="search">  + estado toggles (aria-pressed)
        ├─ TablaDeContratos  role=table/row/cell + data-etiqueta on every cell
        │        ≥640px → real table inside overflow-x:auto region
        │        <640px → same DOM, display:block, td::before shows data-etiqueta
        └─ Paginador  prev/next always · numbers display:none below 640px
```

---

## File Changes

### PR #1 — API + schemas (~1,200 lines, independently deployable)

| File | Action | What |
|---|---|---|
| `apps/api/src/shared/domain/normalizarTexto.ts` (+`.spec.ts`) | Create | D1 |
| `apps/api/src/contratos/application/interpretarTerminoDeBusqueda.ts` (+spec) | Create | dispatch + wildcard strip (D5); owns `TerminoInterpretado` |
| `apps/api/src/contratos/application/ports/ContratoRepository.ts` | Modify | `buscar` + D4 types |
| `apps/api/src/contratos/application/BuscarContratos.ts` (+spec) | Create | thin delegate |
| `apps/api/src/contratos/application/escenariosDeBusqueda.testing.ts` | Create | D8 shared tables |
| `apps/api/src/contratos/application/dobles.testing.ts` | Modify | real `buscar`; `creadoEn` stamping; `agregar(contrato, creadoEn?)` |
| `apps/api/src/contratos/application/FirmarContrato.spec.ts` | Modify | **compile break**: its local `ContratosEnMemoria implements ContratoRepository` (line 80) needs a throwing `buscar` |
| `apps/api/src/contratos/infrastructure/mappers/ContratoMapper.ts` (+spec) | Modify | D2 |
| `apps/api/src/contratos/infrastructure/PrismaContratoRepository.ts` | Modify | `buscar` |
| `apps/api/src/contratos/infrastructure/PrismaContratoRepository.integration.spec.ts` | Modify | D8 table + backfill correctness |
| `apps/api/prisma/schema.prisma` | Modify | column + index |
| `apps/api/prisma/migrations/*_contratos_nombre_busqueda/migration.sql` | Create | Migration A |
| `apps/api/prisma/backfill/nombreDeBusqueda.ts` | Create | D7 |
| `apps/api/package.json` | Modify | `backfill:nombre-busqueda` script |
| `apps/api/src/contratos/interface/ContratosController.ts` (+ new spec) | Modify | `GET /contratos` |
| `apps/api/src/contratos/interface/dto/vistas.ts` (+spec) | Modify | `vistaDeResumen` / `vistaDeListaContratos` |
| `apps/api/src/contratos/ContratosModule.ts` | Modify | wire `BUSCAR_CONTRATOS` |
| `packages/esquemas/src/peticiones.ts` | Modify | `EsquemaConsultaDeContratos` |
| `packages/esquemas/src/respuestas.ts` | Modify | `EsquemaContratoResumen`, `EsquemaListaContratos` |

Follow-up release: `apps/api/prisma/migrations/*_nombre_busqueda_not_null/migration.sql` (Migration B).

`packages/esquemas` may import only `"zod"` and relative specifiers (`paqueteNavegable.spec.ts`), so the new schemas inline what they need.

### PR #2 — Web (~1,250 lines, consumes PR #1)

| File | Action | What |
|---|---|---|
| `funcionalidades/auth/logica/rutaInicialPara.ts` (+spec) | Create | D9 |
| `funcionalidades/auth/contenedores/GuardiasDeRuta.tsx` | Modify | `GuardiaDeRoles`; `GuardiaDeRolTecnico` becomes a wrapper |
| `funcionalidades/auth/contenedores/PanelNoDisponible.tsx` (+spec) | Modify | D10 copy |
| `funcionalidades/auth/contenedores/PaginaLogin.tsx` | Modify | land via `rutaInicialPara` |
| `rutas/rutas.tsx` (+ new `rutas.spec.tsx`) | Modify | `/contratos` |
| **`componentes/plantillas/LayoutPanel.tsx`** (+spec) | **Create** | **D13** — desktop shell; `LayoutTablet` untouched |
| `datos/consultas/clavesDeContratos.ts` | Create | key factory |
| `datos/consultas/buscarContratos.ts` (+spec) | Create | mirrors `obtenerContrato.ts` |
| `funcionalidades/contratos/usarValorDebounced.ts` (+spec) | Create | returns `[valor, aplicarAhora]` (D11/D15) |
| `funcionalidades/contratos/usarBusquedaDeContratos.ts` (+spec) | Create | D11 |
| `funcionalidades/contratos/logica/paginacion.ts` (+spec) | Create | `totalPaginas`, off-by-one in one pure place |
| `funcionalidades/contratos/contenedores/PaginaListaContratos.tsx` (+spec) | Create | query, debounce+flush, filters, page reset, Escape |
| `componentes/organismos/TablaDeContratos.tsx` (+spec) | Create | roles + `data-etiqueta`, one DOM tree (D12) |
| `componentes/moleculas/BarraDeBusqueda.tsx` (+spec) | Create | `<form role="search">` + estado toggles (D14) |
| `componentes/moleculas/Paginador.tsx` (+spec) | Create | prev/next + numbers (D16) |
| `app/providers.tsx` | Modify | `queries.retry: 1` |
| `estilos/tokens.css` | Modify | breakpoint constants documented in a comment header (D13) |
| **`estilos/panel.css`** | **Create** | panel shell, table, reflow, filter bar, paginator — all responsive rules in one file |
| `estilos/index.css` | Modify | import `panel.css` |
| `estilos/convencionesDeEstilos.spec.ts` | Modify | new responsive-convention assertions (D17) |

**Layer guard.** `convencionDeCapas.spec.ts:45` matches by substring on the import specifier, so a presentational component cannot import even a TypeScript *type* from `datos/`. Row props are typed from `@contratos/esquemas` (`DatosContratoResumen`), which is allowed. `LayoutPanel`, `TablaDeContratos`, `BarraDeBusqueda` and `Paginador` all live under `componentes/` and import nothing from `datos/`, `@tanstack/react-query` or `almacenamiento/`.

---

## D17 — Testing Strategy, with an honest jsdom boundary

The existing guard spec states the constraint outright: *"jsdom performs no layout, and Vitest does not load real stylesheets into a document during a test run, so none of the invariants below can be asserted by rendering."* That is taken at face value rather than worked around.

**Assertable in jsdom (RTL) — real coverage:**

| Seam | Assertion |
|---|---|
| Table markup | `getByRole("table")`, `getAllByRole("row")` count, explicit `role` attributes present on every table element |
| Reflow labels | every cell carries a `data-etiqueta` equal to its column header — the *markup* the reflow depends on |
| Search form | `role="search"`; `fireEvent.submit` updates the query key **without advancing fake timers** (proves the flush) |
| Escape | clears the term |
| Estado filter | toggles expose `aria-pressed`; `getByRole("button", { pressed: true })`; group has an accessible name |
| Scroll region | has `role="region"`, an `aria-label`, and `tabIndex=0` |
| Tab order | DOM order matches the intended order; **no element has `tabIndex > 0`** |
| Paginator | prev/next and numbers all render; prev disabled on page 1, next disabled on the last page |
| Live region | count line is `role="status"`; the Spinner inside it is `aria-hidden` |
| States | loading, both distinct empty states, error state with its retry control |

**Not assertable in jsdom — and not pretended to be:**

- that the card reflow actually happens below 640px (no layout, no media-query resolution, no stylesheet loaded)
- row pixel heights or the rows-visible counts in D14
- whether `overflow-x: auto` actually scrolls
- focus-ring appearance, hover styling, zebra striping

**Covered instead by source-scanning CSS specs** — the repo's own established idiom (`convencionesDeEstilos.spec.ts`, `convencionDeCapas.spec.ts`, `paqueteNavegable.spec.ts`), extended with:

1. `estilos/` declares exactly the two documented breakpoints (640, 1024) and no others — the anti-sprawl assertion that makes D13 a convention rather than a suggestion.
2. Every media query in `estilos/` is `min-width`; no `max-width` query exists.
3. `.layout-panel` rebinds `--fuente-base` to a value ≥16px, and `:root --fuente-base` is still 18px.
4. The three existing guards keep passing unchanged: no `overflow: hidden|clip` anywhere; exactly one `!important` display declaration; `.boton` and `--tamano-toque-minimo` still ≥48px.

Backend layers are unchanged from revision 1:

| Layer | What | DB? | Browser? |
|---|---|---|---|
| Unit | `normalizarTexto` (D1's seven cases, `ñ` NFC≡NFD), `interpretarTerminoDeBusqueda`, `rutaInicialPara`, `paginacion` | no | no |
| Application | `BuscarContratos` over `ContratosEnMemoria`, driven by `ESCENARIOS_DE_BUSQUEDA` | no | no |
| Interface | `tecnico` → 403, `tamanoPagina=101` → 400, response carries no address/phone/equipment/signature/context | no | no |
| Mapper | `filaContratoDesde` writes `normalizarTexto(nombre)`; a name change rewrites it | no | no |
| Integration | `PrismaContratoRepository.buscar` over the **same** scenario table; backfill; `ñ` round-trip | yes | no |

Strict TDD: every row is a RED test before its production file exists.

---

## Threat Matrix

| Boundary | Applicability | Reason |
|---|---|---|
| Documentation-like paths | N/A | No file-classification or execution-by-extension decision. |
| Git repository selection | N/A | No `git` invocation, no cwd authority. |
| Commit state | N/A | No index or worktree manipulation. |
| Push state | N/A | No ref resolution. |
| PR commands | N/A | No PR automation; delivery is two ordinary human-authored PRs. |

The change's real boundaries are HTTP role authorization and a database migration, neither covered by this matrix. They are handled by D6/D9 (roles, tested as 403/redirect cases) and D7 (rollout), and by D5 for the LIKE-metacharacter surface — parameterized throughout, so the wildcard question is correctness, never injection.

---

## Migration / Rollout

See D7. Ordered: **Migration A + new API (one release) → backfill → Migration B (later release)**. Single-instance VPS deploy means there is no simultaneous old/new code window, only old *rows* — and the nullable column absorbs those. Rollback is a code revert with no down-migration.

PR #2 has no migration and no data. Rollback is a revert: `rutas.tsx` returns to the two-guard tree and oficina/admin land back on `PanelNoDisponible`.

---

## Open Questions

- [ ] Nothing blocks implementation. Deliberately noted, not asked: a `borrador` row shows no date at all (`fechaFirma` is null and `creadoEn` is intentionally off the wire per D3). If the office asks "when was this loaded", exposing `creadoEn` on the DTO is a one-field follow-up.
- [ ] The 360px floor is designed for and CSS-covered, but cannot be verified by any automated test in this stack (D17). It needs one manual check at a narrow width before PR #2 merges.
