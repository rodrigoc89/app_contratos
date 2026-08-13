# Spec: contract-list-search

Delta spec for the office contract list and search. Every requirement is the
contract `sdd-verify` validates against; every scenario is executable as a real
test, or is explicitly marked manual.

**Revision 3** — corrects five defects `sdd-verify` found in this document
(report observation #110).

## Authoritative counts

| Scope | Requirements | Scenarios |
|---|---|---|
| PR #1 — API | 16 | 60 |
| PR #2 — Web | 13 | 53 |
| **Total** | **29** | **113** |

PR #1: R-1.1=5, R-1.2=1, R-1.3=3, R-1.4=5, R-2.1=1, R-2.2=2, R-2.3=6, R-2.4=4,
R-2.5=3, R-2.6=7, R-2.12=5, R-2.7=2, R-2.8=5, R-2.9=6, R-2.10=1, R-2.11=4.

PR #2: R-3.1=4, R-3.2=1, R-3.3=4, R-3.4=2, R-3.5=5, R-3.6=6, R-3.7=8, R-3.9=8,
R-3.8=4, R-4.1=3, R-4.2=2, R-4.3=2, web-auth-session=4.

Earlier revisions reported 49 and then 88 scenarios. Both were undercounts by
direct walk. These totals supersede them.

## Spec corrections in revision 3

| Verify finding | Resolution |
|---|---|
| C-1: R-2.6 specified singular `?estado=`; the endpoint ships plural CSV `?estados=` | **The spec was wrong, the design right.** R-2.6 rewritten for CSV. |
| S-1: unknown query parameters silently dropped | **New R-2.12.** |
| W-3: R-2.8's "sees contracts they did not create" is unrepresentable — no creator column | Scenario replaced with a falsifiable one; scoping recorded as a deferred non-goal. |
| W-2: R-2.5's branch-exclusivity scenario has no discriminating fixture | Required fixture specified. |
| W-5: the DTO schema scenario only proved `success === true` | Negative half added to R-2.9. |

Verify's finding that R-2.1's internal `CriteriosDeBusqueda.estados` never
conflicted with the wire parameter is accepted — different layers. R-2.1 is
unchanged.

## Delivery mapping

| Domain | Status | PR |
|---|---|---|
| `busqueda-normalizacion` | New | **PR #1 — API** |
| `contratos-busqueda` | New | **PR #1 — API** |
| `web-panel-oficina` | New | **PR #2 — Web** |
| `web-consultas-tanstack` | New | **PR #2 — Web** |
| `web-auth-session` | Modified | **PR #2 — Web** |

PR #1 MUST be independently deployable and useful with **no** frontend work.
No PR #1 requirement may depend on a PR #2 artifact.

## Overrides applied to the proposal

| Proposal said | Binding decision |
|---|---|
| `ñ` folds to `n` | **`ñ` is PRESERVED.** Reversed. |
| 7-slice PR chain | **Two PRs**, `size:exception` accepted for both. |
| DNI separators: dots, spaces, dashes | **Dots and whitespace only** (R-1.4). |
| Tablet-shaped UI | **Notebook and desktop too**, ~360px–1920px+ (R-3.6). |
| — | **`estados` is one comma-separated parameter** (R-2.6). |

## Non-goals (explicit)

- **Rows are NOT clickable.** No office contract-detail screen exists and none
  is built here. The listing is read-only.
- **Row-visibility scoping is deferred.** The `contratos` model carries no
  creator column — the technician id lives only inside the signing context,
  which `buscar` never reads. Any "user X sees only what user X created" rule
  is unrepresentable against this schema and out of scope. It belongs to the
  change that introduces a creator column, with DESIGN.md §9's deferred
  technician scoping.
- Antenna MAC search, contract `numero` search, configurable sort, export,
  lifecycle writes.

## Verification legend (PR #2)

The web runner is Vitest + jsdom + `@testing-library/react`. jsdom performs no
layout and Vitest loads no stylesheets — `convencionesDeEstilos.spec.ts:10-13`
states this, which is why every style invariant here is a CSS source scan.

| Tag | Means |
|---|---|
| `[auto-dom]` | Assertable in jsdom + RTL against the rendered DOM |
| `[auto-css]` | Assertable by a source-text scan of shipped CSS |
| `[manual]` | Needs a real browser; NOT assertable in the current runner |

A `[manual]` item is a release checklist entry, never a passing assertion.

---

# Domain: busqueda-normalizacion  *(PR #1)*

## ADDED Requirements

### Requirement: R-1.1 — Diacritic folding MUST preserve `ñ`

`normalizarTexto` MUST be pure, with no I/O and no imports, runnable with no
database and no browser. It MUST lowercase and MUST strip the acute accent
from `a e i o u` and the diaeresis from `u`. It MUST NOT alter `ñ`: `ñ` stays
`ñ` and `Ñ` becomes `ñ`.

This is an active protection, not an omission. The idiomatic `NFD` +
strip-combining-marks implementation decomposes `ñ` into `n` + U+0303 and then
deletes the tilde, silently producing `n`. Every scenario below MUST fail
against that implementation.

#### Scenario: `ñ` survives the diacritic stripper

- GIVEN the input `"Peña"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"peña"`
- AND the result is NOT `"pena"`

#### Scenario: uppercase `Ñ` folds to lowercase `ñ`, not to `n`

- GIVEN the input `"PEÑA"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"peña"`

#### Scenario: vowel diacritics ARE stripped

- GIVEN the input `"Rodríguez"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"rodriguez"`

#### Scenario: both rules apply inside one word

- GIVEN the input `"Núñez"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"nuñez"` — the `ú` folded, the `ñ` did not

#### Scenario: diaeresis is stripped

- GIVEN the input `"Agüero"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"aguero"`

### Requirement: R-1.2 — Unicode form MUST NOT change the result

A name typed with a precomposed `ñ` (U+00F1) and the same name typed with a
decomposed `n` + U+0303 MUST normalize to one identical string, and that
string MUST use the precomposed form. Otherwise the write path and the search
path can store and query different bytes for the same name.

Test-authoring note: the two input literals render identically in an editor,
so the test MUST assert they differ at the code-point level before use — a
test comparing two precomposed strings passes while proving nothing.

#### Scenario: precomposed and decomposed inputs agree

- GIVEN `a` = `"Peña"` with a precomposed U+00F1
- AND `b` = `"Peña"` with `n` + U+0303
- AND the two literals are asserted to differ in length before use
- WHEN `normalizarTexto` is applied to both
- THEN both results are strictly equal
- AND each result has length 4 and its third code point is U+00F1

### Requirement: R-1.3 — Case, whitespace and empty input

The function MUST lowercase, trim, and collapse internal whitespace runs to a
single space. It MUST return the empty string for empty or whitespace-only
input, and MUST NOT throw for any string input.

#### Scenario: whitespace is collapsed and trimmed

- GIVEN the input `"  Juan   Carlos  Pérez "`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"juan carlos perez"`

#### Scenario: empty and whitespace-only input

- GIVEN the inputs `""` and `"   "`
- WHEN `normalizarTexto` is applied to each
- THEN both results are exactly `""`

#### Scenario: mixed casing, accents and `ñ` together

- GIVEN the input `"MARÍA José ÑANDÚ"`
- WHEN `normalizarTexto` is applied
- THEN the result is exactly `"maria jose ñandu"`

### Requirement: R-1.4 — One term, dispatched to one query

`interpretarTerminoDeBusqueda` MUST be pure and MUST return exactly one of:
`{ tipo: "dni", digitos }`, `{ tipo: "nombre", normalizado }`, or `null`.

Dispatch rule, in order:
1. Apply `normalizarDni` (the existing `@contratos/esquemas` rule mirroring
   `Dni.crear`: strips `.` and whitespace, nothing else).
2. If the result is non-empty and all digits → `dni`.
3. Otherwise, if `normalizarTexto(termino)` is non-empty → `nombre`.
4. Otherwise → `null`.

The DNI separator set MUST be the same function the domain uses to store a
DNI. A search accepting separators the write path rejects can produce a term
no stored value can match. A name can never be all digits, so the digits-win
tie-break loses nothing; a purely numeric name is accepted as unreachable by
name search.

#### Scenario: dotted, undotted and spaced DNIs reach the same branch

- GIVEN the terms `"30.123.456"`, `"30123456"` and `"30 123 456"`
- WHEN each is interpreted
- THEN all three yield `{ tipo: "dni", digitos: "30123456" }`

#### Scenario: a partial DNI is still a DNI

- GIVEN the term `"30123"`
- WHEN it is interpreted
- THEN the result is `{ tipo: "dni", digitos: "30123" }`

#### Scenario: a name is never read as a DNI

- GIVEN the term `"Peña"`
- WHEN it is interpreted
- THEN the result is `{ tipo: "nombre", normalizado: "peña" }`

#### Scenario: a hyphenated number is not a DNI

- GIVEN the term `"30-123-456"`
- WHEN it is interpreted
- THEN the result is `{ tipo: "nombre", normalizado: "30-123-456" }`
- AND a search with that interpreted term returns zero rows, asserted against
  the shared scenario table rather than left as prose

#### Scenario: a blank term is not a filter

- GIVEN the terms `""` and `"   "`
- WHEN each is interpreted
- THEN both yield `null`

---

# Domain: contratos-busqueda  *(PR #1)*

## ADDED Requirements

### Requirement: R-2.1 — The `buscar` port returns a read model, not aggregates

`ContratoRepository` MUST gain
`buscar(criterios: CriteriosDeBusqueda): Promise<ResultadoDeBusqueda>`.

`CriteriosDeBusqueda` MUST carry an **already-interpreted** term
(`TerminoInterpretado | null`), never a raw string, so no adapter can re-decide
the dispatch. It MUST carry `estados` (empty = every state), `pagina` (1-based)
and `tamanoPagina`. This is the internal port type — a different layer from the
HTTP parameter of R-2.6, independently named on purpose.

`ResultadoDeBusqueda` MUST be `{ resumenes, total }` with `total` the
untruncated match count before paging. `resumenes` MUST carry at minimum `id`,
`numero`, `estado`, `comodatarioNombreCompleto`, `comodatarioDni`,
`fechaFirma` and `creadoEn`; `creadoEn` is in the contract because it is the
ordering key.

`ContratosEnMemoria` MUST implement `buscar` for real — filtering, the shared
`normalizarTexto`, ordering, slicing, untruncated `total`. A stub silently
voids every use-case scenario below.

#### Scenario: the same scenario table passes against both implementations

- GIVEN the scenarios in R-2.2 through R-2.8
- WHEN they run against `ContratosEnMemoria` with no database
- AND the same table runs against `PrismaContratoRepository` on real Postgres
- THEN both produce identical results for identical criteria

### Requirement: R-2.2 — Total ordering by `creadoEn DESC, id DESC`

Results MUST be newest first by `creadoEn`, with `id DESC` as the tiebreaker.
The tiebreaker is mandatory: offset pagination over a non-unique sort key can
repeat or skip a row across a page boundary.

#### Scenario: newest first

- GIVEN three contracts created on 2026-01-01, 2026-02-01 and 2026-03-01
- WHEN `buscar` runs with no filters
- THEN they are returned March, February, January

#### Scenario: identical timestamps are still totally ordered

- GIVEN two contracts sharing one `creadoEn` value, ids `"a"` and `"b"`
- WHEN `buscar` runs twice with the same criteria
- THEN `"b"` precedes `"a"` in both responses

### Requirement: R-2.3 — Pagination bounds are rejected, never clamped

`tamanoPagina` MUST default to 20 when absent, and 100 is a hard maximum. A
`tamanoPagina` above 100 MUST be rejected with **400**, not silently clamped —
a client asking for 500 and receiving 100 cannot tell that from data loss.
`pagina` MUST default to 1 and be an integer ≥ 1.

This "reject, never silently adjust" principle is not local to pagination.
R-2.12 applies it to the query object as a whole.

#### Scenario: default page size

- GIVEN 25 contracts and a request with no `tamanoPagina`
- WHEN the list is requested
- THEN 20 `elementos` are returned, `tamanoPagina` is 20 and `total` is 25
- AND this is asserted end to end, not split across a call-argument check and
  a separate slicing check

#### Scenario: over-max page size is a 400

- GIVEN a request with `tamanoPagina=101`
- WHEN the list is requested
- THEN the status is 400 and `error.codigo` is `"validacion"`
- AND `error.campos` names `tamanoPagina`

#### Scenario: `tamanoPagina=100` is accepted

- GIVEN a request with `tamanoPagina=100`
- WHEN the list is requested
- THEN the status is 200

#### Scenario: invalid `pagina` values are a 400

- GIVEN requests with `pagina=0`, `pagina=-1` and `pagina=abc`
- WHEN each is made
- THEN each returns 400 with `error.codigo` `"validacion"`

#### Scenario: `total` is untruncated

- GIVEN 25 matching contracts and `pagina=1&tamanoPagina=10`
- WHEN the list is requested
- THEN `elementos` has 10 entries and `total` is 25

#### Scenario: a page past the end is empty, not an error

- GIVEN 5 contracts and `pagina=99`
- WHEN the list is requested
- THEN the status is 200, `elementos` is empty and `total` is 5

### Requirement: R-2.4 — Name search is accent-insensitive and `ñ`-sensitive

A `nombre` term MUST match as a **substring** of the persisted normalized name
column, populated by the same `normalizarTexto`. Because `ñ` is preserved on
both sides, `n` and `ñ` are different letters for search.

#### Scenario: accents and casing do not matter

- GIVEN a comodatario named `"Juan Carlos Pérez"`
- WHEN the raw terms `"perez"`, `"PÉREZ"` and `"Pérez"` are each submitted
- THEN the same contract is returned for all three
- AND the three raw spellings are driven through the endpoint or through
  `interpretarTerminoDeBusqueda`, not substituted by one pre-normalized term

#### Scenario: `"pena"` does NOT find `"Peña"`

- GIVEN a comodatario named `"Peña"`
- WHEN the term is `"pena"`
- THEN zero rows are returned

#### Scenario: `"peña"` finds `"PEÑA"`

- GIVEN a seeded comodatario whose stored name is uppercase `"PEÑA"`
- WHEN the term is `"peña"`
- THEN that contract is returned
- (The seed MUST be uppercase; a lowercase-`ñ` seed proves folding of the term
  only, not of the stored value.)

#### Scenario: substring, not prefix

- GIVEN a comodatario named `"Juan Carlos Pérez"`
- WHEN the term is `"carlos"`
- THEN that contract is returned

### Requirement: R-2.5 — DNI search is a prefix match on digits

A `dni` term MUST match `comodatario_dni` (bare digits) by prefix, so typing
the first digits off a form narrows the list. The two branches are
**exclusive**: a `dni` term MUST NOT additionally run a name match.

**Required fixture.** Branch exclusivity is unfalsifiable without a seed whose
*name* would match a DNI-shaped term. The shared fixture set MUST include a
comodatario whose normalized `nombreCompleto` **contains the digit string used
as the DNI term**, and whose `comodatario_dni` does **not** begin with it —
for example name `"30123 Servicios"`, DNI `"40999888"`, term `"30123"`.
Without that row, a repository ORing both branches passes every scenario here.

Implementer note: adding this row changes the expected ids and totals of every
other scenario in the shared table. Re-baseline the table as a whole.

#### Scenario: three spellings, one contract

- GIVEN a contract whose comodatario DNI is `30123456`
- WHEN the term is `"30.123.456"`, `"30123456"` or `"30123"`
- THEN the same contract is returned for all three

#### Scenario: a non-matching prefix returns nothing

- GIVEN a contract whose comodatario DNI is `30123456`
- WHEN the term is `"999"`
- THEN zero rows are returned

#### Scenario: a DNI term does not also run a name search

- GIVEN the required fixture — `"30123 Servicios"` with DNI `"40999888"` —
  seeded alongside contracts whose DNIs begin `30123`
- WHEN the term is `"30123"`
- THEN only the DNI-matching contracts are returned
- AND `"30123 Servicios"` is absent from the results and from `total`

### Requirement: R-2.6 — `estados` is one comma-separated query parameter

The `estado` filter is exposed over HTTP as a **single** parameter named
`estados` carrying a comma-separated list: `?estados=vigente`,
`?estados=vigente,anulado`. It MUST accept any subset of `borrador`,
`vigente`, `dado_de_baja`, `anulado`. An absent or empty `estados` MUST mean
all four, with no hidden default. Any unrecognized member MUST be rejected
with 400 naming `estados`.

Two binding reasons for plural CSV:

1. **A singular parameter cannot express two states at once.** The PR #2
   design settles the filter as `aria-pressed` toggle chips, which are
   multi-select. A singular wire parameter would break that screen before it
   is written.
2. **Repeated `?estado=a&estado=b` is rejected on its own merits.** Express
   returns a string for one value and an array for two, forcing a union type
   purely to avoid the classic "works with two filters, breaks with one" bug.
   Documented at `packages/esquemas/src/contrato.ts:103-113`.

(Revision 3: this requirement previously specified singular `?estado=`. That
was a spec defect, not an implementation defect.)

#### Scenario: one state returns only that state

- GIVEN one contract in each of the four states
- WHEN the list is requested with `?estados=vigente`
- THEN exactly the `vigente` contract is returned and `total` is 1

#### Scenario: two states return both, and nothing else

- GIVEN one contract in each of the four states
- WHEN the list is requested with `?estados=vigente,anulado`
- THEN exactly those two are returned and `total` is 2
- AND neither the `borrador` nor the `dado_de_baja` contract appears

#### Scenario: an absent parameter returns every state

- GIVEN one contract in each of the four states
- WHEN the list is requested with no `estados` parameter
- THEN all four are returned and `total` is 4

#### Scenario: an empty parameter returns every state

- GIVEN one contract in each of the four states
- WHEN the list is requested with `?estados=`
- THEN all four are returned and `total` is 4

#### Scenario: whitespace around members is tolerated

- GIVEN one contract in each of the four states
- WHEN the list is requested with `?estados=vigente, anulado`
- THEN the same two contracts are returned as for `?estados=vigente,anulado`

#### Scenario: an unknown member is a 400 naming `estados`

- GIVEN a request with `?estados=vigente,pendiente`
- WHEN the list is requested
- THEN the status is 400 and `error.codigo` is `"validacion"`
- AND `error.campos` names `estados`
- AND the Spanish message is value-free, such as
  `"Hay un estado que no es válido."`

#### Scenario: term and states combine

- GIVEN two contracts for `"Pérez"`, one `borrador` and one `vigente`
- WHEN the term is `"perez"` and the request carries `?estados=vigente`
- THEN only the `vigente` one is returned and `total` is 1

### Requirement: R-2.12 — Unknown query parameters are rejected, never dropped

The query object MUST reject any parameter it does not recognize with **400**
and `error.codigo: "validacion"`. It MUST NOT silently strip it.

This is R-2.3's principle applied to the whole query rather than to pagination
alone: a client that asks for something and gets a 200 with every row back
cannot tell that apart from the filter having worked. The concrete failure
prevented is the singular near-miss — `?estado=vigente` against R-2.6's plural
parameter — which under a non-strict schema returns **200 with all four
states**: a filter that appears to work and does nothing.

(Numbered 12 rather than inserted as 2.7 so R-2.7 through R-2.11 keep the
numbers the verify report references.)

#### Scenario: the singular near-miss is refused

- GIVEN a request with `?estado=vigente` — singular, the R-2.6 near-miss
- WHEN the list is requested
- THEN the status is 400 and `error.codigo` is `"validacion"`
- AND the response is NOT a 200 carrying every state

#### Scenario: a misspelled parameter is refused

- GIVEN a request with `?estdos=vigente`
- WHEN the list is requested
- THEN the status is 400 and `error.codigo` is `"validacion"`

#### Scenario: a wholly foreign parameter is refused

- GIVEN a request with `?ordenar=numero`
- WHEN the list is requested
- THEN the status is 400 and `error.codigo` is `"validacion"`

#### Scenario: every recognized parameter together still succeeds

- GIVEN a request carrying valid `termino`, `estados`, `pagina`, `tamanoPagina`
- WHEN the list is requested
- THEN the status is 200

#### Scenario: the rejection does not echo the submitted value

- GIVEN a request with `?dni=30123456` — an unrecognized parameter whose value
  is personal data
- WHEN it is rejected
- THEN the status is 400
- AND the response body contains the digits `30123456` nowhere (Ley 25.326)

### Requirement: R-2.7 — An empty result is a successful, well-formed response

Matching nothing MUST return **200** with `elementos: []`, an honest
`total: 0`, and the echoed `pagina` / `tamanoPagina`. Never a 404, never an
error.

#### Scenario: no match is a 200 with an empty list

- GIVEN a term matching no contract
- WHEN the list is requested
- THEN the status is 200, `elementos` is `[]` and `total` is 0

#### Scenario: an empty database is a 200 with an empty list

- GIVEN a genuinely empty repository — zero contracts seeded, not a fake
  returning an empty result
- WHEN the list is requested with no filters
- THEN the status is 200, `elementos` is `[]` and `total` is 0

### Requirement: R-2.8 — Authorization: office roles only, and unscoped

`GET /contratos` MUST carry `@Roles("oficina", "admin")`. Those two roles see
**all** contracts: the endpoint MUST NOT apply any identity-derived filter.
`tecnico` is excluded entirely, so DESIGN.md §9's deferred technician
row-scoping stays open and unaffected — this unscoped decision MUST NOT be
generalized to `tecnico`.

(Revision 3: the previous scenario "an office user sees contracts they did not
create" was unrepresentable — no creator column exists, so the assertion could
never fail. Replaced with the criteria-shape scenario below, which can.)

#### Scenario: `oficina` is allowed

- GIVEN an authenticated `oficina` session
- WHEN `GET /contratos` is called
- THEN the status is 200

#### Scenario: `admin` is allowed

- GIVEN an authenticated `admin` session
- WHEN `GET /contratos` is called
- THEN the status is 200

#### Scenario: `tecnico` is refused with 403

- GIVEN an authenticated `tecnico` session
- WHEN `GET /contratos` is called
- THEN the status is 403 and `error.codigo` is `"sin_permiso"`
- AND the message is `"Su usuario no tiene permiso para esta operación."`
- AND the body names neither `oficina` nor `admin`

#### Scenario: no session is refused with 401

- GIVEN a request with no bearer token
- WHEN `GET /contratos` is called
- THEN the status is 401 and `error.codigo` is `"no_autenticado"`
- AND the message is `"Esta operación necesita una sesión iniciada."`

#### Scenario: the criteria carry no identity-derived filter

- GIVEN an authenticated `oficina` session
- WHEN `GET /contratos` is called with no query parameters
- THEN the `CriteriosDeBusqueda` object reaching `buscar` has exactly the keys
  `termino`, `estados`, `pagina` and `tamanoPagina`
- AND it carries no user id, technician id, creator or ownership field
- (This fails the moment anyone scopes the listing by session identity, which
  is the behaviour the requirement actually protects.)

### Requirement: R-2.9 — The list row is a privacy boundary, not a size cut

The envelope MUST be `{ elementos, total, pagina, tamanoPagina }`, and each
element MUST contain **exactly** these fields and no others:

| Field | Type |
|---|---|
| `id` | string |
| `numero` | `number \| null` (null for a `borrador`) |
| `estado` | one of the four states |
| `comodatario.nombreCompleto` | string |
| `comodatario.dni` | string, dotted display form |
| `fechaFirma` | `string \| null`, `AAAA-MM-DD` |

The response MUST NOT contain, at any depth: `domicilioCalle`, `ciudad`,
`provincia`, `whatsapp`, any `equipos` field (antenna model, MAC, PoE, caño
metros), `plazo`, `plantillaVersionId`, `documentos` (links, paths, SHA-256),
`eventos`, `firmanteId`, signature images, raw stroke points, or any signing
context — technician id, device, IP, user agent, GPS. It MUST NOT expose the
internal normalized search column, and MUST NOT expose `creadoEn`.

`EsquemaContratoResumen` MUST be **strict**: it MUST reject an unknown key
rather than strip it. A permissive response schema cannot detect a widened
response, the exact failure this boundary exists to prevent.

This is Ley 25.326 minimum disclosure, not a size optimization. GPS captured
at signing is the customer's home address by another name. Name and DNI leave
the server because identifying the customer *is* the feature; nothing above
that does.

#### Scenario: the emitted key set is exactly the allowed set

- GIVEN a fully populated signed contract with signatures, documents, events
  and a full signing context
- WHEN it is returned as a list row
- THEN the sorted key list at every depth equals exactly the allowed set — an
  exact equality, never a subset or shape match

#### Scenario: no forbidden field appears anywhere in the body

- GIVEN a row produced from a **real signed aggregate**, driven through the
  same path a request takes, not a hand-written read model
- WHEN the response body is serialized
- THEN it contains none of `domicilioCalle`, `ciudad`, `whatsapp`,
  `antenaMac`, `poe`, `canoMetros`, `sha256`, `ruta`, `ip`, `userAgent`,
  `latitud`, `longitud`, `trazos`, `imagenPng`, `creadoEn`
- AND no field name matching the normalized search column

#### Scenario: the response schema accepts the allowed shape

- GIVEN a payload carrying exactly the six allowed fields
- WHEN `EsquemaContratoResumen` parses it
- THEN parsing succeeds

#### Scenario: the response schema REJECTS a widened payload

- GIVEN a payload carrying the six allowed fields plus `whatsapp`
- WHEN `EsquemaContratoResumen` parses it
- THEN parsing FAILS
- AND the same holds for a payload carrying `domicilioCalle`
- (A schema asserted only by `success === true` catches an over-strict schema
  but never an over-permissive one; this is the missing half.)

#### Scenario: a draft reports a null `numero`

- GIVEN a contract in `borrador`
- WHEN it is returned as a list row
- THEN `numero` is `null` and `fechaFirma` is `null`

#### Scenario: the DNI is dotted for display

- GIVEN a stored DNI of `30123456`
- WHEN it is returned as a list row
- THEN `comodatario.dni` is `"30.123.456"`

### Requirement: R-2.10 — Error responses MUST NOT echo personal data

Any 400 MUST name the offending parameter and MUST NOT include the submitted
value. The term may be a DNI; an error body travels to access logs and error
trackers (Ley 25.326).

#### Scenario: a rejected request does not leak the term

- GIVEN a request with `termino=30123456` and `tamanoPagina=500`
- WHEN it is rejected
- THEN the status is 400 and the body names `tamanoPagina`
- AND the body contains the digits `30123456` nowhere

### Requirement: R-2.11 — The backfill MUST agree with the write path byte-for-byte

Deploy order MUST be: add the nullable column and its index → backfill → set
`NOT NULL`. The backfill MUST import the same `normalizarTexto` the write path
uses; a hand-written SQL `lower(translate(...))` is a second implementation,
free to drift, and is forbidden. The write path MUST populate the column on
every insert and every update.

#### Scenario: backfilled values equal the write-path values

- GIVEN pre-existing contracts including names with `ñ`, accented vowels and a
  decomposed `ñ` whose literal is asserted to differ from its precomposed twin
  before use
- WHEN the backfill runs
- THEN for every row the stored column is strictly equal to
  `normalizarTexto(comodatarioNombreCompleto)`

#### Scenario: `NOT NULL` is gated on zero remaining nulls

- GIVEN the backfill has run
- WHEN the count of rows with a null search column is taken
- THEN it is 0, and only then does the `NOT NULL` migration run

#### Scenario: a new row is correct without a backfill

- GIVEN the nullable column exists
- WHEN a new contract named `"Peña"` is saved
- THEN its search column is `"peña"`

#### Scenario: an updated name updates the search column

- GIVEN a saved contract renamed from `"Perez"` to `"Peña"`
- WHEN it is saved again
- THEN its search column is `"peña"` and `"perez"` no longer matches it

---

# Domain: web-panel-oficina  *(PR #2)*

**Operator context.** Every existing screen was built for the técnico's
tablet: standing, touch only. The office panel has a different operator —
mouse and keyboard, a wide monitor or notebook, hours at a time. Both ends of
roughly 360px to 1920px+ are real; neither is a degraded fallback.

## ADDED Requirements

### Requirement: R-3.1 — One generalized role guard, one home resolver

`GuardiaDeRoles({ permitidos })` MUST render the nested route when the session
role is allowed and MUST otherwise redirect to `rutaInicialPara(rol)`.
`rutaInicialPara` MUST be pure: `tecnico → "/"`, `oficina | admin →
"/contratos"`, any other role → `"/panel-no-disponible"`. One place MUST
answer "where does this role live".

#### Scenario: office roles reach the list `[auto-dom]`

- GIVEN an authenticated `oficina` session, then an `admin` session
- WHEN each navigates to `/contratos`
- THEN both render the list screen

#### Scenario: a technician is sent home, not to the list `[auto-dom]`

- GIVEN an authenticated `tecnico` session
- WHEN it navigates to `/contratos`
- THEN it is redirected to `/`

#### Scenario: an unknown role still lands somewhere honest `[auto-dom]`

- GIVEN a session with a role that is none of the three
- WHEN it navigates to any guarded route
- THEN it is redirected to `/panel-no-disponible`

#### Scenario: `rutaInicialPara` is pure `[auto-dom]`

- GIVEN no rendering and no session store
- WHEN `rutaInicialPara` is called with each role
- THEN it returns `/`, `/contratos`, `/contratos` and `/panel-no-disponible`

### Requirement: R-3.2 — `PanelNoDisponible` copy stops naming the office

The fallback screen MUST remain, and its Spanish copy MUST become
role-agnostic — it is no longer the office's destination. Its existing spec
MUST be updated with it.

#### Scenario: the copy no longer promises an office panel `[auto-dom]`

- GIVEN the fallback screen renders
- THEN it shows role-agnostic Spanish copy such as
  `"Todavía no hay un panel disponible para su rol."`
- AND it does not contain the words `"panel de oficina"`

### Requirement: R-3.3 — Three distinct non-happy states

The screen MUST render four distinct outcomes: loading, error,
empty-because-nothing-exists, and empty-because-this-filter-matched-nothing.
Collapsing the two empty states MUST NOT happen — "no results" read as "the
system is broken" is what generates support calls. All copy is Spanish.

The two empty states are distinguished by whether a filter is active: a blank
term and no `estados` with `total: 0` means nothing exists; any active filter
with `total: 0` means this search matched nothing.

#### Scenario: loading `[auto-dom]`

- GIVEN the query is in flight and there is no previous data
- THEN the `Spinner` atom is rendered

#### Scenario: nothing exists at all `[auto-dom]`

- GIVEN `total` is 0 with a blank term and no `estados` filter
- THEN the screen shows `"Todavía no hay contratos cargados."`

#### Scenario: this filter matched nothing `[auto-dom]`

- GIVEN `total` is 0 with a non-blank term or an active `estados` filter
- THEN the screen shows `"No hay contratos que coincidan con la búsqueda."`

#### Scenario: an error offers a retry `[auto-dom]`

- GIVEN the request fails with an `ErrorDeApi`
- THEN a Spanish message and a retry control are rendered
- AND the message contains no DNI, phone number or coordinates

### Requirement: R-3.4 — Rows are read-only

A row MUST NOT be clickable. It MUST NOT render a link, a button, or a row
click handler, because no office contract-detail screen exists to land on.

#### Scenario: no row exposes an interactive element `[auto-dom]`

- GIVEN a rendered table of contracts
- WHEN each row is queried for `link` and `button` roles
- THEN none is found inside any row

#### Scenario: clicking a row does nothing observable `[auto-dom]`

- GIVEN the list is rendered inside a memory router at `/contratos`
- WHEN a row is clicked
- THEN the router location is still `/contratos`
- AND no navigation and no request was issued

### Requirement: R-3.5 — The 48px floor applies to controls, verified in CSS source

Every interactive control the office screen adds — search input, `estados`
filter chips, every pagination control — MUST declare a minimum touch target
of at least 48px in both dimensions via `--tamano-toque-minimo`. The panel may
be driven by a mouse, but equally on a touch-screen notebook; the token is a
floor, not a tablet-only concession.

This floor governs **interactive controls only**. It MUST NOT be applied to
table rows or cells: forcing 48px onto twenty data rows makes a wide-monitor
list needlessly tall and is not what the token protects.

Verification note: the existing guard checks only `.boton` and the token. The
new controls are not `.boton`, so they are **not** covered today. That guard
MUST be extended to the new selectors in its existing source-scan shape, and
each extension MUST assert the rule was found rather than silently matching
nothing.

#### Scenario: the new control rules declare the minimum target `[auto-css]`

- GIVEN the shipped CSS for the search input, `estados` chips and pagination
- WHEN each rule body is scanned for `min-height` and `min-width`
- THEN the rule is found, and each declares both, as
  `var(--tamano-toque-minimo)` or a literal ≥ 48px

#### Scenario: the token itself never drops below the floor `[auto-css]`

- WHEN `--tamano-toque-minimo` is read from the tokens stylesheet
- THEN its value is at least 48px

#### Scenario: the floor is not imposed on data rows `[auto-css]`

- GIVEN the shipped CSS rule for a contract table row and cell
- WHEN each rule body is scanned
- THEN the rule is found, and neither declares
  `min-height: var(--tamano-toque-minimo)`

#### Scenario: the existing convention guards stay green `[auto-css]`

- WHEN `convencionesDeEstilos.spec.ts` and `convencionDeCapas.spec.ts` run
- THEN both pass with the new components and styles in place

#### Scenario: real controls are comfortably tappable `[manual]`

- GIVEN the panel open on a touch-screen notebook
- WHEN each control is tapped with a finger
- THEN each is hit reliably on the first attempt

### Requirement: R-3.6 — The screen adapts across the full viewport range

The list MUST be usable from roughly 360px to 1920px and beyond. No contract
data and no control may become **unreachable** at any supported width; narrow
widths may reflow, stack or scroll, but MUST NOT silently drop a field or a
control.

Two rules bound whatever strategy the design picks:

1. **No data is dropped from the accessible tree.** At the default render,
   every one of the six row fields (R-2.9) MUST be present and associated with
   its column or label for every row. Unconditionally removing columns in
   JavaScript violates this.
2. **A missing viewport API MUST NOT break the screen.** Any runtime viewport
   read MUST be feature-detected and MUST fall back to a defined default
   layout when absent — the jsdom-tolerance shape `observadorDeIframe.ts`
   already uses for `ResizeObserver` and `document.fonts`. Not hypothetical:
   `configuracionPruebas.ts` installs **no `matchMedia` stub** and jsdom does
   not implement it, so an unguarded call crashes the entire suite.

Honesty note: jsdom applies no media queries and performs no layout, so "at
360px the table becomes cards" is **not** assertable here. The structural
guarantees are assertable; the visual result is `[manual]`.

#### Scenario: every row field is in the accessible tree at the default render `[auto-dom]`

- GIVEN a page of contracts is rendered
- WHEN each row is inspected
- THEN `numero`, `estado`, name, DNI and `fechaFirma` are each present and
  reachable by accessible name or column header association

#### Scenario: the table exposes real table semantics `[auto-dom]`

- GIVEN the list is rendered with results
- THEN a `table` role is present with one `columnheader` per displayed field
- AND the number of `row` roles equals the returned contracts plus the header

#### Scenario: the screen renders where `matchMedia` does not exist `[auto-dom]`

- GIVEN `window.matchMedia` is undefined, as in jsdom by default
- WHEN the list screen is rendered
- THEN it does not throw
- AND it renders its default layout with every row field present

#### Scenario: a viewport seam is injectable rather than read from a global `[auto-dom]`

- GIVEN the design exposes a viewport/breakpoint seam
- WHEN a test supplies a narrow value and then a wide value
- THEN the rendered output differs in the way the design documents
- AND neither render throws
- (If the design chooses a pure-CSS strategy with no runtime seam, this
  scenario is **not written**; the difference is `[manual]` only.)

#### Scenario: usable at the narrow end `[manual]`

- GIVEN a real browser at 360px
- WHEN the list is opened with results
- THEN every field is readable without zooming, and no content is cut off

#### Scenario: usable at the wide end `[manual]`

- GIVEN a real browser at 1920px
- WHEN the list is opened with results
- THEN the table uses the width without a stretched column, and line lengths
  stay readable

### Requirement: R-3.7 — The screen is fully operable from the keyboard

Every interactive control MUST be reachable by `Tab` in a predictable order,
MUST show a visible focus indicator, and MUST NOT depend on a pointer.

Tab order MUST follow reading order: search box → `estados` chips →
pagination. Focus MUST NOT be trapped and MUST NOT jump backwards on
re-render.

`Enter` in the search box MUST issue the search **immediately**, bypassing
R-4.1's 300 ms debounce — a keyboard operator who has finished typing should
not wait on a timer meant to absorb keystrokes. `Enter` MUST NOT cause a full
page navigation or reload.

`Escape` in the search box SHOULD clear the term and return the list to its
unfiltered state.

#### Scenario: tab order follows reading order `[auto-dom]`

- GIVEN the list screen is rendered with results
- WHEN `Tab` is pressed repeatedly from the top of the document
- THEN focus reaches the search box, then the `estados` chips, then the
  pagination controls, in that order

#### Scenario: Enter searches immediately, without waiting for the debounce `[auto-dom]`

- GIVEN `"perez"` has just been typed and the 300 ms debounce is still pending
- WHEN `Enter` is pressed in the search box
- THEN exactly one request carrying `"perez"` is issued before the timer would
  have elapsed

#### Scenario: Enter does not reload the page `[auto-dom]`

- GIVEN the list is rendered inside a memory router
- WHEN `Enter` is pressed in the search box
- THEN the router location is unchanged and no full navigation occurs

#### Scenario: Escape clears the search `[auto-dom]`

- GIVEN the search box contains `"perez"`
- WHEN `Escape` is pressed in the search box
- THEN the search box is empty and the list returns to its unfiltered state

#### Scenario: pagination is operable without a pointer `[auto-dom]`

- GIVEN more than one page of results
- WHEN the next-page control is focused and activated with the keyboard
- THEN the next page is requested

#### Scenario: focus is never removed without a replacement `[auto-css]`

- GIVEN the shipped CSS for the office screen
- WHEN it is scanned for `outline: none` or `outline: 0`
- THEN every such declaration sits in a rule that also declares a visible
  focus replacement, and no control is left with no focus indicator

#### Scenario: a focus-visible style exists for the new controls `[auto-css]`

- GIVEN the shipped CSS for the search input, `estados` chips and pagination
- THEN each rule is found and each has a `:focus-visible` rule declaring a
  visible change

#### Scenario: focus is genuinely visible on screen `[manual]`

- GIVEN a real browser
- WHEN the operator tabs through the screen
- THEN the focused control is unmistakable at a glance

### Requirement: R-3.8 — Pointer affordances the tablet UI never needed

A mouse hovers; a finger does not. Interactive controls MUST change appearance
on hover so a mouse operator can tell what is actionable before clicking.

Because rows are read-only (R-3.4), rows MUST NOT present a clickable
affordance — no pointer cursor, no hover highlight implying an action. A
treatment that only aids row tracking (subtle banding) is permitted, provided
it does not read as a button.

#### Scenario: interactive controls declare a hover state `[auto-css]`

- GIVEN the shipped CSS for the `estados` chips and pagination controls
- THEN each rule is found and declares a `:hover` rule producing a visible
  change

#### Scenario: rows never present a clickable cursor `[auto-css]`

- GIVEN the shipped CSS rules for a contract table row and its cells
- WHEN they are scanned for `cursor: pointer`
- THEN the rules are found and none declares it

#### Scenario: a disabled control does not offer a hover affordance `[auto-css]`

- GIVEN the pagination control styles
- THEN the disabled state does not declare `cursor: pointer`

#### Scenario: hover reads correctly to a mouse user `[manual]`

- GIVEN a real browser with a mouse
- WHEN the operator hovers over rows and over controls
- THEN only the controls read as actionable

### Requirement: R-3.9 — Pagination behaves correctly at both ends

Pagination MUST always tell the operator where they are and MUST NOT offer a
control that does nothing. All labels are Spanish.

| Situation | Required behavior |
|---|---|
| First page | Previous control present but disabled |
| Last page | Next control present but disabled |
| Exactly one page (`total` ≤ `tamanoPagina`) | No enabled navigation control |
| Zero results | No pagination controls at all |
| Any page | The current page is programmatically identifiable |

Controls MUST remain complete at every width — a narrow viewport may change
how page numbers are presented, but previous, next and the current-page
indicator MUST always be present.

#### Scenario: the first page disables the previous control `[auto-dom]`

- GIVEN `pagina` is 1 and `total` exceeds one page
- THEN the previous-page control is present and disabled
- AND the next-page control is enabled

#### Scenario: the last page disables the next control `[auto-dom]`

- GIVEN `pagina` is the last page and `total` exceeds one page
- THEN the next-page control is present and disabled
- AND the previous-page control is enabled

#### Scenario: a single page offers no enabled navigation `[auto-dom]`

- GIVEN `total` is 5 and `tamanoPagina` is 20
- THEN no enabled previous-page or next-page control is rendered

#### Scenario: zero results render no pagination `[auto-dom]`

- GIVEN `total` is 0
- THEN no pagination control is rendered at all

#### Scenario: the current page is programmatically identifiable `[auto-dom]`

- GIVEN `pagina` is 3 of 7
- THEN the current page is exposed via `aria-current="page"` or an equivalent
  accessible indication

#### Scenario: controls carry Spanish accessible names `[auto-dom]`

- GIVEN pagination is rendered
- THEN the previous and next controls are findable by Spanish accessible names
  such as `"Página anterior"` and `"Página siguiente"`

#### Scenario: the control set stays complete at the default render `[auto-dom]`

- GIVEN more than one page of results
- THEN previous, next and a current-page indicator are all present

#### Scenario: pagination stays reachable at the narrow end `[manual]`

- GIVEN a real browser at 360px with several pages of results
- THEN the pagination controls are reachable without horizontal scrolling

---

# Domain: web-consultas-tanstack  *(PR #2)*

## ADDED Requirements

### Requirement: R-4.1 — Debounce the term, not the request

The search input MUST stay instantly responsive. The **term** MUST be
debounced (300 ms) before it reaches the query key; the request MUST NOT be
debounced inside the fetcher, which would leave a query in flight and the
cache inconsistent.

`Enter` bypasses this debounce — R-3.7 owns that behavior. The two MUST stay
consistent: the debounce absorbs keystrokes, an explicit `Enter` flushes it.

#### Scenario: typing does not fire one request per keystroke `[auto-dom]`

- GIVEN the search box is empty
- WHEN `"perez"` is typed one character at a time within 300 ms
- THEN exactly one request is issued, carrying `"perez"`

#### Scenario: the input reflects every keystroke immediately `[auto-dom]`

- GIVEN the debounce is pending
- WHEN a character is typed
- THEN the input's displayed value updates on that keystroke

#### Scenario: a pause issues the request `[auto-dom]`

- GIVEN `"per"` was typed
- WHEN 300 ms elapse with no further input
- THEN one request carrying `"per"` is issued

### Requirement: R-4.2 — Query keys come from a factory

Query keys MUST come from a `clavesDeContratos` factory and MUST be
hierarchical, so `["contratos"]` invalidates everything contract-related and
`["contratos","lista"]` every list page. No call site may write a key string
literal.

#### Scenario: the key shape is hierarchical and parameterized `[auto-dom]`

- WHEN the factory is called with a term, states, page and page size
- THEN it returns
  `["contratos", "lista", { termino, estados, pagina, tamanoPagina }]`

#### Scenario: different criteria produce different keys `[auto-dom]`

- WHEN the factory is called with `pagina: 1` and then `pagina: 2`
- THEN the two keys are not equal

### Requirement: R-4.3 — The table MUST NOT collapse between fetches

The query MUST retain the previous page's data while the next loads, and MUST
retry at most once — a failing search that silently retries three times reads
as frozen.

#### Scenario: previous rows stay visible during a refetch `[auto-dom]`

- GIVEN a rendered page of 20 rows
- WHEN the term changes and a new request is in flight
- THEN the previously rendered rows are still on screen

#### Scenario: a failing query retries at most once `[auto-dom]`

- GIVEN the endpoint fails
- WHEN the query runs
- THEN exactly two attempts are made before the error state renders

---

# Domain: web-auth-session  *(PR #2)*

> No prior spec artifact for this domain exists in the artifact store. This
> block is authored from code ground truth (`GuardiasDeRuta.tsx:47-53`) and is
> complete for the requirement it restates.

## MODIFIED Requirements

### Requirement: Role gating resolves a home, it does not bounce to a dead end

Role gating MUST resolve where a role belongs instead of redirecting every
non-`tecnico` role to `/panel-no-disponible`. `GuardiaDeRolTecnico` MUST
survive as a thin wrapper over `GuardiaDeRoles` with
`permitidos = ["tecnico"]`, so the tablet route tree is behaviourally
untouched. An authenticated session MUST NOT be bounced back to login and MUST
NOT be shown a permission error for a role mismatch — it is redirected.
(Previously: every non-`tecnico` role was hard-redirected to
`/panel-no-disponible`, so a successful `oficina` login read as a broken app.)

#### Scenario: the tablet flow is unchanged `[auto-dom]`

- GIVEN an authenticated `tecnico` session
- WHEN it navigates to the tablet route tree
- THEN it renders exactly as before, and the existing guard spec passes

#### Scenario: a role mismatch redirects rather than erroring `[auto-dom]`

- GIVEN an authenticated `oficina` session
- WHEN it reaches a `tecnico`-only route
- THEN it is redirected to `/contratos`
- AND no login screen and no permission error are shown

#### Scenario: office roles no longer land on the fallback `[auto-dom]`

- GIVEN an `oficina` or `admin` session logs in successfully
- WHEN the post-login destination resolves
- THEN it is `/contratos`, not `/panel-no-disponible`

#### Scenario: a session is still required first `[auto-dom]`

- GIVEN no session
- WHEN any guarded route is requested
- THEN the redirect is to `/login`, carrying the close reason

---

## Acceptance summary

**PR #1 is done when**, with no frontend at all: `curl` as `oficina` searches
by name and by DNI, filters with `?estados=vigente,anulado`, pages through
results, receives an honest `total`, gets 403 as `tecnico` and 401 with no
session, gets **400** for `?estado=vigente` rather than a silent full list,
`"pena"` does not find `"Peña"`, `"peña"` finds `"PEÑA"`, and no response
contains an address, phone, equipment, signature or signing-context field.

**PR #2 is done when**: `oficina`/`admin` land on `/contratos` after login,
`tecnico` never does, the search box debounces and `Enter` flushes it, both
empty states render distinct Spanish copy, rows are not clickable, the screen
is fully keyboard-operable with visible focus, pagination is correct at both
ends, and the `[manual]` checklist has been walked.

**`[manual]` release checklist (real browser, not the test runner):**

- [ ] 360px: every field readable, nothing cut off, pagination reachable
      without horizontal scrolling
- [ ] 1920px: no stretched column, readable line lengths
- [ ] Tab through the screen: focus is unmistakable at every stop
- [ ] Mouse hover: only controls read as actionable, never rows
- [ ] Touch-screen notebook: every control hit on the first attempt

**Both**: `pnpm test` and `pnpm typecheck` pass in both apps including
`convencionDeCapas.spec.ts` and `convencionesDeEstilos.spec.ts`, and every
unit and application-layer spec runs with no database and no browser.
