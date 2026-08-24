# Deploying `contratos` to the HostGator VPS

Everything under `deploy/` is thin, idempotent bash over a design that pushes
every falsifiable guarantee into TypeScript and Vitest so CI can prove it
**before the VPS exists** (see `../openspec/changes/production-deployment/design.md`).
This file documents the parts that only make sense once you are standing in
front of the real host: install order, the audit/offline package fallback,
and where the one remaining question this chain cannot answer gets resolved.

## Quick path

1. Provision the host once, as root: `sudo deploy/provision.sh`, then write
   `/etc/contratos/api.env` with a `DATABASE_URL` built from the password
   it left in `/etc/contratos/db.password` (see "Database" below)
2. Clone the repository into `/opt/contratos` (as `contratos`), then run
   `sudo deploy/provision.sh` again: the last step installs and enables
   `contratos-api.service` from the checkout and skips with a reminder
   while there is none — every other step reports `[skip]` on that re-run
3. Deploy the application: `TAG=v1.2.3 deploy/deploy.sh`
4. Bootstrap TLS: `sudo CONTRATOS_HOST=contratos.example.com deploy/tls-bootstrap.sh`
5. Configure backups: write `/etc/contratos/backup.env` and import the
   recipient's public key (see "Backup" and "Scheduled backups" below).
   `provision.sh` already installed and enabled `contratos-backup.timer`
   on the re-run in step 2 — until `backup.env` exists every nightly run
   fails loudly in the journal, which is the intended state, not an error
6. **Before the first real customer *comodato* is signed**, run one real
   restore drill (see "Restore drill" below) — this is the go-live gate
   (task 10.4).

Every script supports `--dry-run` and needs no VPS to preview: its Vitest
spec `execFile`s it against a scratch temp directory (design.md D8).

## Install order

| Order | Script | What it does | Status |
|---|---|---|---|
| 1 | `provision.sh` | Root-only, idempotent host setup: apt packages, PostgreSQL 17 with the `contratos` role + database (password written once to `/etc/contratos/db.password` — see "Database" below), Node.js 24 (NodeSource) + pnpm 11.11.0 at `/usr/local/bin/pnpm` (the path `contratos-api.service` executes), Chromium's runtime libraries (D1), Spanish-capable fonts, a 2 GB swapfile, the `contratos` service user + directories, git's `safe.directory` for root, and — last, from the checkout — `contratos-api.service` installed and enabled (never started) plus `contratos-backup.service`/`.timer` installed with the timer enabled and started | Done |
| 2 | `deploy.sh` | Stop → dump → checkout → install → migrate → seed → publish → start (D5); the `publish` step calls `publicar-assets.sh` (D4, row 2a) | Done |
| 2a | `publicar-assets.sh` | Additive asset copy, then an atomic `index.html`/`sw.js` swap, then a 2-release retention prune (D4) — see "Asset publish" below | Done |
| 3 | `tls-bootstrap.sh` | HTTP-only bootstrap conf first, so nginx can start before a certificate exists, then issues one via certbot (D6) — see "TLS bootstrap" below | Done |
| 4 | `backup.sh` | Dump the database, copy the PDF tree — always in that order — archive, encrypt asymmetrically, push offsite, prune (D7) — see "Backup" below | Done |
| 5 | `restore.sh` → `verify-restore.sh` | Restore a backup into a SCRATCH database and directory only (never production — guarded), then mechanically prove it via sha256 comparison (D7 cont.) — see "Restore drill" below | **This PR** |
| 6 | `contratos-backup.timer` | Runs `backup.sh` unattended, once a day | **This PR** |

`provision.sh` assumes `/opt/contratos` is (or will become) the git checkout
`deploy.sh` operates on — see "`.cache/` and the git-exclude step" below for
why the order between "clone the repository" and "run `provision.sh`" does
not matter.

## Idempotent-guard plan (`provision.sh --dry-run`)

Every side effect is guarded so a re-run on an already-provisioned host is a
no-op, per `server-provisioning` spec.md's "Idempotent host setup"
requirement:

| Resource | Already present | Not yet present |
|---|---|---|
| Postgres role `DB_ROLE` and database `DB_NAME` (two guards) | `[skip] postgres role 'contratos' already exists (password left untouched)` / `[skip] postgres database 'contratos' already exists` | `[plan] would create postgres role 'contratos' (LOGIN) with a generated password written only to '/etc/contratos/db.password' (root:root, mode 600)` / `[plan] would create postgres database 'contratos' owned by 'contratos'` |
| `contratos` system user | `[skip] user '…' already exists` | `[plan] would create system user '…'` |
| `$APP_DIR`, `$DOCUMENT_STORE_DIR` (`contratos:contratos` 750); `/etc/contratos`, `/etc/contratos/gnupg`, `/var/backups/contratos-offsite` (`root:root` 700 — every path `contratos-backup.service` lists in `ReadWritePaths=`/`GNUPGHOME`) | `[skip] directory '…' already exists` | `[plan] would create directory '…' (owner …, mode …)` |
| Swapfile + its `/etc/fstab` entry | `[skip] swapfile '…' already exists` / `[skip] fstab entry for '…' already present` | `[plan] would create a 2048MB swapfile at '…'` / `[plan] would append '… none swap sw 0 0' to '…'` |
| `.cache/`, `.bash_logout`, `.bashrc`, `.profile` in the git exclude file (one guard per entry) | `[skip] '.cache/' already present in '…'` | `[plan] would append '.cache/' to '…'` |
| Node.js ≥ `NODE_MAJOR` and pnpm = `PNPM_VERSION` on `$PATH` | `[skip] node v… (>= 24) and pnpm 11.11.0 already installed` | `[plan] would install Node.js 24 (NodeSource) and pnpm 11.11.0` |
| `$APP_DIR` in git's system-wide `safe.directory` (`/etc/gitconfig`) | `[skip] '…' already listed in git's system-wide safe.directory` | `[plan] would run: git config --system --add safe.directory '…'` |
| `contratos-api.service` installed from `$APP_DIR/deploy/` (byte-identical) and enabled | `[skip] contratos-api.service already installed at '…' (identical) and enabled` | `[plan] would install '…' as '/etc/systemd/system/contratos-api.service' (mode 644), run systemctl daemon-reload, and enable contratos-api.service — never start it` — or `[skip] '…' not found — clone the repository into '…' and re-run provision.sh …` while there is no checkout yet |
| `contratos-backup.service` + `.timer` installed from `$APP_DIR/deploy/` (both byte-identical), timer enabled **and active** | `[skip] contratos-backup.service and contratos-backup.timer already installed in '…' (identical), contratos-backup.timer enabled and active` | `[plan] would install '…/contratos-backup.service' and '…/contratos-backup.timer' into '/etc/systemd/system' (mode 644), run systemctl daemon-reload, and enable --now contratos-backup.timer` — or the same clone-and-re-run `[skip]` as the API unit |

All nine are asserted by `deploy/provision.spec.ts` against a scratch temp
directory — every path (`SERVICE_USER`, `APP_DIR`, `DOCUMENT_STORE_DIR`,
`ETC_CONTRATOS_DIR`, `GNUPG_HOME_DIR`, `BACKUP_WORK_DIR`, `SWAP_FILE`,
`FSTAB_FILE`, `GIT_EXCLUDE_FILE`, `DB_ROLE`, `DB_NAME`, `DB_PASSWORD_FILE`,
`SYSTEMD_UNIT_DIR`, `API_UNIT_SOURCE`, `API_UNIT_TARGET`, and git's own
`GIT_CONFIG_SYSTEM` for the `safe.directory` guard) is overridable by
environment variable for exactly this reason, in production those variables
keep their defaults (`contratos`, `/opt/contratos`, `/etc/contratos`,
`/var/backups/contratos-offsite`, `/swapfile`, `/etc/fstab`,
`/etc/contratos/db.password`, `/etc/systemd/system`, …). The Postgres and systemd
guards ask the host (`sudo -u postgres psql`, `systemctl is-enabled`), so
the spec puts fakes for `sudo`/`psql`/`systemctl` on that scratch `bin/`
that answer the existence probes and exit 99 on anything that would
mutate — a dry run that reaches DDL or `daemon-reload` fails the spec.
The Node/pnpm guard reads `$PATH` rather than a path variable, so the spec
runs the script under a scratch `bin/` — empty for the bare host, fake
`node`/`pnpm` printing versions for the provisioned one — because the first
real run died at `npx: command not found` on a step this harness had only
ever exercised from a developer machine that already had Node; that plan
line must precede the `npx --yes puppeteer` one, and the spec asserts the
order.

### `.cache/` and the git-exclude step

`contratos`'s home is `/opt/contratos`, which doubles as the checkout
`deploy.sh` runs `git -C` against. Puppeteer's browser cache under that same
tree is ~650 MB and is **not** covered by the repository's own `.gitignore`
(`git check-ignore .cache` finds no match — only `generated/`, at line 5,
is). Left alone, that cache trips `deploy.sh`'s dirty-worktree refusal (D5)
on every single deploy, so `provision.sh` appends `.cache/` to the
unshared `.git/info/exclude` instead. That step only needs the directory
chain to exist, not a real clone yet, so it is safe to run before or after
the first `git clone` into `/opt/contratos`.

The same overlap bites a second time, and it did on the real host:
`useradd --create-home` copies `/etc/skel` into the new home, so
`.bash_logout`, `.bashrc` and `.profile` land untracked inside the checkout,
and `git status --porcelain` (untracked files included) makes the very first
`deploy.sh` refuse over a "dirty" worktree. `provision.sh` excludes those
three as well, one guard per line, so a host provisioned before they were
added still gains them on the next re-run — the table above shows the
`.cache/` line; the other three print the same `[skip]`/`[plan]` shape.

### Database

Installing `postgresql-17` gives a running cluster with nothing in it. On the
real host nothing created the role and database `DATABASE_URL` points at, so
the first thing to ask for them was `deploy.sh`'s `prisma migrate deploy` —
which failed. `provision.sh` now creates both, right after installing
PostgreSQL, as two separate guards (the role and the database can each exist
without the other, like the swapfile and its fstab entry):

- role `contratos` (`LOGIN`), overridable as `DB_ROLE`;
- database `contratos` owned by that role, overridable as `DB_NAME`.

**The password contract.** The password is generated on the host
(`openssl rand -hex 24`) only at the moment the role is created, and written
to exactly one place: `/etc/contratos/db.password` (`root:root`, mode `600`,
overridable as `DB_PASSWORD_FILE`). It is never printed, never passed on a
command line (every statement reaches `psql` on stdin, so `ps` never shows
it), and never stored anywhere else by this script. The operator composes
`DATABASE_URL` from it — the value **must** name this role and database,
otherwise the migration, the seed, `backup.sh` and the service all point at
nothing:

```sh
# /etc/contratos/api.env — root:contratos 0640, see contratos-api.service
DATABASE_URL=postgresql://contratos:<contents of /etc/contratos/db.password>@localhost:5432/contratos
```

**An existing role is never touched.** If `contratos` already exists —
created by hand, or by an earlier run — the step reports
`[skip] postgres role 'contratos' already exists (password left untouched)`
and does not rotate anything: `provision.sh` does not know that role's
password and must not change it out from under a working `DATABASE_URL`.
Rotating is an operator action (`ALTER ROLE … PASSWORD`, then update both
the file and `api.env`). The file is only (re)written together with a
`CREATE ROLE`, so it always holds the password of a role this script made.

Both existence probes run as `sudo -u postgres psql` and are part of
`--dry-run` too: as root the dry run reports `[skip]`/`[plan]` accurately,
as a non-root operator `sudo -n` refuses without prompting and the step
simply plans. A dry run never generates or writes a password
(`provision.spec.ts` asserts the file is absent afterward).

### The API unit's documents path

`provision.sh` installs `contratos-api.service` from the checkout, so the
repository copy is the one that runs — and it was the outlier: it named
`/srv/contratos/documentos` while `provision.sh` (`DOCUMENT_STORE_DIR`) and
`backup.sh` both default to `/opt/contratos/var/documentos`. With
`ProtectSystem=strict`, systemd bind-mounts every `ReadWritePaths` entry
into the service's namespace, and a path that does not exist cannot be
mounted: the first real deploy died at
`status=226/NAMESPACE — Failed to set up mount namespacing:
/run/systemd/unit-root/srv/contratos/documentos: No such file or directory`
until the installed unit was rewritten by hand. The unit now says
`/opt/contratos/var/documentos` everywhere (its header, the `api.env`
example, `ReadWritePaths=`), and `unidades-systemd.spec.ts` reads
`provision.sh`'s own dry-run plan and asserts `ReadWritePaths` equals the
directory it creates — the two cannot drift apart silently again. That same
value is what `ALMACEN_DOCUMENTOS_RUTA` in `/etc/contratos/api.env` must
carry; the schema's default is the *relative* `var/documentos`, resolved
against `WorkingDirectory` (`/opt/contratos/apps/api`), which is not the
same directory.

## Chromium and fonts (D1, D2)

Provisioning resolves Chromium's shared-library dependencies as root, via
`npx puppeteer@25.4.0 browsers install chrome --install-deps`, into a scratch
`PUPPETEER_CACHE_DIR` that is deleted afterward — the dependency resolution
is what is wanted here, not that particular browser download. The browser
binary itself is installed later, at deploy time, by the unprivileged
`contratos` user, whose own cache directory is where the running service
actually looks (the same command `.github/workflows/ci.yml:167` already
runs, for the same reason: a warm pnpm store skips Puppeteer's postinstall
download).

Two things about that step only surfaced on the first real host. Puppeteer's
postinstall runs *before* the CLI command and extracts the Chrome zip with
`unzip`, falling back to the optional `yauzl` package; `npx`'s npm does not
install that optional peer, and a fresh Ubuntu ships no `unzip`, so the
postinstall died at extraction with no output — `provision.sh` now installs
`unzip` as a system package. (`deploy.sh`'s `pnpm install --frozen-lockfile`
was never at risk: `pnpm-lock.yaml` pins `yauzl` as `@puppeteer/browsers`'
optional dependency, so that path extracts without `unzip`; the system
package simply covers both.) The root step also sets
`PUPPETEER_SKIP_DOWNLOAD=1`, so that postinstall does not download Chrome
once before `browsers install chrome` downloads it again into the scratch
cache — `--install-deps` still resolves libraries against that second,
explicit download.

### Render verdict (`pnpm --filter @contratos/api verify:render`)

**Answer first:** `fc-match` returning a font is not proof of anything —
fontconfig always resolves to *something*, silently substituting when the
requested family is missing. So the render verdict is three independent
layers, each proving one thing the others cannot:

| Layer | Tool | Proves | Does NOT prove |
|---|---|---|---|
| Family resolution | `fc-match` | The requested family resolves to **itself**, not a silent substitute | Anything about the produced PDF |
| Glyph embedding | `pdffonts` | A real, known-good font is actually **embedded** in the PDF | Correct glyph shapes |
| Text round-trip | `pdftotext` | The PDF's `ToUnicode` map carries the right codepoints | **Nothing about rasterization** — `pdftotext` reads `ToUnicode`, never the ink, so a PDF full of tofu boxes can still extract the correct characters |

Layer 3 alone is never sufficient for exactly that reason — a tofu render
still round-trips. All three must pass.

**The two font families checked** — read from the template's own CSS, not
assumed:

```
apps/api/prisma/plantillas/v1-comodato.html (identical in v1-condiciones-generales.html)
  line 25:  font-family: "Liberation Serif", "DejaVu Serif", serif;
  line 34:  font-family: "Liberation Sans", "DejaVu Sans", sans-serif;
