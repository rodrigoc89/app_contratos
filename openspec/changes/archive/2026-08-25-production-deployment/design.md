# Design: Production deployment to a HostGator VPS

Thin, idempotent bash over the already-reviewed `deploy/` artifacts (proposal Approach 2),
with every falsifiable guarantee pushed into TypeScript so CI can prove it **before the VPS
exists**. Bash carries orchestration and root-only work; it carries no guarantee that could
have been tested instead.

## Verifiability split (read this first)

| Component | Provable in CI today | Needs the VPS |
|---|---|---|
| `.env.example` completeness (15 vars) | Test asserts it against `configuracion.ts` + `prisma/seed.ts` | — |
| Seed fail-closed gate | Vitest, RED first, no server | — |
| Restore hash verifier | Integration test on CI's Postgres 17 + a deliberately corrupted fixture | — |
| Script guards, publish ordering, prune arithmetic | Vitest `execFile` specs + `--dry-run` plans (D8) | — |
| Script syntax/style | `shellcheck`, `bash -n` | — |
| Render/font correctness | Verdict parser unit-tested; full render in the integration job (Chromium present) | Real host fonts |
| `nginx -t`, systemd start, certbot issuance, RAM headroom | Nothing | **All of it** |
| Offsite upload + full restore drill | Local round-trip only | Real credential + scratch host |

## Architecture decisions

### D1 — Chromium: root installs libraries, `contratos` installs the browser

**Choice.** Two steps, split by privilege.
Provisioning (root): `npx --yes puppeteer@<lockfile version> browsers install chrome --install-deps`,
run with `PUPPETEER_CACHE_DIR` pointed at a scratch directory that is deleted afterwards — we
want the dependency resolution, not that browser.
Deploy (user `contratos`): `pnpm --filter @contratos/api exec puppeteer browsers install chrome`,
the exact command `.github/workflows/ci.yml:167` already runs, for the reason stated there:
with a warm pnpm store `pnpm install` does **not** re-run Puppeteer's postinstall, so the download
can silently not happen.

**Rejected.** (a) Hardcoding the 37-package Debian list from Puppeteer's troubleshooting docs as the
primary mechanism — package names drift across Ubuntu releases (the 64-bit `time_t` transition renamed
several `lib*`), and `--install-deps` resolves names for the running distro. The list is kept in
`deploy/README.md` as an **audit reference and offline fallback**, not the mechanism.
(b) Running `pnpm install` as root — Puppeteer's cache follows the invoking user's `$HOME`, so the
browser would land in `/root/.cache/puppeteer` where the service user cannot read it.

**Consequences.** `contratos`'s home is `/opt/contratos` (per the unit's own install comments), which is
also the checkout, so provisioning must add `.cache/` to `/opt/contratos/.git/info/exclude` — otherwise
the dirty-worktree guard (D5) trips on a 650 MB cache on every deploy.

### D2 — Font correctness: a layered render check, each layer labelled by what it proves

**Choice.** Provisioning ends by rendering a probe document through the real
`GeneradorDeDocumentosPuppeteer` and asserting three independent things:

| Layer | Command | Proves | Does not prove |
|---|---|---|---|
| Family resolution | `fc-match "<family the template requests>"` | The requested family exists and does not fall back | Nothing about the PDF |
| Glyph embedding | `pdffonts probe.pdf` | The PDF embeds a real font, not an empty fallback | Correct glyph shapes |
| Text round-trip | `pdftotext` contains `ñ á é í ó ú Ñ` | The content stream carries the right codepoints | **Nothing about rasterization** |

**The honest caveat, stated because the proposal's phrasing hides it:** text extraction reads the
`ToUnicode` map, not the ink. A tofu box can still extract as the correct character. Layer 3 alone
is necessary, not sufficient; layers 1–2 are what actually fail on a bare Ubuntu with no TrueType
fonts, which is the observed failure mode `DESIGN.md` §10 describes.

**Rejected.** Pixel comparison against a CI-generated golden PNG. Decisive, but a font package update
changes pixels and turns provisioning red for a non-defect. Recorded as the escalation if the layered
check ever passes on a tofu render.

**Split.** The verdict parser (stdout of the three tools → pass/fail + reason) is a pure module with
unit tests and fixtures; the driver is a jiti script. Package presence (`dpkg -l`) is never a check.

