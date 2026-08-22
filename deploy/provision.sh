#!/usr/bin/env bash
#
# Bring a bare Ubuntu host to a state where the API can render a correct,
# complete PDF: apt packages, PostgreSQL 17, Chromium's runtime libraries,
# Spanish-capable fonts, a 2 GB swapfile, and the `contratos` service user
# with its directories — all idempotent, so a second run on an
# already-provisioned host is a safe no-op (server-provisioning spec.md).
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
# PostgreSQL's own client tooling, the repo signing prerequisites, and the
# TrueType fonts headless Chromium needs for Spanish text (ñ, á, é, í, ó, ú).
# The full 37-package Puppeteer fallback list is an audit/offline reference
# only, in deploy/README.md — never the primary mechanism (D1).
provision_packages() {
  local packages=(
    curl
    ca-certificates
    gnupg
    lsb-release
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

# --------------------------------------------------------------- chromium

# D1: root resolves and installs the *system libraries* Chromium needs
# (--install-deps), into a scratch cache that is discarded — the browser
# binary itself is installed later, at deploy time, by the unprivileged
# `contratos` user (deploy.sh), whose own $HOME/.cache/puppeteer is where
# the running service actually looks.
provision_chromium_deps() {
  if [ "$DRY_RUN" = true ]; then
    plan "would run: npx --yes puppeteer@${PUPPETEER_VERSION} browsers install chrome --install-deps (scratch PUPPETEER_CACHE_DIR, deleted afterward)"
    return
  fi

  local scratch_cache
  scratch_cache="$(mktemp -d)"
  PUPPETEER_CACHE_DIR="$scratch_cache" \
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

  if [ -f "$FSTAB_FILE" ] && grep -qF "$SWAP_FILE" "$FSTAB_FILE"; then
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