```

Both are checked, not one — a verdict that only probed the serif face would
pass while every heading (which uses the sans face) rendered as tofu. Layer 1
is strict about the *primary* family only (a substitution to `DejaVu Serif`
still fails it, because it means `fonts-liberation` did not actually
install); layers 2-3 accept either family, because `provision.sh` installs
both `fonts-liberation` and `fonts-dejavu-core` on purpose, and either one
landing in the PDF is real proof that glyph embedding and text extraction
work.

**Relationship to the source-level check.** `seedContent.spec.ts` ("uses
only fonts that exist on a bare Ubuntu server…") already asserts the
template's CSS *declares* the right families with a generic fallback — a
**source-level** check on what the template asks for. `verify:render` is the
**runtime** half: whether the host actually resolves those families and
whether the produced PDF actually embeds and extracts them. The two are
complementary, not duplicated — one without the other misses half the
failure mode.

Rejected: pixel comparison against a CI-generated golden PNG — decisive, but
a font package update changes pixels and turns provisioning red for a
non-defect. Recorded as the escalation path if the layered check ever passes
on a tofu render, not the default mechanism.

`fc-match`, `pdffonts` and `pdftotext` are opportunistic system tools, not
project dependencies (same status `pdftotext` already had in
`GeneradorDeDocumentosPuppeteer.integration.spec.ts`). A tool missing on
PATH is reported plainly as a failed layer, never silently skipped and never
faked — which is exactly what the fresh host did: `verify:render` came back
`RECHAZADO` with both PDF layers reporting a missing tool, and `APROBADO`
right after `apt-get install poppler-utils`. Opportunistic for the
*verifier*, required for the *checklist*: `provision.sh` installs
`poppler-utils` (`pdffonts`, `pdftotext`) in its package list, so the
verdict below can pass on a host it provisioned; `fc-match` comes with
`fontconfig`, already there.

**Pre-VPS caveat, stated explicitly:** `verify:render`'s pure parser
(`apps/api/scripts/renderVerdict.ts`) is unit-tested from fixtures, and its
driver (`apps/api/scripts/verificarRender.ts`) is exercised end to end in
`pnpm --filter @contratos/api test:integration` — both against whatever host
runs them (a dev machine, CI). **Neither proves anything about the real
production VPS.** That host's actual installed fonts are only verified by
running `pnpm --filter @contratos/api verify:render` there, after
`provision.sh`, which is the checklist item below — real host fonts remain
unverifiable pre-VPS.

### 36-package apt fallback list (audit / offline reference only)

**This list is not what `provision.sh` runs.** D1 rejected hardcoding it as
the primary mechanism: package names drift across Ubuntu releases (the
64-bit `time_t` transition alone renamed several `lib*` packages), and
`--install-deps` resolves the correct names for whatever distribution is
actually running. It is kept here only as an audit trail and as a manual
fallback if `--install-deps` is ever unavailable (e.g. an air-gapped host).

Verified directly against Puppeteer's own troubleshooting documentation
during implementation (not assumed — the source most often cited for this
list rounds it to "37 packages"; the current `troubleshooting.md` lists 36):

```
ca-certificates    libcups2            libxcb1
fonts-liberation    libdbus-1-3         libxcomposite1
libasound2          libexpat1           libxcursor1
libatk-bridge2.0-0   libfontconfig1      libxdamage1
libatk1.0-0          libgbm1             libxext6
libc6                libgcc1             libxfixes3
libcairo2            libglib2.0-0        libxi6
                     libgtk-3-0          libxrandr2
                     libnspr4            libxrender1
                     libnss3             libxss1
                     libpango-1.0-0      libxtst6
                     libpangocairo-1.0-0 lsb-release
                     libstdc++6          wget
                     libx11-6            xdg-utils
                     libx11-xcb1
