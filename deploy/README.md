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
2. Deploy the application: `deploy/deploy.sh` *(lands in PR4 — not yet in this repository)*
3. Bootstrap TLS: `deploy/tls-bootstrap.sh` *(lands in PR6 — not yet in this repository)*

Every script supports `--dry-run` and needs no VPS to preview: its Vitest
spec `execFile`s it against a scratch temp directory (design.md D8).

## Install order

| Order | Script | What it does | Status |
|---|---|---|---|
| 1 | `provision.sh` | Root-only, idempotent host setup: apt packages, PostgreSQL 17, Chromium's runtime libraries (D1), Spanish-capable fonts, a 2 GB swapfile, and the `contratos` service user + directories | **This PR** |
| 2 | `deploy.sh` | Stop → dump → checkout → install → migrate → seed → publish → start (D5) | PR4 |
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

## Checklist (post-VPS, not yet actionable)

- [ ] `sudo deploy/provision.sh` exits 0 on a fresh Ubuntu host
- [ ] Re-running it exits 0 with every guard reporting `[skip]`
- [ ] Headless Chromium launches with `--no-sandbox --disable-setuid-sandbox` and no missing-library error
- [ ] A probe PDF renders `ñ á é í ó ú Ñ` and round-trips through text extraction unchanged
- [ ] `free -h` shows the 2 GB swapfile active, and it survives a reboot

## Next step

PR2 adds the render verdict check (D2) that proves the font item above; PR4
adds `deploy.sh` (row 2 of the install-order table).
