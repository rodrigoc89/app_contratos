# Proposal: Contract list and search for the office panel

## Intent

`oficina` and `admin` log in successfully and land on `PanelNoDisponible` — a working login that reads as a broken product. There is no way to answer the daily question "does this customer have a contract, and what state is it in?" without opening the database. This change gives the office a searchable, filterable, paginated contract list, and gives those two roles a real route tree for the first time.

Success: an office user types a surname or a DNI, filters by `estado`, and finds the contract in one screen — with accents and casing not mattering, and no Postgres extension added to the VPS deploy.

## Settled decisions (from the user — not re-opened here)

| Decision | Value |
|---|---|
| Search fields | comodatario name and DNI only, one single box |
| Access | `oficina` + `admin`; `tecnico` excluded entirely, tablet flow untouched |
| Row visibility | `oficina`/`admin` see ALL contracts, unscoped |
| `estado` filter | In scope, all four states |
| Accent/case handling | Persisted normalized column, computed in the application layer, own index, no `unaccent`/`pg_trgm` |

**Row-visibility scope note.** `ContratosController.ts:207-215` flags DESIGN.md §9 ("the technician sees only their own contracts") as unenforced and deferred. This change does NOT resolve that. It grants unscoped visibility to `oficina`/`admin` only, because those two roles are the office and the office is meant to see everything. `tecnico` is excluded from this endpoint entirely, so §9 remains open and unaffected. Do not generalize this unscoped decision to `tecnico`.

## Scope

### In scope

- `GET /contratos` — `@Roles("oficina", "admin")`, term + `estado` filter + pagination.
- `buscar(criterios)` on `ContratoRepository`, its Prisma implementation, and a real (not stubbed) `ContratosEnMemoria` implementation.
- `BuscarContratos` use case following `ConsultarContrato`'s thin-delegate idiom.
- `normalizarTexto` — pure, dependency-free, unit-testable with no database.
- `comodatario_nombre_busqueda` column, index, write-path population, and a backfill.
- New narrow list-row and paginated-envelope schemas in `packages/esquemas`.
- Generalized allowed-roles route guard, `/contratos` route, list screen.
- First TanStack Query hook in the repo, plus the key/debounce/state conventions it establishes.

### Out of scope (explicit non-goals)

