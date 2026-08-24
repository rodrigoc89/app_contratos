#!/usr/bin/env bash
#
# Bring a bare Ubuntu host to a state where the API can render a correct,
# complete PDF: apt packages, PostgreSQL 17, Node.js and pnpm, Chromium's
# runtime libraries, Spanish-capable fonts, a 2 GB swapfile, and the
# `contratos` service user with its directories — all idempotent, so a
# second run on an already-provisioned host is a safe no-op
# (server-provisioning spec.md).
#
# Usage:
#   sudo deploy/provision.sh              # apply
#   deploy/provision.sh --dry-run         # preview only, no root required
#
# Every path below is overridable via environment variable so this script
# has a test harness (design.md D8): deploy/provision.spec.ts execFiles it
# with --dry-run against a scratch temp directory, never against
# /opt/contratos or /etc/fstab.
set -euo pipefail

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "provision.sh: unrecognized argument: $arg" >&2
      exit 1
      ;;
  esac
done

SERVICE_USER="${SERVICE_USER:-contratos}"
APP_DIR="${APP_DIR:-/opt/contratos}"
DOCUMENT_STORE_DIR="${DOCUMENT_STORE_DIR:-$APP_DIR/var/documentos}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
FSTAB_FILE="${FSTAB_FILE:-/etc/fstab}"
GIT_EXCLUDE_FILE="${GIT_EXCLUDE_FILE:-$APP_DIR/.git/info/exclude}"
PUPPETEER_VERSION="${PUPPETEER_VERSION:-25.4.0}"
# Root package.json: `engines.node >=22`, `packageManager: pnpm@11.11.0`.
# 24 is the Active LTS line and what .github/workflows/ci.yml pins (the
# web suite does not pass on 22). provision.spec.ts reads the manifest and
# fails when these defaults drift from it.
NODE_MAJOR="${NODE_MAJOR:-24}"
PNPM_VERSION="${PNPM_VERSION:-11.11.0}"
# NodeSource's `nodejs` package puts node and npm in /usr/bin, so npm's own
# default global prefix is /usr and `npm install -g` would land pnpm at
# /usr/bin/pnpm — but contratos-api.service's ExecStart is
# /usr/local/bin/pnpm. Installing under /usr/local puts the binary exactly
# there, and /usr/local/bin is on root's PATH, on sudo's secure_path, and on
# the `contratos` user's non-root login PATH (deploy.sh runs pnpm as that
# user via `sudo -u`), so every caller resolves the same pnpm.
NPM_GLOBAL_PREFIX="${NPM_GLOBAL_PREFIX:-/usr/local}"

log() {
  printf '%s\n' "$*"
}

plan() {
  log "[plan] $*"
}

skip() {
  log "[skip] $*"
}

# --------------------------------------------------------------- packages

# Names resolved by --install-deps below (D1) drift across Ubuntu releases —
# this list is the small, stable set that mechanism does not cover:
# PostgreSQL's own client tooling, the repo signing prerequisites, the
# TrueType fonts headless Chromium needs for Spanish text (ñ, á, é, í, ó, ú),
# and `fontconfig` itself, which provides the `fc-cache` binary the font step
# below runs. That last one is here precisely because --install-deps happens
# to pull it in transitively (libpango-1.0-0 depends on it) — depending on
# that would mean depending on the stability of the one list D1 calls
# unstable, and the failure would land mid-run, after PostgreSQL is already
# installed. The full 36-package Puppeteer fallback list is an audit/offline
# reference only, in deploy/README.md — never the primary mechanism (D1).
provision_packages() {
  local packages=(
    curl
    ca-certificates
    gnupg
    lsb-release
    # puppeteer / @puppeteer/browsers extract Chrome-for-Testing zips with
    # `unzip`, falling back to the optional `yauzl` package. npm (the npx in
    # the Chromium step below) does not install that optional peer, and a
    # fresh Ubuntu host ships no `unzip`, so puppeteer's postinstall failed
    # at extraction — silently. pnpm's lockfile does pin yauzl for
    # deploy.sh's install; the system package simply covers both paths.
    unzip
    fontconfig
    fonts-dejavu-core
    fonts-liberation
  )

  if [ "$DRY_RUN" = true ]; then
    plan "would run: apt-get update && apt-get install -y ${packages[*]}"
    return
  fi

  apt-get update
  apt-get install -y "${packages[@]}"
}

# ------------------------------------------------------------- postgresql

# Ubuntu's own repositories lag PostgreSQL releases; the PGDG apt repository
# is upstream's own recommended way to pin an exact major version (17).
provision_postgresql() {
  if [ "$DRY_RUN" = true ]; then
    plan "would add the PGDG apt repository and install postgresql-17"
    return
  fi

  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /etc/apt/keyrings/postgresql.asc
  local codename
  codename="$(lsb_release -cs)"
  printf 'deb [signed-by=/etc/apt/keyrings/postgresql.asc] http://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
    "$codename" > /etc/apt/sources.list.d/pgdg.list
  apt-get update
  apt-get install -y postgresql-17
}