```

Spanish-text rendering additionally needs `fonts-dejavu-core` and
`fonts-liberation` plus a `fc-cache -f -v` refresh (DESIGN.md §10) — all three,
`fontconfig` included, are in `provision.sh`'s own package list, not just this
fallback reference. `fontconfig` is listed explicitly even though
`--install-deps` pulls it in transitively (via `libpango-1.0-0`): relying on
that would mean relying on the stability of the very list D1 calls unstable,
and `fc-cache` would then fail mid-run, after PostgreSQL is already installed.

## Seed fail-closed gate (D3)

**Answer first:** in `NODE_ENV=production`, `apps/api/src/seed/seedDatabase.ts`
now refuses to finish seeding — it throws, naming the missing environment
variable — when either the `admin` or `tecnico` account cannot be created
because its password variable was never set. It does **not** throw when the
account already exists. That distinction is the entire point:

| Account result | Meaning | Production behaviour |
|---|---|---|
| `omitido` | No `SEED_ADMIN_PASSWORD` / `SEED_TECNICO_PASSWORD` was set, so the account was never created | **Throws** — deploy fails loudly, before reporting success |
| `already-present` | The account already exists (from an earlier seed run) | **Never throws** — nothing needed to happen, so nothing did |
| `created` | The password was set and the account did not exist yet | Seeds normally |

### How `NODE_ENV=production` actually reaches the seed

Every row of that table depends on `NODE_ENV` being `production` in the
seed's own process, and nothing sets it for you. `prisma:seed` runs outside
systemd, so it inherits nothing from the unit's `EnvironmentFile=`;
`deploy.sh`'s `load_env_file_into_environment` exports an explicit whitelist
and `run_as_service_user` passes an explicit `--preserve-env` list, neither
of which carries it; and `dotenv/config` in `prisma/seed.ts` loads
`apps/api/.env`, which does not exist on this server — the configuration
lives in `/etc/contratos/api.env`. Writing `NODE_ENV=production` into that
file changes nothing for the seed.

`deploy.sh` therefore states it in the command itself (`seed_command`), which
is why `--dry-run` prints the assignment as part of the plan. It is not read
from `$ENV_FILE` on purpose: a value taken from there fails open again the
first time an operator leaves the line out, and the guards this protects are
exactly the ones that must never fail open.

**Running the seed by hand.** The recovery path below does not go through
`deploy.sh`, so nothing sets it for you there either — set it explicitly:

```sh
cd /opt/contratos/apps/api && NODE_ENV=production pnpm prisma:seed
```

Without it, the seed reports success while every gate in this section is
inert, including the refusal to seed with the placeholder signature.

**Why this lives in the application, not in `deploy.sh` (design.md D3).** A
guard grepping the env file inside `deploy.sh` protects only deploys that go
through that script. The recovery path an operator actually reaches for
under pressure — `pnpm --filter @contratos/api prisma:seed`, run by hand —
never goes through `deploy.sh` at all, so a script-level guard would not see
it. The gate lives where the lie would otherwise happen: before this change,
`seedDatabase.ts` already *said* (in `describeSeedReport`'s `ATENCION`
warnings) that skipping the técnico account makes the signing flow
unreachable, then still exited 0. This change turns that warning into a
refusal in production; the warning text itself, and the non-production
behaviour, are unchanged.

**Why `already-present` never throwing is load-bearing, not an oversight.**
Consider a routine, correctly-run redeploy: an operator provisions
production, sets both passwords, seeds successfully — then, for good
security hygiene, rotates both passwords out of the environment file, since
the accounts already exist and nothing needs to recreate them. The next
redeploy resolves both accounts to `already-present`. If the gate fired on
anything other than `omitido`, **every redeploy from that day forward would
fail**, in the startup path, on a machine where the fix is not obvious. A
fail-closed gate that also fails on the healthy path is not a safety
feature — it is an outage generator wearing a security justification.
`seedDatabase.spec.ts`'s regression test seeds both accounts once, rotates
both passwords out, then reseeds in production and asserts no throw — the
scenario above, exercised directly.

## Deploy sequence (D5)

**Answer first:** `deploy/deploy.sh` gets a git tag onto the server and into
service in this order, and only this order:

```
stop → dump → checkout → install → migrate → seed → publish → start
```

```
sudo TAG=v1.2.3 deploy/deploy.sh
deploy/deploy.sh --dry-run   # preview the plan and run every guard, no root
```

`deploy.sh` is the single most dangerous script in this repository: its real
job is to stop the running production service. Every check that can refuse
runs **before** that happens — an outage for nothing is worse than no deploy
at all. Three guards run first, unconditionally, in both `--dry-run` and a
real deploy:

| Order | Guard | Refuses when | Why it must come first |
|---|---|---|---|
| 1 | Git repository selection (threat matrix, **Applicable**) | `$APP_DIR` is missing, is not a git checkout, or its `git rev-parse --show-toplevel` disagrees with `$APP_DIR` itself, or it has no `$GIT_REMOTE_NAME` remote configured | `deploy.sh` always runs `git -C "$APP_DIR"`, never bare `git` reading cwd — this guard additionally refuses to fall back to whatever repository the operator happens to be standing in when `$APP_DIR` itself is not a valid target |
| 2 | Commit state (threat matrix, **Applicable**) | `git -C "$APP_DIR" status --porcelain` is non-empty | A hot-fixed server worktree must never be silently discarded. The guard only *reads* `git status` — `deploy.sh` never calls `git reset --hard` or any `--force` flag anywhere, so there is nothing in the script that could discard the uncommitted change even if this check were bypassed |
| 3 | Required configuration (deployment-configuration spec.md) | `$ENV_FILE` is missing, or `DATABASE_URL`/`JWT_SECRET` is absent or empty in it | The app itself needs both to boot at all; failing here, before the stop, means the previous version keeps running instead of going down for a config typo |

**Root and a `contratos`-owned checkout.** `deploy.sh` runs as root, but
`/opt/contratos` belongs to `contratos`, and git refuses to read a repository
owned by another user ("detected dubious ownership") — on the real host every
`git -C /opt/contratos` failed and guard 1 reported "not a git checkout" for
a perfectly good clone. `provision.sh` therefore runs
`git config --system --add safe.directory /opt/contratos` (idempotent — it
skips when the path is already listed). System scope on purpose: it applies
to root no matter which `HOME` `sudo` hands it, unlike `--global`.

Only after all three pass does `deploy.sh` stop the service and run the rest
of the sequence: dump the database (`pg_dump -Fc`, local, pre-migration —
distinct from `backup.sh`'s encrypted offsite copies in PR7/D7), check out
the tag, install dependencies and build the web app as the unprivileged
`contratos` user (installing the Chromium browser itself here, per D1 — the
same reason `.github/workflows/ci.yml` runs that command explicitly), run
pending Prisma migrations (deploy-time only — the systemd unit has no
`ExecStartPre=` on purpose, so a crash-loop restart never re-runs a
migration), seed the database (fails closed per D3, above), publish the web
assets (`publicar-assets.sh`, D4 — lands in PR5; `deploy.sh`'s own plan only
names this step, it does not require the script to exist yet), then start
the service and poll `GET /salud` with retries. A failed health check prints
a rollback recipe to stderr and exits non-zero — `deploy.sh` never attempts
an automatic rollback on its own.

### The env-var preflight, and the seed-password design decision

`deploy.sh` reads `$ENV_FILE` (default `/etc/contratos/api.env`, the same
file `contratos-api.service`'s `EnvironmentFile=` points at) without
sourcing it, the same "supplying the environment is the operator's job"
posture `configuracion.ts` documents for the application itself.
`DATABASE_URL` and `JWT_SECRET` are always required. **`SEED_ADMIN_PASSWORD`
and `SEED_TECNICO_PASSWORD` are required only when `FIRST_DEPLOY=true` is
set explicitly.**

This is a deliberate design decision, not an oversight: the
deployment-configuration spec asks for seed credentials to be required "when
seeding", and `deploy.sh` always runs the seed step, so an unconditional
requirement would directly break the seed fail-closed gate's own regression
guard (above) — the operator rotating both seed passwords out of
`$ENV_FILE` once the accounts already exist, so that a routine redeploy
still succeeds. Set `FIRST_DEPLOY=true` only for the very first deploy, when
the admin/técnico accounts do not exist yet; leave it unset on every later
one. `seedDatabase.ts`'s own D3 gate remains the actual guarantee either
way — this preflight is only a convenience that turns a foreseeable failure
into a pre-stop refusal instead of a mid-deploy one.

### `CONFIAR_EN_PROXY` in production

`deploy.sh` does not set or check `CONFIAR_EN_PROXY` itself — it is one of
the variables `$ENV_FILE` must already carry, documented in `.env.example`
(task 1.2). Leaving it `false` behind nginx's reverse proxy makes the rate
limiter attribute every técnico's request to `127.0.0.1`, collapsing them
into one shared quota; production must set it to `true`.

## Asset publish (D4)

**Answer first:** `deploy/publicar-assets.sh` moves a `vite build` output
(`apps/web/dist`, never `apps/api` — the API has no `dist/` and is not
involved here) into `deploy/nginx.conf`'s `root` (`/var/www/contratos`) in
exactly this order, and only this order:

```
1. copy hashed assets, icons, manifest.webmanifest   (additive — no --delete)
2. swap index.html into place                        (atomic)
3. swap sw.js into place                              (LAST)
4. write .releases/<timestamp>.files
5. prune manifests beyond the 2 newest, and any asset only they reference
```

```
deploy/publicar-assets.sh              # apply
deploy/publicar-assets.sh --dry-run   # preview the plan, no writes, no VPS
```

Called from `deploy.sh`'s `[plan:publish]` step (D5, above) — but it is
independently testable: its own `--dry-run` plan is what
`publicar-assets.spec.ts` exercises, exactly like `provision.sh` and
`deploy.sh` (D8). `deploy.sh`'s plan only names this script by path; nothing
about that dry-run test required this script to exist before it did.

### Why `sw.js` publishes last — the mechanism, not just the rule

This is the part that is easy to state as a rule and easy to get wrong for
the wrong reason, so here is the actual failure it prevents.

`vite build` (via `vite-plugin-pwa`, `apps/web/src/pwa/configuracionPwa.ts`)
generates `sw.js` with a workbox **precache manifest**: a list of every app
shell file the service worker should cache, each entry carrying a
`revision` — a hash workbox uses to decide whether it already has the
current bytes for that URL. `index.html` is one of those entries.

Picture publishing `sw.js` **first**, before `index.html` is swapped:

1. `sw.js` now on disk already advertises the **new** revision hash for
   `index.html`.
2. A browser tab installs this new worker (or a técnico opens the PWA for
   the first time and its worker installs immediately). Workbox's install
   step fetches `index.html` to populate the precache — but `index.html` on
   disk is still the **old** file, because step 2 of the publish order
   (the atomic swap) has not run yet.
3. Workbox stores those OLD bytes, keyed under the NEW revision hash it
   already had from `sw.js`.
4. From workbox's point of view, that revision is now satisfied. It never
   re-fetches `index.html` for that revision again — that is the entire
   point of a revisioned precache entry, and it is exactly what makes this
   failure permanent instead of self-correcting.

That client is now stuck serving the OLD app shell forever, under a
revision hash that claims to be current. There is no reload, no retry, no
next-deploy fix: the only way out is a técnico (or a support engineer
walking them through it) manually clearing site data on the tablet — in
the middle of, or right before, a customer visit. This is not a race that
resolves itself; it is a poisoned cache entry with no expiry.

Publishing `index.html` before `sw.js` closes this off structurally: any
worker that installs against the new `sw.js` can only ever find the NEW
`index.html` already sitting at the path it fetches. There is no window in
which the two files it correlates by hash can disagree.

**Why an in-flight session survives the swap regardless.**
`configuracionPwa.ts` sets `skipWaiting: false`, `clientsClaim: false`,
`registerType: "prompt"` (see that file's own header comment, D9) — a tab
with an already-activated worker keeps running its current precache and
does not adopt the new one until the técnico explicitly accepts the update
prompt. The additive asset copy (step 1) plus the 2-release retention
policy (below) covers what that activated-worker guarantee does not: a
first visit whose worker has not activated yet, and a hard/shift-reload
that bypasses the service worker entirely — both would otherwise 404 on a
hashed asset the currently-loaded shell still references, if that asset
had already been deleted by a newer deploy.

### 2-release retention policy

Every real (non-`--dry-run`) run writes `.releases/<timestamp>.files` —
every file path that release published, relative to `apps/web/dist`. After
writing its own manifest, the script keeps only the **2 newest** manifests
(this release's own, plus the immediately previous one) and, for every
older manifest, deletes both the manifest itself and any file it lists
that no retained manifest also lists — an asset only an already-superseded
release ever referenced.

`RETENTION_COUNT` overrides the number, and the script refuses anything
below 1 in its preflight. The release being published is itself one of the
retained releases, so `RETENTION_COUNT=0` — a plausible thing to write
meaning "keep no old releases" — would prune the manifest the run had just
written and delete every file it lists, `index.html` and `sw.js` included,
leaving the web root empty while still exiting 0 and reporting `published`.
Verified before the guard existed. 1 is the floor: it keeps the current
release and nothing else.

Retaining 2, not 1, is deliberate: it gives the previous release's assets
one full deploy cycle of grace after the newest one lands, covering a tab
whose service worker has not yet adopted the new precache (per D9's
`skipWaiting: false` above) and still has in-flight requests for the
previous shell's hashed bundle names. Pruning runs on **every** real
publish, so a release stays retained only through the deploy immediately
after it supersedes — it is not a fixed time window, it is a fixed
release-count window.

**Not solved by this script, named explicitly:** the API restart inside
`deploy.sh`'s own `stop`→…→`start` sequence still drops any
`POST /contratos/:id/firmar` request in flight at the moment
`systemctl stop` runs. A signature submission mid-flight when a deploy
starts is lost from the técnico's point of view — a real drain would need
a second `contratos-api` instance to shift traffic to while the first
restarts, and a 4 GB VPS (`state.yaml`) cannot host a second instance
alongside Postgres, Chromium's render queue, and the OS. No mitigation is
implemented here; it stays operator scheduling — deploy outside técnico
visit hours. Recorded here, not invented as a fix task 5.10 does not ask
for.

## TLS bootstrap (D6)

`deploy/nginx.conf:55-56` reads a certificate from
`/etc/letsencrypt/live/__CONTRATOS_HOST__/{fullchain,privkey}.pem` — paths
that do not exist until a certificate has been issued. Installing that file
as-is on a fresh host makes nginx refuse to start: the chicken-and-egg
`tls-bootstrap.sh` exists to break.

### Why an HTTP-only conf goes first

```
install nginx-bootstrap.conf (port 80: ACME location + 503 catch-all)
  → nginx -t → reload                        ← nginx is now serving, no cert needed
  → certbot certonly --webroot               ← cert now exists
  → render deploy/nginx.conf, install it
  → nginx -t                                 ← HARD GATE, see below
  → reload
  → install the renewal deploy hook