- Antenna MAC search.
- Contract `numero` search.
- The outstanding-equipment report (`estado = dado_de_baja AND fecha_restitucion IS NULL`).
- Lifecycle writes: `darDeBaja`, `anular`, `registrarRestitucion` (issue #65).
- An office-facing contract **detail screen**; rows are identification-only, not clickable (see question 1).
- Enforcing DESIGN.md §9 technician row-scoping.
- Configurable sort order.
- Export (CSV/PDF) of results.
- Any change to the `tecnico` tablet flow.

## Capabilities

### New Capabilities

- `contratos-busqueda`: server-side contract list, term search over comodatario name/DNI, `estado` filter, pagination, and the narrow list-row response contract.
- `busqueda-normalizacion`: the pure text-normalization rule (case folding, diacritic folding) shared by the write path, the query path, the backfill, and the in-memory double.
- `web-panel-oficina`: the `oficina`/`admin` route tree, role-home resolution, and the contract list screen.
- `web-consultas-tanstack`: the repo's first TanStack Query conventions — query-key factory, debounce placement, retry/stale policy, and loading/empty/error states.

### Modified Capabilities

- `web-auth-session`: role gating stops meaning "tecnico or bust". `GuardiaDeRolTecnico`'s hard redirect of every non-`tecnico` role to `/panel-no-disponible` becomes a role-to-home resolution.

## Approach

### 1. Normalization is a pure function, not a database feature

`normalizarTexto(valor)` lives in `apps/api/src/shared/domain/`. It lowercases, folds diacritics via NFD + combining-mark strip, and collapses whitespace. It has no imports, no I/O, and its spec runs with no database and no browser — this is the hard requirement from `CLAUDE.md`, and it is also what lets one single rule govern four call sites that would otherwise drift: the Prisma write mapper, the search query, the backfill script, and `ContratosEnMemoria`.

**Ñ folding: yes, `ñ → n`.** Office staff type without diacritics, and "Nunez" must find "Núñez". The column is a search key, never a display value — `comodatarioNombreCompleto` remains the untouched source of truth for anything a human reads or a contract prints. This is a deliberate, tested case, not an accident of the NFD strip.

### 2. One box, two queries — dispatch on the term's shape

`interpretarTerminoDeBusqueda(termino)` is a second pure function returning either `{ tipo: "dni", digitos }` or `{ tipo: "nombre", normalizado }`.

- If the term is only digits after stripping dots, spaces and dashes → **DNI prefix match**. `comodatario_dni` already stores digits only (`Dni.ts`; the dotted form exists only in the DTO), so "30.123.456", "30123456" and "30 123" all reach the same column. Prefix, not exact, because staff read a DNI off a form and type the first digits.
- Otherwise → **name substring match** on the normalized column.

A name can never be all digits, so the dispatch loses nothing. It also keeps each query to a single predicate over a single column instead of an `OR` across two, which is both faster and far easier to reason about.

### 3. Honest note on what the index buys

The task settles that the normalized column gets its own index; this proposal honors that. It should also be honest about what it does:

| Query | Index used? |
|---|---|
| `estado` filter | Yes — `idx_contratos_estado` exists |
| DNI prefix | Only with a `text_pattern_ops` btree; the existing `idx_contratos_comodatario_dni` serves exact match, not `LIKE 'x%'`, under a non-C collation |
| Name substring (`LIKE '%x%'`) | **No** — a leading wildcard cannot use a btree at all |

At the stated scale (~1000 customers, low thousands of contracts) a sequential scan with a `LIKE` is sub-millisecond, so this is a correctness win, not a performance one: the column's real job is making search accent- and case-insensitive **without an extension**. The index is added because prefix-anchored queries and future growth use it, and because it is cheap.

Escape hatch if scale ever demands it: Postgres full-text search (`to_tsvector`/GIN) is **core Postgres, not an extension**, so it stays available without violating the no-extension constraint. `pg_trgm` remains rejected.

### 4. Pagination: offset, 20 default, 100 hard max

| Option | Verdict |
|---|---|
| Cursor | Rejected. Its advantage is deep offsets and stable feeds. Neither applies: the deepest realistic page over ~3,000 rows is ~150 pages, and `OFFSET 3000` on that table is trivial. It costs opaque cursor encoding and forbids jump-to-page and a total count — both of which the office actually wants ("hay 4 contratos") |
| **Offset/limit** | **Chosen.** Matches the scale, gives `total`, gives page numbers, is the simplest thing that works |

Default 20, hard max 100. A `tamanoPagina` above 100 is **rejected with 400**, not silently clamped — silent clamping makes a client that asks for 500 and gets 100 look like data loss.

`COUNT(*)` runs alongside the page over a few thousand rows: sub-millisecond, and it is what makes the result count honest.

### 5. Sort: `creadoEn DESC, id DESC`, not configurable

Newest first is what "what did we sign lately" wants. The `id DESC` tiebreaker is **not decoration**: offset pagination over a non-unique sort key can show or skip a row across page boundaries, so the ordering must be total.

`numero DESC` was rejected — drafts have `numero = null` and would sort to the top under Postgres' `NULLS FIRST` default for `DESC`.

Configurable sort is a non-goal: it multiplies the query surface, the DTO and the test matrix for a need nobody has stated yet.

**Wrinkle to resolve in design:** the `Contrato` aggregate has no `creadoEn` getter. The Prisma adapter reads `creado_en`; `ContratosEnMemoria` must derive the same ordering from the `creado` event's `registradoEn` (the first event, always present from `crearBorrador`). The read model therefore carries `creadoEn` explicitly, so the ordering key is part of the contract rather than an implicit detail each implementation guesses at.

### 6. Response shape: a deliberately narrower row

`DatosContratoDetalle` is **not** reused. `apps/api/src/contratos/interface/dto/vistas.ts:14-30` documents that mapper as a privacy boundary under Ley 25.326: personal data leaves the server only when a screen needs it. A list row needs to *identify* a contract, not describe it.

New `EsquemaContratoResumen` / `DatosContratoResumen`:

| Field | Why it is there |
|---|---|
| `id` | The handle for any future action |
| `numero` (`number \| null`) | How the office refers to a contract; null is the honest signal for a `borrador` |
| `estado` | The primary thing being filtered on |
| `comodatario.nombreCompleto` | The thing being searched for |
| `comodatario.dni` (dotted) | Confirms which "Pérez" this row is — the whole point of a DNI search |
| `fechaFirma` (`string \| null`) | Distinguishes an old contract from a new one at a glance |

Deliberately excluded, and why: **domicilio, ciudad, whatsapp** (contact data no list needs to identify a row); **antenna model/MAC, PoE, caño metros** (equipment detail, and MAC search is a non-goal); **plazo, plantillaVersionId, firmanteId**; **document links and SHA-256 hashes**; and everything the detail mapper already refuses to emit — signature images, raw stroke points, and the signing context (technician, device, IP, user agent, GPS coordinates that are the customer's home address by another name).

Name and DNI *do* leave the server, because identifying the customer is the feature. That is the minimum disclosure the screen requires, and nothing above it.

Envelope `EsquemaListaContratos` / `DatosListaContratos`: `{ elementos, total, pagina, tamanoPagina }`. DTO keys stay Spanish, matching the existing `respuestas.ts` convention.

### 7. Port shape

Added to `ContratoRepository`:

```
buscar(criterios: CriteriosDeBusqueda): Promise<ResultadoDeBusqueda>

CriteriosDeBusqueda = {
  termino: TerminoInterpretado | null   // already dispatched, never a raw string
  estados: readonly EstadoContrato[]    // empty = every state
  pagina: number                        // 1-based
  tamanoPagina: number
}

ResultadoDeBusqueda = {
  resumenes: readonly ResumenDeContrato[]
  total: number                          // untruncated, before paging
}
```

`buscar` returns a **read model** (`ResumenDeContrato`), not `Contrato` aggregates. Rehydrating 20 aggregates pulls in every `firma`, `documento` and `evento` to render five fields — slow, and a privacy over-fetch of exactly the evidence `vistas.ts` exists to keep server-side. Tradeoff acknowledged: a read model on the aggregate's port is mild CQRS leakage. A separate `BuscadorDeContratos` port would be purer; one method does not justify a second port and a second module wiring.

The criteria object takes an *interpreted* term, not a raw string, so the dispatch rule is decided once in the application layer and neither adapter can reinterpret it.

**`ContratosEnMemoria` obligation.** It must implement `buscar` for real — filter by `estados`, apply the same shared `normalizarTexto`, sort `creadoEn DESC, id DESC`, slice the page, and return the untruncated `total`. A stub would silently void the use-case specs, which are the only tests asserting the filter/sort/paginate contract without a database. Drift between the double and Prisma is a real risk, mitigated by running the same scenario table in `PrismaContratoRepository.integration.spec.ts`.

### 8. Migration and backfill

Riskiest part of the change on the VPS. Ordered:

1. Migration A: add `comodatario_nombre_busqueda` **nullable**, create its index.
2. Backfill: a one-shot Node script importing the real `normalizarTexto`. **Not SQL** — a hand-written `lower(translate(...))` would be a second implementation of the rule, free to drift from the one the write path uses.
3. Migration B: set `NOT NULL`, only after the backfill reports zero remaining nulls.

`filaContratoDesde` computes the column on every save, so new rows are correct from the moment Migration A lands.

### 9. Frontend route tree

**Generalize, do not add a sibling.** Two guards with near-identical logic and divergent redirect targets is how role routing rots.

- `GuardiaDeRoles({ permitidos })` renders `<Outlet />` when the session role is allowed, else redirects.
- Redirect target comes from `rutaInicialPara(rol)` — a pure, unit-testable resolver: `tecnico → "/"`, `oficina | admin → "/contratos"`, anything else → `/panel-no-disponible`. One place answers "where does this role live", which also fixes post-login landing.
- `GuardiaDeRolTecnico` survives as a thin wrapper over `GuardiaDeRoles` with `permitidos={["tecnico"]}`, so the tablet route tree and its existing test are behaviourally untouched.

**`PanelNoDisponible` stays.** It stops being `oficina`/`admin`'s destination but remains the honest fallback for a role with no panel — deleting it removes the "a working login never reads as broken" safety net the moment a new role appears. Its Spanish copy must change, or the screen becomes a lie: "El panel de oficina no está disponible todavía." → role-agnostic wording such as "Todavía no hay un panel disponible para su rol." Its existing spec asserts on that text and must be updated with it.

### 10. Container/presentational split

`convencionDeCapas.spec.ts` fails the suite if anything under `componentes/**` imports `datos/`, `@tanstack/react-query`, or `almacenamiento/`. The ban is a **substring match on the import specifier**, so a presentational component cannot even import a type from `datos/`. Row types therefore come from `@contratos/esquemas`, which is allowed.

| File | Layer | Role |
|---|---|---|
| `funcionalidades/contratos/contenedores/PaginaListaContratos.tsx` | container | owns the query, debounce, and filter state |
| `funcionalidades/contratos/usarBusquedaDeContratos.ts` | container-side | the `useQuery` hook |
| `funcionalidades/contratos/usarValorDebounced.ts` | container-side | generic debounce |
| `datos/consultas/buscarContratos.ts` | data | `clienteHttp<DatosListaContratos>` call, mirrors `obtenerContrato.ts` |
| `datos/consultas/clavesDeContratos.ts` | data | query-key factory |
| `componentes/organismos/TablaDeContratos.tsx` | presentational | props only: `contratos`, `cargando`, `error`, `vacio` |
| `componentes/moleculas/BarraDeBusqueda.tsx` | presentational | `valor` / `onCambiar` / `estados` / `onCambiarEstados` |
| `componentes/moleculas/Paginador.tsx` | presentational | `pagina` / `totalPaginas` / `onIrA` |

The organisms follow `FormularioComodatario`'s existing prop idiom (`valores` / `onCambiar` / callbacks / `error` / `deshabilitado`). Every interactive control honors the 48px `--tamano-toque-minimo` target, and no rule uses `overflow: hidden|clip` — both enforced by `convencionesDeEstilos.spec.ts`.

### 11. First TanStack Query usage — the pattern every later feature copies

There is zero precedent in the repo, so these are architectural decisions, not details.

| Decision | Value | Rationale |
|---|---|---|
| Query key | `["contratos", "lista", { termino, estados, pagina, tamanoPagina }]` via a `clavesDeContratos` factory | Hierarchical: `["contratos"]` invalidates everything contract-related, `["contratos","lista"]` every list page. A factory means no call site ever writes a string literal, which is how key drift starts |
| Debounce | The **term**, not the query. `usarValorDebounced(termino, 300)` feeds the key | The input stays instantly responsive because it is controlled independently; only the key settles. Debouncing inside the fetcher instead would leave the query in flight and the cache confused. 300 ms sits above inter-keystroke time and below the ~1s "did it break" threshold |
| `placeholderData` | `(anterior) => anterior` (v5's `keepPreviousData`) | Without it the table collapses to zero rows between every keystroke and every page turn — the worst possible reading of this screen |
| `retry` | `1` | `providers.tsx` already sets `mutations.retry: false` deliberately; queries default to 3. A failing search that silently retries three times looks frozen |
| `staleTime` | 30 s | Contract lists change slowly; this kills refetch churn on filter toggles |
| Error surface | `ErrorDeApi` (`estado`/`codigo`/`campos`/`referencia`) rendered as Spanish copy plus a retry action | The existing HTTP seam already carries structured errors; nothing new is needed |

**Three distinct non-happy states**, all in Spanish, all separately tested:

1. Loading — existing `Spinner` atom.
2. Empty because there are no contracts at all — "Todavía no hay contratos cargados."
3. Empty because this filter matched nothing — "No hay contratos que coincidan con la búsqueda."

Collapsing 2 and 3 into one message is the common mistake: "no results" then reads as "the system is broken", and it generates support calls.

## Test surface (strict TDD — failing test first)

| # | Spec | Asserts |
|---|---|---|
| 1 | `normalizarTexto.spec.ts` | case folding, diacritics, explicit `ñ → n`, whitespace collapse. No DB, no browser |
| 2 | `interpretarTerminoDeBusqueda.spec.ts` | digits-vs-name dispatch, dot/space/dash stripping, empty term |
| 3 | `BuscarContratos.spec.ts` | `estado` filter, accent-insensitive name match, dotted and undotted DNI, page slicing, untruncated `total`, default sort, page past the end |
| 4 | `ContratosController` list spec | `@Roles("oficina","admin")`, `tecnico` gets 403, `tamanoPagina > 100` → 400, bad `pagina` → 400 |
| 5 | `PrismaContratoRepository.integration.spec.ts` | same scenario table as #3 against real Postgres, plus backfill correctness |
| 6 | `usarBusquedaDeContratos.spec.ts` | debounce timing, key shape, `placeholderData` retention |
| 7 | `TablaDeContratos.spec.tsx` | rows render, both empty states, error state, 48px targets |
| 8 | `rutas.spec.tsx` | `oficina`/`admin` reach `/contratos`; `tecnico` redirected to `/`; unknown role → `/panel-no-disponible` |
| 9 | existing `convencionDeCapas.spec.ts`, `convencionesDeEstilos.spec.ts` | stay green |

## Affected areas

| Area | Impact | What changes |
|---|---|---|
| `apps/api/src/shared/domain/normalizarTexto.ts` | New | Pure normalization |
| `apps/api/src/contratos/application/ports/ContratoRepository.ts` | Modified | `buscar` + criteria/result types |
| `apps/api/src/contratos/application/BuscarContratos.ts` | New | Use case |
| `apps/api/src/contratos/application/dobles.testing.ts` | Modified | Real `buscar` in `ContratosEnMemoria` |
| `apps/api/src/contratos/infrastructure/PrismaContratoRepository.ts` | Modified | `buscar` + write-path column |
| `apps/api/prisma/schema.prisma` + 2 migrations + backfill | Modified/New | Column, index, backfill |
| `apps/api/src/contratos/interface/ContratosController.ts` | Modified | `GET /contratos` |
| `apps/api/src/contratos/interface/dto/vistas.ts` | Modified | `vistaDeResumen` mapper |
| `packages/esquemas/src/respuestas.ts`, `peticiones.ts` | Modified | Query, row, envelope schemas |
| `apps/web/src/funcionalidades/auth/contenedores/GuardiasDeRuta.tsx` | Modified | `GuardiaDeRoles` + `rutaInicialPara` |
| `apps/web/src/funcionalidades/auth/contenedores/PanelNoDisponible.tsx` | Modified | Role-agnostic copy |
| `apps/web/src/rutas/rutas.tsx` | Modified | `/contratos` |
| `apps/web/src/funcionalidades/contratos/**` | New | Container + hooks |
| `apps/web/src/datos/consultas/**` | New | Fetcher + key factory |
| `apps/web/src/componentes/{organismos,moleculas}/**` | New | Table, search bar, paginator |
| `apps/web/src/estilos/organismos.css` | Modified | List styles |

## Review budget: honest estimate

**Estimated ~2,200 changed lines against a 400-line budget — roughly 5.5x over.** This will not fit in one PR, and shrinking the scope to fit it would ship a search that cannot search.

Proposed Feature Branch Chain, each slice independently verifiable with a clean rollback:

| # | Slice | Est. lines | Ships |
|---|---|---|---|
| 1 | `normalizarTexto` + `interpretarTerminoDeBusqueda` + column + index + backfill + write path | ~420 (slightly over) | Data correct; no behaviour change |
| 2 | Port + `ResumenDeContrato` + `BuscarContratos` + `ContratosEnMemoria.buscar` | ~380 | Application layer, DB-free tests |
| 3 | `PrismaContratoRepository.buscar` + integration spec | ~200 | Adapter proven against Postgres |
| 4 | Schemas + `GET /contratos` + roles + controller spec | ~250 | API usable by curl |
| 5 | `GuardiaDeRoles` + `rutaInicialPara` + `/contratos` shell + `PanelNoDisponible` copy | ~260 | Oficina/admin land on a real page |
| 6 | Query hook + key factory + debounce + list container | ~290 | Search works end to end, unstyled |
| 7 | `TablaDeContratos` + `BarraDeBusqueda` + `Paginador` + CSS | ~400 | Finished screen |

Slice 1 is over budget and slice 7 is at it; splitting the migration out of 1 is the fallback if a reviewer objects. Slices 1–4 are backend-only and 5–7 frontend-only, so the chain has a natural mid-point where the API can be reviewed and merged while the UI is still in flight.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Backfill leaves nulls; `NOT NULL` migration fails on the VPS | Med | Migration B is gated on a zero-null check; column stays nullable until it passes |
| `ContratosEnMemoria.buscar` drifts from the Prisma implementation | Med | Same scenario table runs in both the unit and the integration spec |
| Name substring search is a seq scan | Low at this scale | Accepted and stated; core-Postgres FTS is the documented escape hatch, needing no extension |
| Normalization drift across four call sites | Med | One shared pure function; SQL reimplementation explicitly rejected |
| First TanStack pattern gets copied wrongly | Med | Key factory + documented rationale table; no string-literal keys anywhere |
| `ñ → n` folding surprises someone | Low | Explicit, tested, and raised as question 3 below |
| Route guard generalization breaks the tablet flow | Low | `GuardiaDeRolTecnico` kept as a wrapper; `rutas.spec.tsx` covers all three roles |
| 7-PR chain stalls mid-way, leaving a half-built feature | Med | Slices 1–4 are independently valuable (API works); 5–7 are additive UI |

## Rollback plan

- **Slices 5–7 (frontend):** revert the commits. `rutas.tsx` returns to the two-guard tree and `oficina`/`admin` land back on `PanelNoDisponible`. No data touched.
- **Slice 4 (endpoint):** revert the controller method. The route 404s; nothing else reads it.
- **Slices 2–3 (port/adapter):** revert. `buscar` was additive — no existing call site used it.
- **Slice 1 (migration):** the column is additive and nullable at first, so a code revert alone restores prior behaviour without a down-migration. Dropping the column is a separate, unhurried migration; leaving it in place costs one unused text column.

No slice changes an existing column, an existing endpoint's response, or the `tecnico` flow, so no rollback can lose contract data.

## Dependencies

- None external. TanStack Query is already installed and wired in `providers.tsx`.
- Deploy ordering is a hard dependency inside slice 1: migrate → backfill → `NOT NULL`.

## Success criteria

- [ ] An `oficina` user searching "perez" finds "Juan Carlos Pérez"; searching "PÉREZ" and "Pérez" return the same rows.
- [ ] Searching "30.123.456", "30123456" and "30123" all find the same contract.
- [ ] Filtering by `estado` returns only that state; no filter returns all four.
- [ ] A `tecnico` token calling `GET /contratos` receives 403, and the tablet flow is unchanged.
- [ ] The list response contains no address, phone, equipment, signature, or signing-context data.
- [ ] `oficina`/`admin` land on `/contratos` after login, not `/panel-no-disponible`.
- [ ] Both empty states render distinct Spanish copy.
- [ ] `pnpm test` and `pnpm typecheck` pass in both apps, including the two convention guard specs.
- [ ] Every unit and application-layer spec runs with no database and no browser.

## Proposal question round

Interactive mode requires offering a question round, but a sub-agent cannot block on an answer. These are the product unknowns still open; the stated assumption is what the spec and design phases will use unless corrected. None of them re-open a settled decision.

1. **Are list rows actionable in this change?** No office contract *detail* screen exists — the `GET /contratos/:id` endpoint already allows `oficina`, but there is no page to land on. *Assumption: rows are identification-only and not clickable; the detail screen is a separate change.* A list you cannot act on has real but limited value, so this is worth confirming.
2. **Default `estado` filter — all four states, or hide `anulado` and `dado_de_baja` by default?** *Assumption: no default filter, all four shown.* Hidden default filters generate "the contract disappeared" support calls, but staff may find the noise worse.
3. **Should `ñ` fold to `n` in search?** *Assumption: yes* — "Nunez" finds "Núñez", and the column is never displayed. Say so if the office expects `ñ` to be distinguishing.
4. **Should a partial DNI match, or only the complete number?** *Assumption: prefix match*, so typing the first digits narrows the list. Exact-only is simpler and uses the existing index directly.
5. **Is the total result count needed on screen?** *Assumption: yes* — `total` is returned and rendered ("4 contratos"). This is the main reason offset pagination was chosen over cursor, so a "no" would reopen that tradeoff.