### D3 — The seed gate lives in the application, not the deploy script

**Choice.** `apps/api/src/seed/seedDatabase.ts` throws when `NODE_ENV === "production"` and either
account resolves to `action: "omitido"`. `already-present` never throws.

**Rejected.** A guard in `deploy.sh` that greps the env file. It is cheaper and needs no test — and it
protects only deploys that go through that script. The recovery path an operator reaches for under
pressure is `pnpm --filter @contratos/api prisma:seed` by hand, which the script guard never sees.

**Rationale.** The defect is that the seed **reports success while the signing flow is unreachable**
(`seedDatabase.ts:282` says so in its own message, then exits 0). A process that lies about its own
outcome must be fixed where it lies. This also mirrors the guard already in that file for the
provisional signatory, so it is the file's existing pattern, not a new one. And it is testable today:
strict TDD, RED first, no VPS. `deploy.sh` keeps only a cheap preflight that the 15 variables are
*present* before it stops the API — convenience, explicitly not the guarantee.

`already-present` passing is load-bearing: without it every redeploy would fail once passwords were
rotated out of the env file.

### D4 — Asset publish order: additive, then `index.html`, then `sw.js` last

**Choice.**

```
1. copy hashed assets, icons, manifest.webmanifest   (additive — no --delete)
2. mv index.html into place                          (rename(2), atomic)
3. mv sw.js into place                               (last)
4. write .releases/<tag>.files
5. prune files listed only in manifests older than the 2 newest  ← next deploy, never this one
```

**Why this order and not the reverse.** The generated `sw.js` embeds a precache manifest with a
`revision` per entry, `index.html` included. If `sw.js` is published first, an installing worker
fetches the **old** `index.html` bytes and stores them under the **new** revision — workbox will
never re-fetch, so that client is stuck on a stale shell until the next deploy. Publishing the shell
before the worker removes that window.

**Why an in-flight session survives.** `configuracionPwa.ts` sets `skipWaiting: false`,
`clientsClaim: false`, `registerType: "prompt"` — an open tab keeps its activated worker and its
precache until the técnico accepts. Additive publish plus 2-release retention covers the cases the
worker does not: a first visit whose worker has not activated, and a shift-reload that bypasses it.

**Not solved, named:** the API restart still drops an in-flight `POST /contratos/:id/firmar`. A drain
needs a second instance, which a 4 GB box does not have. Mitigation stays operator scheduling.

### D5 — Deploy: stop first, migrate at deploy time, never at boot

```
preflight (env vars present, tag exists, worktree clean, disk)
  └─ systemctl stop contratos-api
       ├─ pg_dump -Fc  → local pre-migration dump      (quiescent)
       ├─ git -C /opt/contratos fetch --tags && checkout --detach <tag>
       ├─ pnpm install --frozen-lockfile   ┐ as contratos
       ├─ puppeteer browsers install chrome│ (D1)
       ├─ prisma generate && vite build    ┘
       ├─ prisma migrate deploy
       ├─ prisma:seed            (fails closed — D3)
       └─ publish web assets     (D4)
  └─ systemctl start contratos-api → GET /salud with retries → report or rollback recipe
```

**Rejected: `ExecStartPre=prisma migrate deploy`.** `Restart=on-failure` would re-run migrations on
every crash-loop restart, hammering production and making one failed migration a permanently
unstartable service. Migration is a deploy-time action.

**Rejected: build before stopping** (shorter downtime). `pnpm install` mutates `node_modules` under a
live Node process that lazily resolves Prisma and Puppeteer files. One clean window beats two
half-states; the proposal already accepted a short outage outside install hours.

**Rejected: capistrano-style release directories.** `contratos-api.service` hardcodes
`WorkingDirectory=/opt/contratos/apps/api`; releases would force a unit rewrite the proposal scoped
out. Rollback stays "re-deploy the previous tag; restore the dump if the schema moved".

### D6 — TLS bootstrap: a second, HTTP-only server block exists first

`deploy/nginx.conf:55-56` references certificate paths that do not exist on a fresh host, so
installing it first makes nginx fail to start.

