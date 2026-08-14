# Tasks: Contract list and search for the office panel

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | PR#1 ~1,200 / PR#2 ~1,250 (both over budget) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 (API) → PR #2 (Web), both from `master` |
| Delivery strategy | exception-ok |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | `normalizarTexto` pure fn | 1 | `pnpm --filter api test normalizarTexto` | N/A — pure fn, no DB/browser | delete `normalizarTexto.ts`+spec |
| 2 | `interpretarTerminoDeBusqueda` | 1 | `pnpm --filter api test interpretarTerminoDeBusqueda` | N/A — pure fn | delete file+spec |
| 3 | `buscar` port + in-memory impl + `FirmarContrato` fix | 1 | `pnpm --filter api test BuscarContratos ContratosEnMemoria` | N/A — app layer, no DB | revert port/double changes |
| 4 | Mapper + Prisma adapter + migration A + backfill | 1 | `pnpm --filter api test:integration PrismaContratoRepository` (needs Postgres) | `pnpm --filter api backfill:nombre-busqueda` against local Postgres | revert code; column stays nullable, unused |
| 5 | Controller + schemas + DTO privacy | 1 | `pnpm --filter api test ContratosController vistas` | `curl -H bearer` against local API | revert controller/route wiring |
| 6 | `GuardiaDeRoles`/`rutaInicialPara`/`PanelNoDisponible` | 2 | `pnpm --filter web test rutaInicialPara GuardiasDeRuta PanelNoDisponible` | N/A — router unit tests | revert to two-guard tree |
| 7 | TanStack query layer (keys/hook/debounce) | 2 | `pnpm --filter web test usarBusquedaDeContratos usarValorDebounced` | N/A — mocked fetcher | delete `datos/consultas/*`, hooks |
| 8 | `LayoutPanel`+components+CSS+list container | 2 | `pnpm --filter web test PaginaListaContratos TablaDeContratos Paginador BarraDeBusqueda` | N/A — jsdom only, `[manual]` checklist below | revert `rutas.tsx` + delete new components |
| 9 (follow-up, outside both PRs) | Migration B `SET NOT NULL` | separate | `SELECT count(*) FROM contratos WHERE comodatario_nombre_busqueda IS NULL` = 0, then `prisma migrate deploy` | run after unit 4 backfill confirmed 0 nulls in prod | revert migration file, column stays nullable |

## Phase 1: PR #1 — Foundation (busqueda-normalizacion)

- [x] 1.1 RED `apps/api/src/shared/domain/normalizarTexto.spec.ts` — R-1.1–R-1.3 scenarios (ñ preserved, NFC≡NFD, whitespace, empty)
- [x] 1.2 GREEN `apps/api/src/shared/domain/normalizarTexto.ts`
- [x] 1.3 RED `apps/api/src/contratos/application/interpretarTerminoDeBusqueda.spec.ts` — R-1.4 (dni/nombre/null, wildcard strip D5)
- [x] 1.4 GREEN `interpretarTerminoDeBusqueda.ts`, owns `TerminoInterpretado`

## Phase 2: PR #1 — Core (contratos-busqueda, port + double)

- [x] 2.1 Create `escenariosDeBusqueda.testing.ts` (D8 seed + scenario tables, R-2.2–R-2.7). **Batch 3 (W-2 remediation): re-baselined with a seventh seed and a new R-2.5 exclusivity scenario — see status note below.**
- [x] 2.2 RED: add throwing `buscar` stub to `FirmarContrato.spec.ts`'s local `ContratosEnMemoria` (line 80) — fixes the compile break BEFORE the port change
- [x] 2.3 Modify `ports/ContratoRepository.ts` — add `buscar`, `CriteriosDeBusqueda`, `ResultadoDeBusqueda`, `ResumenDeContrato`
- [x] 2.4 RED `apps/api/src/contratos/application/BuscarContratos.spec.ts` — `it.each(ESCENARIOS_DE_BUSQUEDA)`
- [x] 2.5 GREEN: implement real `buscar` in `dobles.testing.ts` (`ContratosEnMemoria`), `creadoEn` stamping on first insert only, `agregar(contrato, creadoEn?)`
- [x] 2.6 GREEN `BuscarContratos.ts` — thin delegate calling `interpretarTerminoDeBusqueda` once

