# Deploying `contratos` to the HostGator VPS

Everything under `deploy/` is thin, idempotent bash over a design that pushes
every falsifiable guarantee into TypeScript and Vitest so CI can prove it
**before the VPS exists** (see `../openspec/changes/production-deployment/design.md`).
This file documents the parts that only make sense once you are standing in
front of the real host: install order, the audit/offline package fallback,
and where the two questions this PR cannot answer get resolved later in the
chain.

## Quick path

1. Provision the host once, as root: `sudo deploy/provision.sh`
2. Deploy the application: `TAG=v1.2.3 deploy/deploy.sh`
3. Bootstrap TLS: `deploy/tls-bootstrap.sh` *(lands in PR6 — not yet in this repository)*

Every script supports `--dry-run` and needs no VPS to preview: its Vitest
spec `execFile`s it against a scratch temp directory (design.md D8).

## Install order

| Order | Script | What it does | Status |
|---|---|---|---|
| 1 | `provision.sh` | Root-only, idempotent host setup: apt packages, PostgreSQL 17, Chromium's runtime libraries (D1), Spanish-capable fonts, a 2 GB swapfile, and the `contratos` service user + directories | Done |
| 2 | `deploy.sh` | Stop → dump → checkout → install → migrate → seed → publish → start (D5); the `publish` step calls `publicar-assets.sh` (D4, row 2a) | Done |
| 2a | `publicar-assets.sh` | Additive asset copy, then an atomic `index.html`/`sw.js` swap, then a 2-release retention prune (D4) — see "Asset publish" below | **This PR** |
| 3 | `tls-bootstrap.sh` | HTTP-only bootstrap conf first, so nginx can start before a certificate exists, then issues one via certbot (D6) | PR6 |

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
| `contratos` system user | `[skip] user '…' already exists` | `[plan] would create system user '…'` |
| `$APP_DIR`, `$DOCUMENT_STORE_DIR` | `[skip] directory '…' already exists` | `[plan] would create directory '…'` |
| Swapfile + its `/etc/fstab` entry | `[skip] swapfile '…' already exists` / `[skip] fstab entry for '…' already present` | `[plan] would create a 2048MB swapfile at '…'` / `[plan] would append '… none swap sw 0 0' to '…'` |
| `.cache/` in the git exclude file | `[skip] '.cache/' already present in '…'` | `[plan] would append '.cache/' to '…'` |

All four are asserted by `deploy/provision.spec.ts` against a scratch temp
directory — every path (`SERVICE_USER`, `APP_DIR`, `DOCUMENT_STORE_DIR`,
`SWAP_FILE`, `FSTAB_FILE`, `GIT_EXCLUDE_FILE`) is overridable by environment
variable for exactly this reason, in production those variables keep their
defaults (`contratos`, `/opt/contratos`, `/swapfile`, `/etc/fstab`, …).

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
faked.

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

## Still-open items, and exactly where they resolve

Two questions design.md left open are **not** blocked on any task in this
PR; both have a named home later in the chain:

| Open item | Resolves in | What happens there |
|---|---|---|
| `age` availability on the target Ubuntu release | PR7, task 8.3 | Checked during `backup.sh`'s implementation; falls back to `gpg --recipient` (asymmetric — the decrypt key still never touches the VPS) if `age` is absent from the release's apt repositories |
| A real backup-then-restore drill | PR8, task 9.8 | Blocked on the `offsite-backup-destination` external dependency (`state.yaml`), not on any code task — the fixture-level tests in 8.1/8.3-8.6/9.1-9.4 do not need it |

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

## Checklist (post-VPS, not yet actionable)

- [ ] `sudo deploy/provision.sh` exits 0 on a fresh Ubuntu host
- [ ] Re-running it exits 0 with every guard reporting `[skip]`
- [ ] Headless Chromium launches with `--no-sandbox --disable-setuid-sandbox` and no missing-library error
- [ ] `pnpm --filter @contratos/api verify:render` prints `Veredicto final: APROBADO` (all three layers, see "Render verdict" above)
- [ ] `free -h` shows the 2 GB swapfile active, and it survives a reboot
- [ ] `TAG=<first tag> FIRST_DEPLOY=true deploy/deploy.sh` completes the full stop→…→start sequence and reports `GET /salud` healthy
- [ ] A subsequent `TAG=<next tag> deploy/deploy.sh` (no `FIRST_DEPLOY`) redeploys successfully with both seed passwords already rotated out of `/etc/contratos/api.env`
- [ ] A deliberately broken `/etc/contratos/api.env` (missing `DATABASE_URL`) is refused before the service stops, and the previous version is still serving traffic afterward
- [ ] During a real `TAG=<next tag> deploy/deploy.sh`, a tablet with the PWA open on the previous release keeps loading every hashed asset it references throughout the publish step (no mid-visit 404)
- [ ] After that same deploy, a tab that has NOT yet accepted the update prompt still functions on the previous shell, and a tab that reloads receives the new shell cleanly — never a mismatched `index.html`/`sw.js` pair
- [ ] `ls /var/www/contratos/.releases` shows at most 2 manifests after two consecutive real deploys, and the previous release's hashed assets are gone only after the deploy that supersedes them a second time

## Next step

This PR (PR5) added `publicar-assets.sh` (row 2a of the install-order table,
D4) — the script `deploy.sh`'s `[plan:publish]` step calls by path: additive
asset copy, then the atomic `index.html`/`sw.js` swap, then the 2-release
retention prune. PR6 adds `tls-bootstrap.sh` (D6), the HTTP-only bootstrap
conf that lets nginx start before a certificate exists.