# ------------------------------------------------------------ node + pnpm

# The Chromium step below runs `npx`, and deploy.sh later runs `pnpm` as the
# `contratos` user; neither exists on a bare host, and the first real run
# aborted at `npx: command not found` for exactly that reason. This step has
# to come before provision_chromium_deps.
#
# Node.js comes from NodeSource's apt repository, set up by hand with the
# steps its own setup_${NODE_MAJOR}.x script performs (dearmored key under
# /usr/share/keyrings, a DEB822 sources file pinned to the `nodistro` suite)
# — the same shape as the PGDG step above, and no remote script executed as
# root. pnpm is installed with npm rather than corepack: corepack is no
# longer bundled with current Node lines, and a pnpm other than the one
# `packageManager` names refuses the frozen lockfile deploy.sh installs from.
node_major_on_path() {
  command -v node > /dev/null 2>&1 || return 1

  local version
  version="$(node --version 2>/dev/null || true)"
  version="${version#v}"
  version="${version%%.*}"
  case "$version" in
    '' | *[!0-9]*) return 1 ;;
  esac
  printf '%s' "$version"
}

pnpm_version_on_path() {
  command -v pnpm > /dev/null 2>&1 || return 1
  pnpm --version 2>/dev/null || true
}

install_nodesource_nodejs() {
  local keyring=/usr/share/keyrings/nodesource.gpg
  local arch
  arch="$(dpkg --print-architecture)"

  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --batch --yes -o "$keyring"
  chmod 644 "$keyring"
  printf 'Types: deb\nURIs: https://deb.nodesource.com/node_%s.x\nSuites: nodistro\nComponents: main\nArchitectures: %s\nSigned-By: %s\n' \
    "$NODE_MAJOR" "$arch" "$keyring" > /etc/apt/sources.list.d/nodesource.sources
  apt-get update
  apt-get install -y nodejs
  log "installed $(node --version) from NodeSource (node_${NODE_MAJOR}.x)"
}

provision_node() {
  local node_major pnpm_version
  node_major="$(node_major_on_path || true)"
  pnpm_version="$(pnpm_version_on_path || true)"

  if [ -n "$node_major" ] && [ "$node_major" -ge "$NODE_MAJOR" ] \
    && [ "$pnpm_version" = "$PNPM_VERSION" ]; then
    skip "node $(node --version) (>= $NODE_MAJOR) and pnpm $PNPM_VERSION already installed"
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    plan "would install Node.js $NODE_MAJOR (NodeSource) and pnpm $PNPM_VERSION"
    return
  fi

  # The two halves are re-checked separately so a host with the right Node
  # but a stale pnpm (or the reverse) only touches the half that is behind.
  if [ -z "$node_major" ] || [ "$node_major" -lt "$NODE_MAJOR" ]; then
    install_nodesource_nodejs
  fi
  if [ "$pnpm_version" != "$PNPM_VERSION" ]; then
    npm install -g --prefix "$NPM_GLOBAL_PREFIX" "pnpm@${PNPM_VERSION}"
    log "installed pnpm $PNPM_VERSION at $NPM_GLOBAL_PREFIX/bin/pnpm"
  fi
}

# --------------------------------------------------------------- chromium

# D1: root resolves and installs the *system libraries* Chromium needs
# (--install-deps), into a scratch cache that is discarded — the browser
# binary itself is installed later, at deploy time, by the unprivileged
# `contratos` user (deploy.sh), whose own $HOME/.cache/puppeteer is where
# the running service actually looks.
#
# `npx --yes puppeteer@…` first installs the package, whose postinstall
# downloads Chrome on its own before the CLI command ever runs.
# PUPPETEER_SKIP_DOWNLOAD=1 turns that postinstall download off; it does not
# affect the explicit `browsers install chrome` that follows, which still
# performs a real download into the scratch cache — and that download is
# the one `--install-deps` resolves the system libraries against.
provision_chromium_deps() {
  if [ "$DRY_RUN" = true ]; then
    plan "would run: npx --yes puppeteer@${PUPPETEER_VERSION} browsers install chrome --install-deps (PUPPETEER_SKIP_DOWNLOAD=1 for the postinstall; scratch PUPPETEER_CACHE_DIR, deleted afterward)"
    return
  fi

  local scratch_cache
  scratch_cache="$(mktemp -d)"
  PUPPETEER_CACHE_DIR="$scratch_cache" \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    npx --yes "puppeteer@${PUPPETEER_VERSION}" browsers install chrome --install-deps
  rm -rf "$scratch_cache"
}

provision_fonts_cache() {
  if [ "$DRY_RUN" = true ]; then
    plan "would run: fc-cache -f -v"
    return
  fi

  fc-cache -f -v
}

# ------------------------------------------------------------------ swap