## Phase 3: PR #1 — Persistence

- [x] 3.1 RED `ContratoMapper.spec.ts` — `filaContratoDesde` writes `normalizarTexto(nombreCompleto)` into `comodatarioNombreBusqueda`
- [x] 3.2 GREEN: modify `ContratoMapper.ts` (D2, required field)
- [x] 3.3 Modify `prisma/schema.prisma` — add nullable `comodatario_nombre_busqueda` + index; create Migration A SQL
- [x] 3.4 Modify `PrismaContratoRepository.ts` — `buscar` (LIKE prefix for DNI, contains for name), spread `...fila` in both create/updateMany
- [x] 3.5 [needs Postgres] RED/GREEN `PrismaContratoRepository.integration.spec.ts` — same `ESCENARIOS_DE_BUSQUEDA` table, plus ñ round-trip. **Batch 3: automatically picks up the re-baselined table via the shared import — no direct edit to this file was needed.**
- [x] 3.6 Create `apps/api/prisma/backfill/nombreDeBusqueda.ts` — imports real `normalizarTexto`, paged `$executeRaw`, never hand-written SQL; add `backfill:nombre-busqueda` script to `apps/api/package.json`
- [x] 3.7 [needs Postgres] RED/GREEN backfill correctness scenario (R-2.11) in integration spec — backfilled value strictly equals `normalizarTexto(nombre)`

## Phase 4: PR #1 — Interface & wiring

- [x] 4.1 Modify `packages/esquemas/src/contrato.ts` — `EsquemaConsultaDeContratos` (estados CSV, pagina default 1, tamanoPagina default 20 max 100 → 400). NOTE: real file is `contrato.ts`, not `peticiones.ts` (that file does not exist in this repo) — added to the existing request-schema file to match actual structure. **Batch 2 (C-1 remediation): changed from non-strict `z.object` to `z.strictObject`, R-2.12.**
- [x] 4.2 Modify `packages/esquemas/src/respuestas.ts` — `EsquemaContratoResumen`, `EsquemaListaContratos`. **Batch 3 (W-5/S-1 remediation): both changed from non-strict `z.object` to `z.strictObject` (including the nested `comodatario` object), closing the missing negative-assertion half — see status note below.**
- [x] 4.3 RED `apps/api/src/contratos/interface/dto/vistas.spec.ts` — R-2.9 exact key-walk + forbidden-field scan. **Batch 3: added a REJECTS test against the real `vistaDeResumen()` output (widened with `whatsapp`/`domicilioCalle`).**
- [x] 4.4 GREEN `vistas.ts` — `vistaDeResumen`/`vistaDeListaContratos`, dotted DNI via `Dni.crear`
- [x] 4.5 RED new `ContratosController.spec.ts` — R-2.3, R-2.6, R-2.8, R-2.10 (400s, 403 tecnico, 401 no session, no PII in error body) — DB-free (real AutenticacionGuard/RolesGuard + EmisorFalso, no Postgres), matching DESIGN.md D17's Interface-layer "no DB, no browser" row. **Batch 2 (C-1 remediation): added R-2.12 (5 scenarios), R-2.6 CSV multi-select/empty/whitespace scenarios, W-1 `error.campos` assertion.**
- [x] 4.6 GREEN: modify `ContratosController.ts` — `GET /contratos` with `@Roles("oficina","admin")`
- [x] 4.7 Wire `BUSCAR_CONTRATOS` in `ContratosModule.ts`

## Phase 5: PR #2 — Auth/routing foundation