```

`deploy/nginx-bootstrap.conf` answers the ACME challenge at
`/.well-known/acme-challenge/` and returns **`503`** for everything else —
not a `301` redirect to `https`. An origin with no certificate has nothing
to redirect *to*; a redirect there is a dead end that also hides which
state the host is in from whoever is looking. `503` says it plainly. This
file is installed as-is, never rendered: only `deploy/nginx.conf` is a
template.

### The `__CONTRATOS_HOST__` / `__WEB_ROOT__` template, and its guard

Task 6.1 replaced `deploy/nginx.conf`'s literal `contratos.iesnet.com.ar`
(`server_name`, both `ssl_certificate*` paths) and `/var/www/contratos`
(`root`) with `__CONTRATOS_HOST__` / `__WEB_ROOT__`. `tls-bootstrap.sh`
substitutes both via `sed` into a scratch file, then greps that output for
any surviving `__[A-Za-z0-9_]+__` pattern — **before touching nginx at
all**, in both `--dry-run` and a real run:

- An empty or unset `$CONTRATOS_HOST` is caught by its own explicit guard
  (there is no sensible default — a wrong-but-present one would silently
  render the wrong host into a live TLS certificate request).
- A surviving literal token is caught by the grep guard even when
  `$CONTRATOS_HOST`/`$WEB_ROOT` are both set correctly — this is what
  catches **template drift**: a future edit to `deploy/nginx.conf` that
  introduces a new `__TOKEN__` this script does not yet know how to
  substitute must still refuse loudly, not render a broken conf and
  install it.

Neither guard needs root, nginx, or a VPS — both run in CI today
(`tls-bootstrap.spec.ts`, tasks 6.2/6.3).

### `nginx -t` as a hard gate — nginx must never end a run unable to start

After certbot succeeds and the rendered `deploy/nginx.conf` is copied into
`/etc/nginx/sites-available/contratos`, the symlink at
`/etc/nginx/sites-enabled/contratos` is repointed to it and `nginx -t` runs
**against that file** before anything reloads:

- **Pass** → reload. `contratos` is now served over TLS.
- **Fail** → the symlink is repointed **back** to the bootstrap conf
  (already proven valid by the earlier `nginx -t` in the sequence above),
  nginx reloads on that, and the script exits `1`. The host is left
  serving a `503` from a conf already known to pass its own test — never
  left with no valid config to reload at all.

A TLS script that fails halfway and leaves nginx dead has turned a
certificate problem into a total outage. This rollback path is the reason
the bootstrap conf stays on disk permanently, not just during first-issue.

### certbot is installed by this script, and only by this script

`provision.sh` does not install certbot and no other script in `deploy/`
does either, so `tls-bootstrap.sh` installs it alongside nginx. Without that,
the run gets as far as installing the bootstrap conf and reloading nginx and
then dies on `certbot: command not found`, inside the one script whose whole
job is breaking a chicken-and-egg. The **apt package** specifically — not a
snap or a pip install — is also what ships the systemd renewal timer the
next section depends on.

`CERTBOT_EMAIL` is optional but worth setting. Without it the script
registers with `--register-unsafely-without-email` and says so in a `[warn]`
line: renewal is automatic, so the address only matters once renewal has
already been failing quietly — which is exactly when an expiry warning is
the only thing left between the site working and the site going dark.

`CERTBOT_WEBROOT` is overridable, but `nginx-bootstrap.conf` is installed
as-is and carries the ACME `root` as a literal, so the two must agree. The
script reads the path out of that conf and refuses a mismatch before
touching nginx — otherwise certbot writes the challenge where nginx does not
look for it, and issuance fails on a 404 with both paths looking
individually correct.

### Renewal: certbot renews, nginx has to be told

Certbot's own packaged systemd timer renews the certificate on its
schedule — that part needs no help. What it does not do on its own is make
nginx *serve* the renewed file: nginx keeps whatever certificate it loaded
into memory at its last reload, even after the on-disk file is current.
`deploy/renewal-hook-nginx.sh`, installed at
`/etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh`, is the missing
piece — certbot runs every executable in that directory automatically
after a **successful** renewal only, so the hook is simply
`nginx -t && systemctl reload nginx`: test first, reload only if the test
passes, so a renewed certificate is never paired with a reload of a config
that cannot even start.

## Backup (D7)

Every signed *comodato* on this server exists in exactly one place until this
script runs: the box itself. `backup.sh` produces a daily, offsite, encrypted
copy — database and PDF archive together — that a *different* machine could
lose the VPS and still recover from.

### Why the database dumps before the PDF tree is copied — never the reverse

```
pg_dump -Fc  (dump-first)
  → copy the PDF tree (ALMACEN_DOCUMENTOS_RUTA)
  → archive, encrypt, push offsite