```
install nginx → install -d /var/www/certbot → rm default site
  → install deploy/nginx-bootstrap.conf   (port 80: ACME location + `return 503` for everything else)
  → nginx -t → reload
  → certbot certonly --webroot -w /var/www/certbot -d $CONTRATOS_HOST
  → render deploy/nginx.conf → /etc/nginx/sites-available/contratos
      (substitute $CONTRATOS_HOST, $WEB_ROOT; FAIL if a placeholder literal survives)
  → nginx -t → repoint symlink → reload
  → install deploy/renewal-hook-nginx.sh → /etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh
```

`503`, not `301 → https`: redirecting to an origin with no certificate is a dead end that also hides
which state the host is in. The bootstrap conf stays on disk as the rollback target — if the real
conf fails `nginx -t`, the script repoints the symlink back and reloads, so nginx never ends a run
unable to start. Idempotent: an existing certificate skips first-issue. Renewal itself rides certbot's
packaged timer; the hook is the missing piece without which nginx serves an expired certificate from
memory while the file on disk is fine.

### D7 — Backup: database first, PDFs second, restore proven by hash

Order is the falsifiability argument: dumping the database first can only produce an **orphan PDF**
(harmless); the reverse can produce a `contrato_documentos` row whose PDF is absent from the backup
(unrecoverable).

| Concern | Choice | Rejected |
|---|---|---|
| Encryption | `age` with a **recipient public key**; the private key never touches the VPS | `gpg --symmetric`: puts a key that decrypts the archive on the box being protected |
| Transport | `rclone` remote from `/etc/contratos/backup.env` (root `0600`) | Provider-specific CLI: the proposal requires the provider to stay a config value |
| Schedule | `contratos-backup.timer`, daily | Weekly: §10 prices the gap at ~100 home re-visits vs ~20 |
| Retention | 30 remote copies, 2 local | — |

**Restore drill** (`deploy/restore.sh` → `deploy/verify-restore.sh`) restores into a **scratch**
database and directory — the script refuses to run when the target equals the production
`DATABASE_URL` or `ALMACEN_DOCUMENTOS_RUTA` — then calls the TypeScript verifier, which streams every
`DocumentoContrato` row's file and compares against the stored lowercase-hex `sha256`
(`schema.prisma:272-286`).

```ts
interface ReporteDeRestauracion {
  total: number;            // fails when 0 — an empty database must not "pass"
  verificados: number;
  faltantes: string[];      // row exists, file absent          → exit 1
  desajustados: string[];   // file exists, sha256 differs      → exit 1
  huerfanos: string[];      // file exists, no row              → warn (the safe side of the order rule)
}
```

`total === 0` failing is the whole point: a drill that verifies nothing must not report success.

### D8 — A `deploy` workspace package gives the shell scripts a test harness

**Choice.** Add `deploy/package.json` (`@contratos/deploy`, private) and `deploy` to
`pnpm-workspace.yaml`. Vitest specs `execFile` the scripts inside temporary directories and assert
exit codes and `--dry-run` plans. Picked up by `pnpm -r test` with no CI change.

**Rejected.** `bats` (a new toolchain for one directory) and untested bash (the repo's `rules.tasks`
requires a failing test per implementation task; shell is not exempt).

**What this buys.** The asset publish order, the placeholder-substitution guard, the dirty-worktree
refusal and the prune arithmetic stop being comments and become assertions — all runnable with no
root and no server.

## File changes

| File | Action | Description |
|---|---|---|
| `.env.example` | Create | All 15 vars (9 from `configuracion.ts`, 6 `SEED_*`) with provenance comments |
| `deploy/provision.sh` | Create | Root: packages, Node/pnpm, PostgreSQL 17 pin, Chromium libs (D1), fonts + `fc-cache`, 2 GB swap + `/etc/fstab`, user/dirs/perms, `info/exclude` |
| `deploy/deploy.sh` | Create | The D5 sequence, with `--dry-run` |
| `deploy/publicar-assets.sh` | Create | D4 ordering, release manifests, prune |
| `deploy/nginx-bootstrap.conf` | Create | HTTP-only ACME + `503` |
| `deploy/tls-bootstrap.sh`, `deploy/renewal-hook-nginx.sh` | Create | D6 |
| `deploy/backup.sh`, `deploy/restore.sh`, `deploy/verify-restore.sh` | Create | D7 |
| `deploy/contratos-backup.service`, `.timer` | Create | Daily schedule |
| `deploy/package.json`, `deploy/*.spec.ts` | Create | D8 harness |
| `deploy/README.md` | Create | Install order, update order, restore drill, the 37-package fallback list |
| `apps/api/src/seed/seedDatabase.ts` | Modify | D3 gate (RED test first) |
| `apps/api/scripts/verificarRender.ts` + verdict module | Create | D2 |
| `apps/api/prisma/restauracion/verificarRestauracion.ts` + comparator | Create | D7 verifier, following the existing `prisma/backfill/` script pattern |
| `apps/api/package.json` | Modify | `verify:render`, `verify:restore` scripts |
| `pnpm-workspace.yaml` | Modify | Add `deploy` |
| `deploy/nginx.conf`, `deploy/contratos-api.service` | Modify (minimal) | Placeholder resolution only; `nginx.conf` becomes a rendered template |
| `docker-compose.yml` | Unchanged | Documented as dev-only, diverging from production by design |