- [x] 5.1 RED `funcionalidades/auth/logica/rutaInicialPara.spec.ts` — R-3.1 pure mapping incl. unknown-role fallback
- [x] 5.2 GREEN `rutaInicialPara.ts`
- [x] 5.3 Modify `GuardiasDeRuta.tsx` — added `GuardiaDeRoles({permitidos})`; `GuardiaDeRolTecnico` becomes thin wrapper; updated redirect target (R-3.1, trap #7)
- [x] 5.4 Modify `PanelNoDisponible.tsx` + its spec — new role-agnostic copy (trap #6, R-3.2); asserts old string absent
- [x] 5.5 Modify `PaginaLogin.tsx` to land via `rutaInicialPara`
- [x] 5.6 Modify `rutas/rutas.tsx` + `rutas.spec.tsx` — mounted `/contratos` behind `GuardiaDeRoles(["oficina","admin"])`, sibling to `GuardiaDeRolTecnico`, both under `GuardiaDeSesion`

## Phase 6: PR #2 — Query layer

- [x] 6.1 Created `datos/consultas/clavesDeContratos.ts` + spec — R-4.2 hierarchical key factory
- [x] 6.2 RED/GREEN `datos/consultas/buscarContratos.ts` + spec (mirrors `obtenerContrato.ts`, CSV `estados`, no runtime parsing)
- [x] 6.3 RED/GREEN `funcionalidades/contratos/usarValorDebounced.ts` + spec — returns `[valor, aplicarAhora]` (R-4.1, R-3.7 flush)
- [x] 6.4 RED/GREEN `funcionalidades/contratos/usarBusquedaDeContratos.ts` + spec — page reset on raw term, `placeholderData`, per-hook `staleTime: 30_000`
- [x] 6.5 Modified `app/providers.tsx` — `queries.retry: 1` (R-4.3), + new `providers.spec.ts`
- [x] 6.6 RED/GREEN `funcionalidades/contratos/logica/paginacion.ts` + spec — `totalPaginas`, off-by-one in one pure place

## Phase 7: PR #2 — Presentation

- [x] 7.1 Confirmed CSS-only reflow (D12/D16): zero components read `window.matchMedia`; no stub needed, verified by grep
- [x] 7.2 Created `componentes/plantillas/LayoutPanel.tsx` + spec — sibling to `LayoutTablet`, `.layout-panel` rebinds `--fuente-base:16px` (in panel.css)
- [x] 7.3 RED/GREEN `componentes/organismos/TablaDeContratos.tsx` + spec — R-2.9 fields, R-3.4 no link/button in row, R-3.6 roles+`data-etiqueta`
- [x] 7.4 RED/GREEN `componentes/moleculas/BarraDeBusqueda.tsx` + spec — `role="search"` form, Enter flush (R-3.7), Escape clear, estado toggle buttons `aria-pressed`
- [x] 7.5 RED/GREEN `componentes/moleculas/Paginador.tsx` + spec — R-3.9 all pagination scenarios, Spanish accessible names
- [x] 7.6 RED/GREEN `funcionalidades/contratos/contenedores/PaginaListaContratos.tsx` + spec — R-3.3 four states (loading/error/empty-none/empty-filtered), tab order, live region `role="status"`, R-3.4 no navigation on row click, R-4.3 retries-once (real `queryClient`)
- [x] 7.7 Created `estilos/panel.css` + import in `estilos/index.css` — breakpoints 640/1024 min-width only, 48px controls, hover, focus-visible, no `cursor:pointer` on rows; documented breakpoint constants added to `estilos/tokens.css`

## Phase 8: PR #2 — Convention guards

- [x] 8.1 Extended `estilos/convencionesDeEstilos.spec.ts` (trap #5) — added search input/estado chip/pagination selectors to 48px + `--tamano-toque-minimo` assertions using the existing `expect(regla).not.toBeNull()` idiom; added cursor:pointer-on-rows guard, hover/focus-visible guards, outline-removed-without-replacement guard, breakpoint-sprawl guard (exactly 640/1024, no others), min-width-only guard, and `.layout-panel --fuente-base` rebind guard (D17). 9 new describe blocks — writing them first caught 3 real false-positive matches inside my own doc comments before the suite passed for real (see apply-progress).
- [x] 8.2 Verified `convencionDeCapas.spec.ts` passes unchanged with all new `componentes/` files (no `datos/`/`@tanstack`/`almacenamiento` imports) — confirmed green, no changes needed

## Follow-up (outside both PRs)

- [ ] 9.1 After PR #1 deploy + unit 4 backfill confirms zero nulls in production: create `apps/api/prisma/migrations/*_nombre_busqueda_not_null/migration.sql` (Migration B), deploy separately (trap #2)

## Manual pre-merge checklist (PR #2, not automated — no browser runner in this repo)

- [x] 360px: fields readable, pagination reachable without horizontal scroll (Chrome/Puppeteer, 19 contracts: `scrollWidth === clientWidth === 360` on both the list and the detail page; paginator `position: sticky`, 328×73, visible without scrolling; all 50 `td` at 18px with zero cells overflowing)
- [x] 1920px: no stretched column (`.layout-panel__contenido` capped at `max-width: 1280px`, `panel.css:41-47`; table measures 1230px and no column carries runaway slack)
- [x] Tab through screen: focus unmistakable at every stop (20 tab stops at 1366×768, every one computing `outline: solid 3px rgb(11,99,74)` with `outline-offset: 2px` from `base.css:55-58`; no focus trap; tab order = DOM order = visual order)
- [x] Mouse hover: only controls read as actionable, never rows (row and cell compute `cursor: auto` idle and hovered, clicking a row's non-link cell does not navigate — URL stays `/panel`; row hover tint 1.0958:1 against white is measurably WEAKER than the zebra striping's 1.1129:1. Re-measured unchanged after the touch-target fix below)
- [x] Touch-screen notebook: every control hit on first attempt (FAILED first: the row name link measured 91×24 to 174.5×24 and `← Volver al listado` 166.6×24 — inline `<a>` boxes, one line tall, under WCAG 2.5.5's 44px and the project's 48px floor. Fixed in `panel.css` by giving both links `display: inline-flex` plus `min-height`/`min-width: var(--tamano-toque-minimo)`; `display` is load-bearing, a `min-height` on an inline box is inert. Re-measured: all 27 controls at 1366 and all 25 visible controls at 360 are ≥48×48 — links now 174.5×48 / 91×48 / 166.6×48 — and an `elementFromPoint` sweep at each control's centre finds zero occluded. Cost: rows grow 53.6px → 73.5px at 1366×768; at 360px the cards are mostly unchanged. `convencionesDeEstilos.spec.ts` gained a scan that requires the floor of EVERY interactive control the stylesheets declare, since the enumerated guard was green throughout this defect)

## PR #1 status: COMPLETE, C-1/W-2/W-5/S-1 remediated (see `sdd/contract-list-search/apply-progress` for full evidence)

**Batch 1**: 55 unit test files / 729 tests pass, 5 esquemas test files / 105 tests pass, 10 integration test files / 115 tests pass (real Postgres), `tsc --noEmit` clean in both `@contratos/api` and `@contratos/esquemas`. Branch `api/listado-de-contratos`, all changes uncommitted per instruction.

**Batch 2** (remediation of verify finding C-1 — `sdd/contract-list-search/verify-report`, observation #110): `EsquemaConsultaDeContratos` (task 4.1) changed from non-strict `z.object` to `z.strictObject` — an unrecognised query key (e.g. the `?estado=vigente` singular near-miss of the real `?estados=` plural parameter) now answers 400 `validacion` instead of silently parsing as "no filter" and returning 200 with every contract. R-2.12 (5 scenarios) and R-2.6's CSV multi-select scenarios added to `ContratosController.spec.ts` (task 4.5); W-1 (`error.campos` names `estados`) fixed. 77/200 budgeted changed lines used. Unit suite now 736/736 (729 + 7 net), integration 115/115 unchanged, esquemas 105/105 unchanged, typecheck clean. W-2, W-5/S-1, PR #2, and Migration B remain untouched/out of scope for this batch.

**Batch 3** (remediation of verify findings W-2, W-5, S-1 on branch `api/deuda-de-busqueda`, cut from PR #1's merged state): two independent, test-only fixes, no production logic changed.

- **W-2**: `escenariosDeBusqueda.testing.ts`'s shared fixture (task 2.1) gained a seventh seed, `escenario-30123-servicios` (name `"30123 Servicios"`, DNI `"40999888"`, `vigente`, newest `creadoEn`) — R-2.5's required discriminating fixture, whose name literally contains the digit string used as a DNI search term while its DNI does not start with it. The whole `ESCENARIOS_DE_BUSQUEDA` table (13 pre-existing scenarios) was re-derived by hand against all seven seeds, not patched selectively: 5 of the 13 genuinely change (the unfiltered listing, the `estado=vigente` filter, and all three pagination scenarios — every scenario that reads every/most rows), the other 8 are provably unaffected regardless of the new seed's `estado`/`creadoEn` because their match logic depends only on a name/DNI substring the fixed name/DNI never satisfies. A 14th scenario was added, explicitly named for R-2.5's previously-absent third scenario ("a DNI term does not also run a name search"). Both `BuscarContratos.spec.ts` (in-memory) and `PrismaContratoRepository.integration.spec.ts` (real Postgres) import this shared module and needed no direct edit. Empirically proven discriminating via a temporary, deleted-before-diff scratch spec that replayed an OR'd (dni-prefix OR name-substring) matcher against the fixture: the OR'd matcher wrongly included the new seed for the new scenario's criteria, while the correct exclusive matcher agreed with the recorded `idsEsperados`; replaying the same OR'd matcher against only the original six seeds reproduced the correct matcher's result exactly — confirming the pre-Batch-3 table genuinely could not have told the two apart.
- **W-5/S-1**: `EsquemaContratoResumen` and `EsquemaListaContratos` (task 4.2, `packages/esquemas/src/respuestas.ts`) changed from non-strict `z.object` to `z.strictObject`, including the nested `comodatario` object — closing the missing negative half `safeParse(...).success === true` alone could never prove (a schema that is too PERMISSIVE, not too strict). 10 new tests in `packages/esquemas/src/respuestas.spec.ts` (positive shape + REJECTS `whatsapp`/`domicilioCalle`/`creadoEn`/nested-widening/envelope-widening), plus 1 new test in `apps/api/src/contratos/interface/dto/vistas.spec.ts` asserting the real `vistaDeResumen()` output is rejected once widened. `EsquemaListaContratos` was made strict too (decision: the envelope's own R-2.9 wording is "exactly" `{elementos,total,pagina,tamanoPagina}`, so the same reasoning applies at that level). Regression check: grepped the whole repository for `EsquemaContratoResumen`/`EsquemaListaContratos`/`buscarContratos` consumers — none exist under `apps/web/` on this branch (PR #2/#45's web consumption lives on a separate, unmerged branch); the only consumers are the schema's own tests and `ContratosController.ts`, which returns `vistaDeListaContratos(...)` directly without ever calling `.parse()` against these schemas, so no production code path can throw from the new strictness. No regression found.

Changed-line accounting (Batch 3, authored lines only): `escenariosDeBusqueda.testing.ts` +71/−15, `vistas.spec.ts` +23/−0, `respuestas.ts` +21/−5, `respuestas.spec.ts` +126/−0 — **245 insertions / 16 deletions = 261 changed lines**, all in the 4 files above, well within the 400-line budget. Full-suite evidence after Batch 3: `pnpm --filter @contratos/api test` 738/738 (+2: one new shared-table scenario, one new vistas.spec.ts test), `pnpm --filter @contratos/api test:integration` 116/116 (+1, real Postgres), `pnpm --filter @contratos/esquemas test` 115/115 (+10), `tsc --noEmit` clean in both `@contratos/api` and `@contratos/esquemas`. `gentle-ai sdd-attempt settle` for work-unit `PR1-deuda-w2-w5-s1` returned `state: complete`.

## PR #2 status: COMPLETE (branch `web/listado-de-contratos`, cut from updated `master` with PR #1 merged) — all 16 tasks (Phase 5-8) done, 20/20 new/extended CSS guard assertions pass, 33 new/modified spec files, 422/422 web unit tests green (67 files), `tsc --noEmit` clean, `convencionDeCapas`/`convencionesDeEstilos` guards green. See `sdd/contract-list-search/apply-progress` (same topic, latest revision) for full TDD evidence, changed-line accounting, and the 6 `[manual]` scenarios collected into the pre-merge checklist above.

Ready for `sdd-verify` (scoped re-check of W-2, W-5, S-1 against Batch 3, plus PR #2's own re-verify carried over from the prior session).