```

This order is a falsifiability argument, not a preference. A `contrato_documentos`
row and its PDF file are written at different times during signing; a backup
that spans that gap will always miss one side of a contract written mid-run.
Which side is chosen by which step runs first:

- **Dump first (chosen).** A PDF written after the dump completes is simply
  not yet referenced by any row in the dump — an **orphan file** the backup
  carries but nothing needs. Harmless.
- **Copy first (rejected).** A row committed after the PDF copy completes
  points at a file the backup never captured. A restore then reconstructs a
  database that *claims* a signed contract has a document, when the backup
  holds no such file — the exact failure mode `deploy/backup.spec.ts`
  (task 8.1) asserts can never happen, by asserting `[plan:dump]` always
  precedes `[plan:copy-documents]` in the printed plan.

PR8's restore verifier (`verificarRestauracion.ts`) is what turns "orphan
file, harmless" from an argument into a proven fact: it warns on an orphan,
never fails on one, and fails hard on the reverse (a row with no file).

### Encryption: `age`, asymmetric — `gpg --recipient` as the fallback

Design D7's property in one sentence: **no key capable of decrypting a
backup may live on the VPS that produced it.** An attacker who compromises
the server must not thereby gain every historical backup of every signed
contract — which is exactly what a symmetric passphrase sitting in
`backup.env` would hand them, encrypted-looking or not.

**Chosen: `age`, with a recipient public key.** Confirmed packaged (verified
directly against `packages.ubuntu.com`, not assumed) for both plausible LTS
targets — Ubuntu 22.04 (jammy) and 24.04 (noble), both in `universe`. `age`
needs only the recipient's public key string (`age1...`) to encrypt; the
VPS never needs a local keyring or an import step, and the matching secret
key never has to exist anywhere the backup pipeline touches.

Packaged is not installed: on the real host neither `age` nor `rclone` was
present, and the first backup attempt stopped at the tool lookup until both
were apt-installed by hand (`age 1.0.0`, `rclone v1.53.3`, jammy's
`universe`). `provision.sh` now installs both in its package list — `rclone`
for the offsite push, `age` for the encryption — so a host it provisioned
can run `backup.sh` without that detour; the `gpg --recipient` fallback
below stays exactly as it is.

**Fallback: `gpg --recipient` (asymmetric — not `gpg --symmetric`).** If
`age` is ever absent from `$PATH` at runtime, `encrypt-backup-archive.sh`
falls back to gpg's own asymmetric mode. This still satisfies D7: `gpg
--recipient` encrypts to a public key already imported into the operator's
keyring, and decrypting needs the matching *secret* key, which likewise
never touches the VPS. Design D7's rejected choice is specifically `gpg
--symmetric` (a shared passphrase) — asymmetric `gpg --recipient` was never
rejected, only judged less convenient than `age`.

**Honesty about what ran for real here.** `age` itself is not an installed
binary on the machine this PR was implemented on (only `gpg` is present),
and this apply run does not install system packages — on the VPS it is now
`provision.sh`'s job (see above), which changes nothing about what this
development machine can prove. `encrypt-backup-archive.spec.ts`'s
round-trip test therefore exercises the **gpg fallback** for real: a
throwaway keypair generated in the test's own temp `$GNUPGHOME`, a real
encrypt, a real decrypt proving byte-identical output, and a real decrypt
*failure* against an empty keyring proving the archive is unreadable
without the key. A second, structural test proves the tool-**selection**
logic itself prefers `age` whenever it is present on `$PATH`, using a
mocked `age` binary — the same PATH-injection pattern
`renewal-hook-nginx.spec.ts` already established for `nginx`/`systemctl`.
Both paths are exercised; only one ran against a real cryptographic
round-trip on this machine, and that gap is recorded here rather than
implied away.

### `backup.env` — new to this PR, never committed

`backup.sh` reads `DATABASE_URL` from the *same* `/etc/contratos/api.env`
`deploy.sh` already reads (no credential duplication). Everything new to
this PR — the `rclone` remote configuration and the encryption recipient —
lives in a second file, `/etc/contratos/backup.env` (root-owned, `0600`,
created by an operator on the host, never git-tracked):

```sh
# /etc/contratos/backup.env — created on the host, root:root, chmod 0600
RCLONE_REMOTE=offsite:contratos-backups
# rclone needs no config file on disk: every RCLONE_CONFIG_<REMOTE>_* key
# below is read straight from the environment (rclone's own supported
# mechanism). backup.sh exports every KEY=value line in this file into its
# own process environment before invoking rclone.
RCLONE_CONFIG_OFFSITE_TYPE=s3
RCLONE_CONFIG_OFFSITE_PROVIDER=<provider>
RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=<real value, operator-supplied>
RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=<real value, operator-supplied>
# age (preferred) — the recipient PUBLIC key; no secret key belongs here
# or anywhere else on this host.
AGE_RECIPIENT=age1<real recipient public key>
# gpg fallback only, if age is ever absent from $PATH — the recipient's
# key fingerprint; the PUBLIC key itself must already be imported into
# gpg's own keyring before backup.sh can encrypt to it.
GPG_RECIPIENT=<real fingerprint>
```

Task 8.7's repo scan searched for a committed `backup.env`, any file whose
name matches `*.env`/`*secret*`/`*credential*`, any `RCLONE_CONFIG_*_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`/`_TOKEN`/`_PASS` literal assignment, any
`AGE-SECRET-KEY-1` string, and any `BEGIN PGP PRIVATE KEY BLOCK` marker,
across tracked files, untracked files, and this PR's own diff. **Found:
none.** The only `age1...`-shaped string in this PR is the fixture value
`encrypt-backup-archive.spec.ts` uses to prove tool-selection — its own
literal text (`age1fakepublickeyusedonlybythistest...`) makes clear it is
not a real key.

### Retention: 30 remote, 2 local

```
prune-remote → keep the 30 most recent, delete older (offsite, `rclone`)
prune-local  → keep the 2 most recent,  delete older (`$BACKUP_WORK_DIR`,
                                                        a local safety net,
                                                        not the offsite copy)