## Testing strategy

| Layer | What | How |
|---|---|---|
| Unit | Seed gate; render verdict parser; restore comparator; prune arithmetic | Vitest, no DB/browser — hexagonal boundary preserved |
| Unit (shell) | Script guards, `--dry-run` publish order, placeholder guard, dirty-worktree refusal | Vitest `execFile` in temp dirs (D8) |
| Integration | Restore verifier vs. Postgres 17 + corrupted fixture; render probe | Existing `integration` job |
| Static | `shellcheck`, `bash -n`, `.env.example` vs. the two config sources | CI |
| Manual, post-VPS | `nginx -t`, systemd start, certbot issue + forced renewal, real render, full offsite drill, RAM headroom | `deploy/README.md` checklist |

## Threat matrix

| Boundary | Applicability | Design response | Planned RED test |
|---|---|---|---|
| Documentation-like paths | **N/A** — no file is classified executable by content; every script has a fixed, explicit invocation | — | — |
| Git repository selection | **Applicable** — `deploy.sh` runs git on the server | Always `git -C "$APP_DIR"`, never cwd; abort unless `rev-parse --show-toplevel` equals `$APP_DIR` and the remote matches | Temp repo at an unexpected path → non-zero exit, named error |
| Commit state | **Applicable** — a hot-fixed server worktree | Abort on non-empty `git status --porcelain`; never `--force` or `reset --hard` | Dirty temp worktree → refuses to deploy |
| Push state | **N/A** — nothing is pushed from the server | — | — |
| PR commands | **N/A** — no PR/VCS automation in this change | — | — |

## Rollout

Chained PRs, A → B → C; PR #1 targets the feature branch, each later PR targets the previous.

| Slice | Contents | Est. |
|---|---|---|
| **A** | `.env.example` + contract test, `provision.sh`, Chromium/fonts/swap, render check (D1, D2), D8 harness, README install | ~400 |
| **B** | Seed gate (D3), `deploy.sh` + `publicar-assets.sh` (D4, D5), TLS bootstrap + renewal hook (D6), nginx template rendering | ~450 |
| **C** | `backup.sh`/`restore.sh`/`verify-restore.sh`, timer units, TS verifier (D7), README restore drill | ~400 |

**Hard constraint: C must ship before the first real customer contract is signed on the box.** Until
it does, the system runs the exact failure `DESIGN.md` §10 calls non-negotiable.

## Open questions

- [x] **RESOLVED (orchestrator, 2026-08-22).** `--install-deps` exists in the installed Puppeteer
      **25.4.0**, verified against the binary itself rather than documentation:
      `pnpm --filter @contratos/api exec puppeteer browsers install --help` reports
      `--install-deps  Whether to attempt installing system dependencies (only supported on Linux,
      requires root privileges). [boolean] [default: false]`. Semantics match D1 exactly, including the
      root requirement. The apt list stays an audit/offline fallback, not the mechanism.
- [ ] `age` availability in the chosen Ubuntu release (`apt` in 22.04+); otherwise `gpg` with an
      asymmetric recipient, keeping D7's "no decryption key on the box" property.
- [ ] The exact font family the contract template requests, needed for D2 layer 1 — read from the
      template CSS during implementation, not assumed here.
- [x] **RESOLVED (orchestrator, 2026-08-22).** `.gitignore:5` contains `generated/`, and
      `git check-ignore -v apps/api/generated` confirms it matches. `.cache` is NOT ignored
      (`git check-ignore .cache` returns no match), so only `.cache/` needs `.git/info/exclude`
      to keep the dirty-worktree guard from tripping on the browser cache.