# The systemd unit deliberately omits MemoryMax (DESIGN.md), so a 2 GB
# swapfile is what keeps a render spike from becoming an OOM kill instead of
# a slow response. Two independent guards: the file itself, and its fstab
# entry — either can already exist without the other on a partially
# provisioned host.
# A substring match would read a commented-out `# /swapfile none swap sw 0 0`
# — exactly what a half-finished provisioning run leaves behind — as an
# active entry, skip the append, and let the swapfile vanish on the next
# reboot without ever reporting an error. Only the first field of a
# non-comment line is an fstab device.
swap_entry_present() {
  [ -f "$FSTAB_FILE" ] || return 1

  # `|| [ -n "$device" ]` keeps the last line readable when the file has no
  # trailing newline: `read` returns non-zero there but still assigns.
  local device _
  while read -r device _ || [ -n "$device" ]; do
    case "$device" in
      '' | '#'*) continue ;;
    esac
    if [ "$device" = "$SWAP_FILE" ]; then
      return 0
    fi
  done < "$FSTAB_FILE"

  return 1
}

provision_swap() {
  if [ -f "$SWAP_FILE" ]; then
    skip "swapfile '$SWAP_FILE' already exists"
  else
    if [ "$DRY_RUN" = true ]; then
      plan "would create a ${SWAP_SIZE_MB}MB swapfile at '$SWAP_FILE'"
    else
      fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" \
        || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB"
      chmod 600 "$SWAP_FILE"
      mkswap "$SWAP_FILE"
      swapon "$SWAP_FILE"
      log "created and enabled swapfile '$SWAP_FILE'"
    fi
  fi

  if swap_entry_present; then
    skip "fstab entry for '$SWAP_FILE' already present in '$FSTAB_FILE'"
  else
    if [ "$DRY_RUN" = true ]; then
      plan "would append '$SWAP_FILE none swap sw 0 0' to '$FSTAB_FILE'"
    else
      printf '%s none swap sw 0 0\n' "$SWAP_FILE" >> "$FSTAB_FILE"
      log "added fstab entry for '$SWAP_FILE'"
    fi
  fi
}

# ------------------------------------------------------------------- user

provision_user() {
  if id -u "$SERVICE_USER" > /dev/null 2>&1; then
    skip "user '$SERVICE_USER' already exists"
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    plan "would create system user '$SERVICE_USER' with home '$APP_DIR'"
    return
  fi

  useradd --system --create-home --home-dir "$APP_DIR" \
    --shell /usr/sbin/nologin "$SERVICE_USER"
  log "created user '$SERVICE_USER'"
}

# ------------------------------------------------------------------- dirs

# `useradd --create-home` above already creates $APP_DIR itself on a fresh
# host, which makes this guard report "already exists" for it immediately
# afterward — that is expected, not a bug: it is this same guard proving
# idempotency for every OTHER directory (starting with
# $DOCUMENT_STORE_DIR / ALMACEN_DOCUMENTOS_RUTA) on both a fresh host and a
# re-run.
provision_dir() {
  local dir="$1"

  if [ -d "$dir" ]; then
    skip "directory '$dir' already exists"
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    plan "would create directory '$dir' (owner $SERVICE_USER:$SERVICE_USER, mode 750)"
    return
  fi

  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$dir"
  log "created directory '$dir'"
}

# ---------------------------------------------------------- git exclude

# $APP_DIR doubles as $SERVICE_USER's home and the git checkout deploy.sh
# operates on (D1), so a 650 MB Puppeteer cache under it would trip
# deploy.sh's dirty-worktree guard (D5) on every single deploy unless git
# itself is told to ignore it. `.cache` is not covered by the repository's
# own .gitignore (verified: `git check-ignore .cache` reports no match), so
# this has to live in the local, unshared `info/exclude` instead.
#
# This step is safe to run before the repository is ever cloned into
# $APP_DIR: it only creates the directory chain that would hold that
# exclude file. Clone the repository into $APP_DIR before or after running
# this script — either order works, since re-running provision.sh is
# exactly what this guard is for.
provision_git_exclude() {
  if [ -f "$GIT_EXCLUDE_FILE" ] && grep -qxF '.cache/' "$GIT_EXCLUDE_FILE"; then
    skip "'.cache/' already present in '$GIT_EXCLUDE_FILE'"
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    plan "would append '.cache/' to '$GIT_EXCLUDE_FILE'"
    return
  fi

  mkdir -p "$(dirname "$GIT_EXCLUDE_FILE")"
  printf '.cache/\n' >> "$GIT_EXCLUDE_FILE"
  log "added '.cache/' to '$GIT_EXCLUDE_FILE'"
}

main() {
  if [ "$DRY_RUN" != true ] && [ "$(id -u)" -ne 0 ]; then
    echo "provision.sh: must run as root (use --dry-run to preview without root)" >&2
    exit 1
  fi

  log "== provision.sh plan for $APP_DIR (dry-run=$DRY_RUN) =="

  provision_packages
  provision_postgresql
  provision_node
  provision_chromium_deps
  provision_fonts_cache
  provision_swap
  provision_user
  provision_dir "$APP_DIR"
  provision_dir "$DOCUMENT_STORE_DIR"
  provision_git_exclude

  log "== done =="
}

main "$@"