```

Artifacts are named `contratos-backup-<timestamp>.tar.enc` — the same
ISO-8601-like-prefix convention `publicar-assets.sh`'s `.releases/*.files`
manifests already use, so a lexical sort is also a chronological sort, and
the prune arithmetic (list, sort, keep the newest N, delete the rest) is
the same head/tail split `do_prune_old_releases` already uses. `deploy/backup.spec.ts`
(task 8.5) proves this for real against 31+ dated artifacts, no VPS
needed: a mocked `rclone` binary treats a local scratch directory as the
"remote," so the listing, sorting, and deletion logic itself runs
unmocked — only the network transport is a stub.

The prune only ever considers — and only ever deletes — files whose names
end in `.tar.enc`, this script's own artifacts. `rclone lsjson` lists
everything at the remote path, so without that filter a file an operator
keeps in the same bucket would both count toward the 30 and be deleted as an
"old backup".

`RETENTION_REMOTE_COUNT` must be at least 1 and the run refuses anything
lower. At 0 nothing is retained, so every offsite artifact — including the
one that run just pushed — lands in the pruned set, and the remote copy is
the only one that survives losing this host. `RETENTION_LOCAL_COUNT=0` is
allowed, because "offsite only, keep nothing on the box" is a real policy
and the artifact it deletes is already at the remote by then.

A remote that cannot be listed fails the run rather than reading as a remote
holding no backups — an unreachable offsite store must never look like
"nothing to prune" and report success.

`deploy/backup.sh --prune-only` re-runs retention pruning alone, without
taking a new backup — useful after a retention-count change, or to clean up
a remote left over-quota by a partially failed push. It needs only
`RCLONE_REMOTE` (from `backup.env`); unlike a full backup run, it needs
neither `DATABASE_URL` nor an encryption recipient, since it never dumps or
encrypts anything.

## Restore drill (D7 cont.)

**A backup nobody has ever restored is a belief, not a backup.** `backup.sh`
produces an offsite, encrypted copy; `restore.sh` and
`verificarRestauracion.ts` are the half that turns "we believe this backup
is good" into "we mechanically proved it, by re-hashing every file against
the sha256 `schema.prisma:279` already stores per document."

### `restore.sh` — the first thing it does is refuse

`restore.sh`'s entire job is to overwrite a database and a document tree
from a backup archive. That makes it the most dangerous script in this
repository, more dangerous than `deploy.sh` — a bad `deploy.sh` run breaks
the running service; a bad `restore.sh` run destroys data. The **first**
thing it checks, before touching anything, is whether its own target is
production:

```
DATABASE_URL=<target> ALMACEN_DOCUMENTOS_RUTA=<target> ARCHIVE_FILE=<path> \
  deploy/restore.sh
```

`restore.sh` reads its restore **target** from the exact same environment
variable names the application, `deploy.sh` and `backup.sh` already use —
`$DATABASE_URL` and `$ALMACEN_DOCUMENTOS_RUTA` — deliberately, not a
differently-named "restore target" variable. The scenario this guards
against is a tired operator at 2am running a restore drill in a shell that
still has the **production** `$DATABASE_URL` exported from something else
they were doing earlier. If that target equals the production value
recorded in `$ENV_FILE` (default `/etc/contratos/api.env`, the same file
`deploy.sh`/`backup.sh` read), `restore.sh` **refuses — non-zero exit, no
writes** — never a warning, never a prompt to confirm. `restore.spec.ts`
(task 9.1) proves this for both variables independently, proves the guard
does NOT fire when the target genuinely differs from production, and
proves it stays silent (does not fail) when `$ENV_FILE` itself does not
exist — the ordinary case on a genuine scratch host, which has no
production config to compare against at all.

Only after that guard passes does `restore.sh` do anything: decrypt the
archive (age or gpg, mirroring `encrypt-backup-archive.sh`'s tool
resolution — but decrypting needs the **identity/secret key**, which by
design never lives on the production VPS; `restore.sh` reads it from
`$AGE_IDENTITY_FILE` or an already-imported gpg secret key on whatever
scratch host is running the drill), extract the tar, `pg_restore --clean
--if-exists` into the target database, copy the PDF tree into the target
directory, then hand off to `verify-restore.sh`.

### The restore target must be empty, and `restore.sh` will not empty it

`do_restore_documents` copies additively (`cp -a src/. dst/`) and never
clears the target. A PDF left there by an earlier drill therefore stands in
for one **this** archive is missing: `verificarRestauracion` finds the row's
file present, and — being the same document — its sha256 matches, so neither
`faltantes` nor `desajustados` fires. The drill reports a clean restore of a
backup that cannot actually be restored, which is the single thing the
go-live gate below leans on it never doing.

So the preflight refuses a non-empty `$ALMACEN_DOCUMENTOS_RUTA`. It refuses
rather than clearing: this script never deletes what an operator pointed it
at. Point it at a fresh directory, or empty the old one deliberately.

### `verify-restore.sh` — a thin wrapper, on purpose

```
DATABASE_URL=<scratch target> ALMACEN_DOCUMENTOS_RUTA=<scratch target> \
  deploy/verify-restore.sh
```

All of the actual verification logic lives in TypeScript
(`apps/api/prisma/restauracion/verificarRestauracion.ts`), not in bash —
same reasoning as the render verdict (D2) and the seed gate (D3): a
falsifiable guarantee belongs where it can be unit- and integration-tested
in CI, not re-implemented in shell. `verify-restore.sh` only sets up the
working directory and lets `$DATABASE_URL`/`$ALMACEN_DOCUMENTOS_RUTA`
(already in its environment, courtesy of `restore.sh`) reach
`pnpm --filter @contratos/api verify:restore` unchanged.

### `verificarRestauracion.ts` — streaming, and four outcomes, not two

**Answer first:** it streams every `contrato_documentos` row's file into a
sha256 hasher and compares it against the hash the row already carries,
computed server-side when the PDF was sealed (`schema.prisma:279`). Two
things stream deliberately, matching `prisma/backfill/nombreDeBusqueda.ts`'s
established shape (exported pure function plus a thin `jiti` CLI entry):

- **Rows** are paged with keyset pagination (`cursor`/`id`, 200 at a time),
  never loaded into memory all at once.
- **Files** are piped through `crypto.createHash("sha256")` via a readable
  stream (`createReadStream` → `pipeline`), never read whole with
  `readFile`. A production archive is not small, and Chromium-rendered
  contract PDFs are not tiny — a verifier that reads every file whole would
  OOM on exactly the archive it exists to verify.

Four outcomes, not a pass/fail binary — `deploy/README.md`'s own honesty
convention applies here too:

| Outcome | Meaning | Result |
|---|---|---|
| `faltantes` | a row exists, its file is absent on disk | **fails** (exit 1) |
| `desajustados` | a file exists, its real sha256 differs from the row | **fails** (exit 1) |
| `huerfanos` | a file exists, no row references it | **warns only** — never fails on this alone |
| `total === 0` | nothing was checked at all | **fails outright**, even with zero other findings |

**Why `huerfanos` warns instead of failing.** `backup.sh` dumps the
database BEFORE copying the PDF tree, specifically so a race between the
two steps can only ever strand a harmless orphan file, never an
unrecoverable row (see "Backup (D7)" above). A row committed after the
dump completes but before the PDF copy finishes is never in the restored
database at all — the dump already ran before it existed — but its file,
already on disk by the time the copy step runs, DOES end up in the
restored document tree. The restored state is exactly "a file with no row
to reference it": `huerfanos`, never `faltantes`. Treating that as a
failure would punish the safe direction `backup.sh`'s ordering was
designed to take. `verificarRestauracion.integration.spec.ts`'s dedicated
case for this (task 8.2) constructs precisely that scenario against CI's
real Postgres 17 container and asserts `faltantes` stays empty while
`huerfanos` carries the orphan.

**Why `total === 0` fails outright.** A verifier that checks zero documents
and exits `0` is worse than no verifier at all — it produces a green light
nobody earned. An empty restored database (a genuinely broken restore, or
a drill run against the wrong target) must never look identical to "every
document verified."

### Honesty about what ran for real here

`restore.spec.ts` proves the production-target refusal guard for real, no
VPS needed (task 9.1) — six scenarios, including the two "does NOT refuse"
control cases that prove the guard evaluates real values instead of
hardcoding a refusal. `verificarRestauracion.integration.spec.ts` proves
the hash comparator for real against CI's live Postgres 17 container and
real file bytes on disk — six scenarios covering all four outcomes above,
including a deliberately corrupted fixture (task 9.3) and the dump-before-
copy race (task 8.2). A CLI smoke run of `pnpm --filter @contratos/api
verify:restore` against this development machine's own local database
(zero documents, matching a genuinely empty target) exited `1` with the
`total === 0` message — the CLI wrapper's exit-code propagation proven end
to end, not merely the exported function in isolation.

What none of that proves: `restore.sh`'s own decrypt/extract/`pg_restore`/
copy steps invoked for real — like `backup.sh`'s `do_dump`/`do_push`, they
are implemented per design.md D7 but never exercised in a spec, because
neither a live encrypted archive, `pg_restore`, nor a second Postgres
instance to restore into exists on this development machine. The **real**
backup-then-restore drill — the one this whole PR exists to make possible —
needs the actual VPS and the actual offsite remote; see task 9.8 below.

### Credential rotation

`restore.sh`'s decryption identity (`$AGE_IDENTITY_FILE`, or an imported
gpg secret key) is the one credential in this whole chain that is
deliberately **never** stored anywhere `backup.sh`/`deploy.sh` can reach —
that absence from the VPS is design D7's entire property. It must be
rotated the same way any offline secret is: generate a new `age` keypair
(or gpg keypair), update `AGE_RECIPIENT`/`GPG_RECIPIENT` in
`/etc/contratos/backup.env` on the VPS so **future** backups encrypt to the
new public key, keep the OLD identity file archived offline for as long as
any backup encrypted under it is still within the 30-day remote retention
window (see "Retention" above), and only discard the old identity once
every backup it could decrypt has been pruned. Rotating the identity does
**not** re-encrypt existing backups — an old backup stays decryptable only
by the identity that was current when it was made.

## Scheduled backups (`contratos-backup.timer`)

`provision.sh` installs both units from the checkout and runs
`systemctl enable --now contratos-backup.timer` — the manual sequence the
unit's own header describes (`cp` into `/etc/systemd/system/`,
`daemon-reload`, `enable --now`), done by the same idempotent guard as the
API unit: byte-identical copies plus a timer that is enabled **and active**
report `[skip]`, anything else is reinstalled and re-enabled. On the real
host neither unit had been installed and the timer had never been enabled;
this README only documented the `cp`.

```
systemctl list-timers contratos-backup.timer      # next firing, last run
sudo systemctl start contratos-backup.service     # run once by hand, then:
journalctl -u contratos-backup.service -n 50
```

**The timer is enabled before `backup.env` exists, on purpose.** `backup.sh`
refuses at its first check when `/etc/contratos/backup.env` is missing —
`backup.sh: configuration file '/etc/contratos/backup.env' does not exist`,
exit 1, before touching the database — so a nightly run that fires before
the operator has configured the offsite remote fails *loudly* in
`journalctl -u contratos-backup.service`, every night, until it is
configured. The alternative — leave the timer disabled until configuration
is done — is a schedule that silently does not exist until someone
remembers, which is the failure D7 exists to prevent. Enabling early costs
one visible error per night; forgetting costs every backup.

Runs `backup.sh` once a day at 03:15 local time (a low-traffic hour,
`RandomizedDelaySec=15m`), `Persistent=true` so a run missed while the VPS
was down still happens as soon as the timer is next active instead of
silently skipping that day. `Type=oneshot`, `User=root` — the same
justification `backup.sh` itself documents above: it reads two root-owned,
`0600` files (`api.env` for `DATABASE_URL`, `backup.env` for the rclone
remote and encryption recipient), neither readable by the unprivileged
`contratos` service user by design.

**`systemd-analyze verify` result, recorded honestly:** against the real
committed unit files, it reports `Command /opt/contratos/deploy/backup.sh
is not executable: No existe el archivo o el directorio` — because
`/opt/contratos` does not exist on this development machine. This is not a
defect in the new units: `contratos-api.service` (already in this
repository, already deployed nowhere yet) fails `systemd-analyze verify`
with the exact same class of error, for the exact same reason
(`/usr/local/bin/pnpm` does not exist here either). Substituting a
stand-in executable path (`/usr/bin/true`) for `ExecStart` while keeping
every other directive — `Type=oneshot`, the hardening block,
`ReadWritePaths`, and the timer's `OnCalendar`/`RandomizedDelaySec`/
`Persistent` — verifies clean (`systemd-analyze verify` exit `0`),
confirming the unit **syntax and semantics** are correct; only the
path-existence check, which genuinely needs the VPS, does not pass
pre-VPS.

### The public key has to live somewhere `ProtectHome` does not hide

`contratos-backup.service` runs as root with `ProtectHome=true`, which makes
`/home`, `/root` and `/run/user` "inaccessible and empty" (`systemd.exec`).
gpg reads its keyring from `$HOME/.gnupg` — `/root/.gnupg` for this unit —
so without help it would build an empty keyring in that tmpfs and fail with
`skipped: No public key` for the backup recipient. Every scheduled backup
failing, every day, with the journal as the only witness and a restore
attempt as the moment anyone finds out.

The unit therefore sets `Environment=GNUPGHOME=/etc/contratos/gnupg`, beside
the other root-owned 0600 configuration, and lists it in `ReadWritePaths`
because gpg writes lockfiles into its keyring directory. That listing is
also why the directory has to exist before the unit ever starts: with
`ProtectSystem=strict`, systemd bind-mounts every `ReadWritePaths` entry
*before* `ExecStart`, and a missing one fails the start with
`status=226/NAMESPACE` (gap #7's failure, seen again here when the timer was
installed on the real host without this directory). The same applies to
`/var/backups/contratos-offsite`: `backup.sh` does `mkdir -p` on it, but
under the unit that line never runs — the namespace is assembled first. So
`provision.sh` creates both, plus `/etc/contratos` itself, as `root:root`
`0700`, and `unidades-systemd.spec.ts` asserts every `ReadWritePaths` entry
and `GNUPGHOME` of this unit is a directory `provision.sh`'s own dry-run
plan creates. Import the recipient's **public** key into that keyring — the
secret half must never reach this box, which is the entire point of D7's
asymmetric choice:

```sh
sudo GNUPGHOME=/etc/contratos/gnupg gpg --import /path/to/recipient-public.asc
```

`TimeoutStartSec=2h` is set for the same family of reason: `Type=oneshot`
leaves it at infinity, and the timer will not start a second run while the
first is still going, so one wedged `rclone` push would silently stop every
future backup.

`deploy/unidades-systemd.spec.ts` asserts these statically — the units were
the only artifacts under `deploy/` with no spec, and they are the ones that
actually run.

### Proving the dump really runs first

`contract-archive-backup` spec.md asks for the ordering to be "verifiable by
observing step completion order". `backup.spec.ts` asserts the order of the
`--dry-run` plan strings, which describes the script rather than running it:
swap the two calls in `main()`, leave the plan text alone, and that assertion
still passes.

`backup.integration.spec.ts` observes a real run instead. It puts thin shims
for `pg_dump` and `cp` on `$PATH` that record a marker and then `exec` the
real binary, so a real `pg_dump` runs against the real Postgres 17 and a real
`cp` copies the tree, while the order becomes visible:

```
pg_dump:start  pg_dump:end  cp:start  cp:end
```

The dump must be **finished** before the copy has started — that is what makes
an orphan PDF the only reachable inconsistency, and a row pointing at a
missing file unreachable. Verified by swapping the two calls: the new spec
goes red and reports the observed order, while all 63 dry-run specs stay
green.

It runs separately from the dry-run harness, the same split `apps/api` uses:

```sh
docker compose up -d postgres
pnpm --filter @contratos/deploy test:integration
```

`pg_dump` must match the server's major version — it refuses to dump a newer
server — so CI adds the same PGDG repository `provision.sh` adds on the VPS
and installs `postgresql-client-17`. A missing `pg_dump` fails the spec by
name rather than skipping it: a backup suite that quietly stops exercising
`pg_dump` proves nothing.

**Installing the right client is not the same as running it.** On Debian and
Ubuntu `/usr/bin/pg_dump` is `pg_wrapper`, which picks a version from the
default cluster, so on a host that already has an older client the newly
installed 17 is not what `$PATH` resolves to. CI hit exactly this — it
installed `postgresql-client-17` and still ran `pg_dump (PostgreSQL) 16.15`,
which cannot dump a 17 server — and now puts `/usr/lib/postgresql/17/bin`
first and asserts the major version before the suite runs. Worth knowing on
the VPS too: `provision.sh` installs `postgresql-17` on a clean host, but if
another client is ever added alongside it, check `pg_dump --version` rather
than the package list. A backup that fails at 03:15 inside a systemd timer is
one nobody reads until they need a restore.

## shellcheck

`eslint` does not read shell, so until this landed the roughly 2000 lines of
bash under `deploy/` — the scripts that stop the service, publish the site and
prune the backups — had no linter over them at all. Every `.sh` here is now
checked in CI:

```sh
pnpm --filter @contratos/deploy lint:shell
```

CI runs that exact script, so there is one definition of what "shellcheck
passes" means, and it installs shellcheck explicitly rather than relying on the
runner image shipping it — a check whose presence is incidental is a check that
can disappear without anything going red. That step is a no-op today — the
`ubuntu-24.04` image already ships shellcheck 0.9.0 — which is the point: it
stops being one the day the image stops shipping it.

**CI's version is the authority.** It takes whatever the distro packages
(0.9.0 at the time of writing); a newer shellcheck run locally may report
findings CI does not, or the reverse. Nothing here is pinned, so treat a
local-only finding as worth fixing rather than as a CI defect.

Run at default settings. `--enable=all` adds two style families this codebase
deliberately does not follow (`SC2250`, braces around every variable reference,
521 hits; `SC2292`, `[[ ]]` over the POSIX `[ ]`, 85 hits) and they are not
worth the noise. What the first run actually found was small and worth fixing:
one `local x="$(cmd)"` masking a command substitution's exit status, and three
tool-dispatch `case` statements with no `*)` branch — including one inside a
*guard*, where an unrecognised value made it validate nothing and let the run
continue.

## Still-open items, and exactly where it resolves

One question design.md left open is **not** blocked on any task in this
chain — it has a named home later:

| Open item | Resolves in | What happens there |
|---|---|---|
| A real backup-then-restore drill (task 9.8) | Post-VPS checklist, below | Blocked on the `offsite-backup-destination` external dependency (`state.yaml`) and on the VPS itself (`vps-purchase`) — not on any task in this repository. `restore.sh`, `verify-restore.sh`, and `verificarRestauracion.ts` are fully implemented and fixture-tested (tasks 9.1-9.4) and need nothing further from this codebase to run the real drill once both external dependencies resolve. This drill is also the **go-live gate** — see task 10.4 below |

The other open question design.md recorded — `age` availability on the
target Ubuntu release — is resolved above, in "Backup (D7)": confirmed
packaged for both plausible LTS targets, `age` chosen as the primary tool,
`gpg --recipient` implemented and proven as the fallback.

## What this PR cannot prove yet

Real package installs, a real Chromium launch, real font rendering, and swap
persistence across a reboot all need the actual VPS — `provision.sh --dry-run`
proves the guard *logic*; `bash -n` and (when available) `shellcheck` prove
the *syntax*. Neither proves the host converges correctly. That gap closes
once the VPS exists (`state.yaml`'s `vps-purchase` external dependency);
until then it is a documented limitation, not a silent one.

`deploy.sh --dry-run` proves its plan and its three guards for real, against
a fabricated temp git repo — no VPS needed for any of that (`deploy.spec.ts`,
tasks 5.1-5.4). It proves **nothing** about the steps a real deploy actually
performs: `pg_dump` against a live PostgreSQL instance, `systemctl
stop`/`start` against a real `contratos-api` unit, `pnpm install` and the
Puppeteer browser download as the real `contratos` user, `prisma migrate
deploy` against production data, or a real `GET /salud` round trip through
nginx. All of that remains unverifiable until the host exists.

`publicar-assets.sh --dry-run` proves its plan (the copy → swap-index →
swap-sw order) and the 2-release retention arithmetic for real, against
scratch `BUILD_DIR`/`WEB_ROOT` directories — no VPS needed
(`publicar-assets.spec.ts`, tasks 5.6-5.7). Three things it cannot prove
until the host exists:

- **A real vN→vN+1 deploy.** The spec fabricates a `vite build` output by
  hand; it never runs a real `vite build` against a real previous release
  already sitting at `/var/www/contratos`, nor a real `deploy.sh` invoking
  it as its `[plan:publish]` step.
- **The post-restart `/salud` failure path colliding with a publish.**
  Whether an asset swap that completes right as `contratos-api` fails to
  restart leaves the previous release's assets intact for the rollback
  recipe (`deploy.sh`'s `print_rollback_recipe`) is untested — the fixture
  tests never exercise `deploy.sh` and `publicar-assets.sh` together.
- **Asset-swap ordering under live traffic.** The poisoned-precache
  mechanism above is argued from how workbox's revisioned precache and
  `configuracionPwa.ts`'s `skipWaiting: false` behave, and from the publish
  order the script enforces — it is not observed against a real browser
  tab holding an open comodato session across a real deploy. That
  observation needs the VPS, a real técnico device, and a live signing
  session in progress.

`tls-bootstrap.sh --dry-run` proves the render+placeholder guard for real
(no VPS needed — `tls-bootstrap.spec.ts`, tasks 6.2/6.3) and proves, by
directive-order review, that the HTTP-only bootstrap conf and its own
`nginx -t` come before `certbot certonly`, and that the full
`deploy/nginx.conf` template is not installed until after. It proves
**nothing** about:

- **Real ACME issuance.** `certbot certonly --webroot` needs a
  DNS-resolvable domain answering on port 80 from the public internet —
  Let's Encrypt's validation servers have to reach `$CONTRATOS_HOST`, which
  no CI environment can offer. Blocked on the `domain-dns` external
  dependency (`state.yaml`), not on any task in this PR.
- **A forced-renewal drill.** That `certbot renew --force-renewal` actually
  swaps the served certificate — checked via
  `openssl s_client -connect <host>:443 -servername <host> </dev/null 2>/dev/null | openssl x509 -noout -dates`
  before and after — needs a real certificate already issued for a real
  domain, then a real reload triggered by `renewal-hook-nginx.sh`.
- **`nginx -t` on a real install.** `deploy/nginx.conf` has never been fed
  to a real `nginx -t` — every ordering claim above is a directive-order
  review against the file's own line numbers, not an execution result.
  Whether `nginx.conf:41`'s `/var/www/certbot` ACME location and
  `nginx.conf:55-56`'s certificate paths are themselves syntactically
  correct is unverified until a real nginx parses them.

`backup.sh --dry-run` proves the plan and its guards for real, no VPS
needed (`backup.spec.ts`, task 8.1). `backup.sh --prune-only` proves the
retention arithmetic for real against a mocked `rclone` (task 8.5).
`encrypt-backup-archive.sh` proves a genuine encrypt/decrypt round-trip and
key-gating for real (task 8.3, gpg fallback path — see "Backup (D7)" for
why `age` itself did not run on this machine). What none of that proves:

- **A real `pg_dump` against a live PostgreSQL instance.** `do_dump`,
  `do_copy_documents`, `do_archive`, and `do_push` are implemented but,
  like `deploy.sh`'s `do_stop`/`do_checkout`/`do_install`, never actually
  invoked in a spec — `pg_dump` is not installed on this machine, and there
  is no live database to dump from pre-VPS.
- **A real `rclone` push to a real offsite remote.** `rclone` itself is not
  installed on this machine either (`provision.sh` installs it on the VPS;
  here `backup.spec.ts`'s retention tests mock it entirely). The credentialed remote is blocked on the
  `offsite-backup-destination` external dependency (`state.yaml`), same as
  the full restore drill (task 9.8, below).
- **The real `age` binary, encrypting for real.** Confirmed packaged for
  the target Ubuntu release and installed there by `provision.sh` (see
  "Backup (D7)"), but not installed on this development machine — the real
  round-trip proof here used the `gpg` fallback path instead. Both paths satisfy design D7's property
  identically; only one was cryptographically exercised on this machine.
- **A scheduled, unattended run against a live backup.** `contratos-backup.service`/`.timer`
  are installed and their unit files verify (see "Scheduled backups"
  above); what a real daily firing actually produces on a live host is
  unverified pre-VPS, same as `deploy.sh`'s never-really-invoked steps.

`restore.sh` proves its production-target refusal guard for real, no VPS
needed (`restore.spec.ts`, task 9.1). `verificarRestauracion.ts` proves its
sha256 comparator for real against CI's live Postgres 17 and real file
bytes on disk (`verificarRestauracion.integration.spec.ts`, tasks 8.2 and
9.3). See "Restore drill (D7 cont.)" above, "Honesty about what ran for
real here," for the full account of what is and is not proven. What none
of it proves — because it needs the real VPS, the real offsite remote, and
a real second host to restore onto — is the actual end-to-end drill: a
real `backup.sh` run, pushed to the real remote, decrypted and restored by
`restore.sh` onto a real scratch host, verified clean by
`verify-restore.sh`. That drill is task 9.8, and it is also the **go-live
gate** — see "Next step" below.

## Checklist (post-VPS, not yet actionable)

- [ ] `sudo deploy/provision.sh` exits 0 on a fresh Ubuntu host
- [ ] Re-running it exits 0 with every guard reporting `[skip]`
- [ ] `sudo -u postgres psql -tAc "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'contratos'"` prints `t`, `sudo -u postgres psql -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'contratos'"` prints `contratos`, and `sudo stat -c '%U:%G %a' /etc/contratos/db.password` prints `root:root 600`
- [ ] With `DATABASE_URL` in `/etc/contratos/api.env` composed from that file, `psql "$(sudo grep '^DATABASE_URL=' /etc/contratos/api.env | cut -d= -f2-)" -c 'SELECT 1'` connects as `contratos`
- [ ] After cloning into `/opt/contratos` and re-running it, `systemctl is-enabled contratos-api` prints `enabled`, `systemctl is-active contratos-api` prints `inactive` (provision never starts it), and `cmp /opt/contratos/deploy/contratos-api.service /etc/systemd/system/contratos-api.service` is silent
- [ ] `sudo git -C /opt/contratos status --porcelain` runs as root without a "dubious ownership" refusal and prints nothing (skeleton dotfiles excluded)
- [ ] `node --version` ≥ 22 and `pnpm --version` = 11.11.0 as the `contratos` user after provision (`sudo -u contratos -- bash -lc 'node --version; pnpm --version'`)
- [ ] Headless Chromium launches with `--no-sandbox --disable-setuid-sandbox` and no missing-library error
- [ ] `pnpm --filter @contratos/api verify:render` prints `Veredicto final: APROBADO` (all three layers, see "Render verdict" above)
- [ ] `free -h` shows the 2 GB swapfile active, and it survives a reboot
- [ ] `TAG=<first tag> FIRST_DEPLOY=true deploy/deploy.sh` completes the full stop→…→start sequence and reports `GET /salud` healthy
- [ ] A subsequent `TAG=<next tag> deploy/deploy.sh` (no `FIRST_DEPLOY`) redeploys successfully with both seed passwords already rotated out of `/etc/contratos/api.env`
- [ ] A deliberately broken `/etc/contratos/api.env` (missing `DATABASE_URL`) is refused before the service stops, and the previous version is still serving traffic afterward
- [ ] During a real `TAG=<next tag> deploy/deploy.sh`, a tablet with the PWA open on the previous release keeps loading every hashed asset it references throughout the publish step (no mid-visit 404)
- [ ] After that same deploy, a tab that has NOT yet accepted the update prompt still functions on the previous shell, and a tab that reloads receives the new shell cleanly — never a mismatched `index.html`/`sw.js` pair
- [ ] `ls /var/www/contratos/.releases` shows at most 2 manifests after two consecutive real deploys, and the previous release's hashed assets are gone only after the deploy that supersedes them a second time
- [ ] `sudo CONTRATOS_HOST=<real hostname> deploy/tls-bootstrap.sh` completes the full sequence and `curl -I https://<real hostname>/salud` returns a response over TLS
- [ ] `nginx -t` reports `syntax is ok` / `test is successful` against the real, rendered `/etc/nginx/sites-available/contratos` — the first time this file has ever been parsed by a real nginx
- [ ] `certbot renew --force-renewal --cert-name <real hostname>` followed by `openssl s_client -connect <real hostname>:443 -servername <real hostname> </dev/null 2>/dev/null | openssl x509 -noout -dates` shows a **new** `notBefore`, proving `renewal-hook-nginx.sh` actually reloaded nginx and not just that certbot wrote a new file to disk
- [ ] A deliberately broken rendered conf (temporarily corrupt `/etc/nginx/sites-available/contratos` by hand, then re-run `tls-bootstrap.sh`) exercises the hard-gate rollback: `nginx -t` fails, the symlink repoints back to the bootstrap conf, nginx reloads successfully, and the script still exits `1`
- [ ] `sudo deploy/backup.sh` completes a real dump → copy → archive → encrypt → push cycle against the live database and `ALMACEN_DOCUMENTOS_RUTA`, and the encrypted archive lands on the real offsite remote (needs the `offsite-backup-destination` credential — `state.yaml`)
- [ ] `age -d -i <the real recipient's identity file>` (kept off the VPS entirely) decrypts a real pushed archive byte-identical to the pre-encryption tar
- [ ] After 31+ real daily runs, exactly 30 remote copies remain and the 31st-oldest is gone
- [ ] `deploy/backup.sh --prune-only` run by hand against the real remote behaves identically to its mocked-`rclone` test — same head/tail split, no accidental deletion of a retained copy
- [ ] `sudo stat -c '%U:%G %a %n' /etc/contratos /etc/contratos/gnupg /var/backups/contratos-offsite` prints `root:root 700` for all three, and `systemctl list-timers contratos-backup.timer` shows the timer `provision.sh` enabled with a next firing
- [ ] Before `/etc/contratos/backup.env` exists, `sudo systemctl start contratos-backup.service` fails and `journalctl -u contratos-backup.service` shows `backup.sh: configuration file '/etc/contratos/backup.env' does not exist` — a loud refusal, never `226/NAMESPACE` and never silence
- [ ] After `backup.env` is written and the public key imported, `journalctl -u contratos-backup.service` shows a clean exit on the next scheduled firing (or after `sudo systemctl start contratos-backup.service` run by hand)
- [ ] **The real backup-then-restore drill (task 9.8, and the go-live gate — task 10.4):** on a genuinely separate scratch host, `ARCHIVE_FILE=<the real pushed archive> AGE_IDENTITY_FILE=<the real identity, kept off the VPS> DATABASE_URL=<scratch> ALMACEN_DOCUMENTOS_RUTA=<scratch> deploy/restore.sh` completes, `verify-restore.sh` reports every real document `verificados` with zero `faltantes`/`desajustados`, and the exit code is `0`
- [ ] The above drill has been run **at least once** and passed before any real customer *comodato* is signed on this server — see the go-live gate below

## Go-live gate (task 10.4) — read this before signing anything real

**No real customer *comodato* may be signed on this server until every one
of the following has happened, in this order:**

1. PR #86 (asymmetric backup encryption, `encrypt-backup-archive.sh`) is
   merged.
2. PR #87 (backup ordering, `backup.sh`) is merged. Together, #86 and #87
   are what this document has been calling "PR7" throughout — design.md's
   single logical unit shipped as two separate, independently-reviewable
   pull requests; the requirement below binds both of them, not either one
   alone.
3. This PR (restore, hash verification, the `contratos-backup.timer`
   schedule — everything under "Restore drill (D7 cont.)" and "Scheduled
   backups" above) is merged.
4. All three are **deployed to the real VPS**.
5. **One real backup-then-restore drill has been run on that VPS and has
   passed** — a real `backup.sh` run, pushed to the real offsite remote, a
   real `restore.sh` run on a genuinely separate scratch host that
   decrypts and restores it, and a real `verify-restore.sh` run reporting
   every document `verificados` with zero `faltantes` and zero
   `desajustados`. This is the checklist item above under "The real
   backup-then-restore drill" — read it as a precondition for step 5, not
   as an optional nice-to-have.

**Why this is written as a blocking rule, not left as an implied
consequence of merge order.** Until step 5 has actually happened, every
comodato PDF signed on this server exists in exactly one place: the VPS
itself. `backup.sh` alone only produces a copy that is *believed* to be
good — nobody has ever proven a restore from it actually works until step
5 runs. A comodato is a legally-binding document; signing one before this
gate closes means that document's only copy has an unproven recovery path.
That is an acceptable risk for test data. It is not an acceptable risk for
a real customer's signature.

**If you are reading this months from now with no memory of this
conversation:** check `git log` for PR #86 and #87 merged into `master`,
check that this PR (restore + verify + timer) is merged and deployed too,
and check for a dated record of a passed real restore drill (the
checklist item above, or an equivalent operational log) before treating
this server as safe to sign real contracts on. If any of the three PRs is
missing, or a real drill has never been run and passed, **the gate is not
closed** — treat the server as still in the pre-go-live state described in
this README, regardless of how long it has been running.
