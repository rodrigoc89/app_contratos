#!/usr/bin/env bash
#
# Publish a `vite build` output onto the server: additive asset copy, then
# an atomic swap of `index.html`, then `sw.js` LAST (design.md D4). The
# order below is a correctness requirement, not a style preference — see
# the comment above do_swap_sw() for the poisoned-precache mechanism it
# prevents.
#
# Usage:
#   deploy/publicar-assets.sh              # apply (also prunes release
#                                            # manifests beyond the 2 newest)
#   deploy/publicar-assets.sh --dry-run    # preview the plan only, no
#                                            # writes, no root, no VPS
#
# Independently testable from deploy.sh: this script's own --dry-run plan is
# what publicar-assets.spec.ts exercises, exactly like provision.spec.ts and
# deploy.spec.ts (design.md D8). deploy.sh's [plan:publish] step only names
# this script by path — it never requires this file to exist.
set -euo pipefail

DRY_RUN=false
parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run)
        DRY_RUN=true
        ;;
      *)
        echo "publicar-assets.sh: unrecognized argument: $arg" >&2
        exit 1
        ;;
    esac
  done
}

APP_DIR="${APP_DIR:-/opt/contratos}"
# `vite build`'s output — the API has no dist/ and is never involved here.
BUILD_DIR="${BUILD_DIR:-$APP_DIR/apps/web/dist}"
# deploy/nginx.conf's `root` directive (see that file for the real path).
WEB_ROOT="${WEB_ROOT:-/var/www/contratos}"
# One `<timestamp>.files` manifest per release, listing every file that
# release published — the source of truth the retention prune (below) reads
# to tell "still referenced by a retained release" apart from "orphaned".
RELEASES_DIR="${RELEASES_DIR:-$WEB_ROOT/.releases}"
RETENTION_COUNT="${RETENTION_COUNT:-2}"

log() {
  printf '%s\n' "$*"
}

# --------------------------------------------------------------- guard: build

require_build_dir() {
  if [ ! -d "$BUILD_DIR" ]; then
    echo "publicar-assets.sh: build directory '$BUILD_DIR' does not exist — run the web build first (pnpm --filter @contratos/web build)" >&2
    exit 1
  fi
  if [ ! -f "$BUILD_DIR/index.html" ]; then
    echo "publicar-assets.sh: '$BUILD_DIR/index.html' not found — is '$BUILD_DIR' a real vite build output?" >&2
    exit 1
  fi
  if [ ! -f "$BUILD_DIR/sw.js" ]; then
    echo "publicar-assets.sh: '$BUILD_DIR/sw.js' not found — is '$BUILD_DIR' a real vite build output?" >&2
    exit 1
  fi
}

# ------------------------------------------------- guard: retention count

# Below 1 nothing is ever retained, so `do_prune_old_releases` prunes the
# manifest this very run just wrote and removes every file it lists —
# index.html and sw.js included — leaving $WEB_ROOT empty while the script
# still exits 0 reporting "published". A publish step that reports success
# after deleting the site it published is the one outcome this script must
# never have, and 0 is a plausible thing for an operator to write meaning
# "keep no old releases". Refused in the preflight, before any write.
require_valid_retention_count() {
  case "$RETENTION_COUNT" in
    '' | *[!0-9]*)
      echo "publicar-assets.sh: RETENTION_COUNT must be a whole number, got '$RETENTION_COUNT'" >&2
      exit 1
      ;;
  esac

  if [ "$RETENTION_COUNT" -lt 1 ]; then
    echo "publicar-assets.sh: RETENTION_COUNT must be at least 1 (got '$RETENTION_COUNT') — the release being published is itself one of the retained releases, so keeping fewer would delete it" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------- plan

print_plan() {
  log "== publicar-assets.sh plan for $WEB_ROOT (dry-run=$DRY_RUN, build='$BUILD_DIR') =="
  log "[plan:copy-assets] additively copy every hashed asset, icon and manifest.webmanifest from '$BUILD_DIR' into '$WEB_ROOT' (no --delete — see D4)"
  log "[plan:swap-index] atomically publish '$BUILD_DIR/index.html' as '$WEB_ROOT/index.html'"
  log "[plan:swap-sw] atomically publish '$BUILD_DIR/sw.js' as '$WEB_ROOT/sw.js' — LAST, see the note above do_swap_sw()"
  log "[plan:write-manifest] write '$RELEASES_DIR/<timestamp>.files' listing every file this release published"
  log "[plan:prune] keep the $RETENTION_COUNT newest release manifests, prune older ones and any file they alone reference"
}

# ----------------------------------------------------------------- discovery

# Every file under $BUILD_DIR except index.html/sw.js, relative to
# $BUILD_DIR, one per line — the additive copy step's own file list.
list_additive_files() {
  find "$BUILD_DIR" -type f \
    ! -name index.html \
    ! -name sw.js \
    -printf '%P\n' | sort
}

# ------------------------------------------------------------------- publish

# Copies into a sibling temp file in the SAME directory as the target, then
# renames over it. The `mktemp` template already includes $target_file's own
# directory, so the final `mv` is a same-filesystem rename(2) — atomic
# regardless of where $BUILD_DIR itself lives, and safe even when $BUILD_DIR
# and $WEB_ROOT are on different filesystems (a cross-directory `mv` would
# otherwise risk EXDEV instead of the atomic swap this step needs).
atomic_publish_file() {
  local source_file="$1"
  local target_file="$2"
  local tmp_file
  tmp_file="$(mktemp "${target_file}.XXXXXX")"
  cp "$source_file" "$tmp_file"
  chmod 644 "$tmp_file"
  mv -f "$tmp_file" "$target_file"
}

# Additive — never `--delete`. A técnico with the PWA already open, mid
# comodato, must never see a hashed bundle 404 because a newer deploy
# already removed it (D4). Runs BEFORE index.html/sw.js are touched, so a
# request racing this deploy always finds every asset either the old or the
# new shell can reference.
do_copy_assets() {
  local file
  while IFS= read -r file; do
    install -D -m 644 "$BUILD_DIR/$file" "$WEB_ROOT/$file"
  done < <(list_additive_files)
}

do_swap_index() {
  atomic_publish_file "$BUILD_DIR/index.html" "$WEB_ROOT/index.html"
}

# Publishes LAST, always after do_copy_assets and do_swap_index — this order
# is a correctness requirement, not a style choice (design.md D4).
#
# The generated sw.js embeds a workbox precache manifest carrying a
# `revision` hash per entry, index.html included. If sw.js published FIRST,
# an installing worker would fetch whatever index.html currently sits at
# $WEB_ROOT — the OLD shell, since do_swap_index has not run yet — and store
# those bytes keyed under the NEW revision hash sw.js already carries.
# Workbox treats a revision it already has cached as satisfied and never
# re-fetches it, so that client is stuck serving the OLD index.html forever,
# under a hash that claims to be current — there is no self-healing reload,
# the only fix is clearing site data by hand. Publishing sw.js last
# guarantees any worker that installs against it can only ever see the NEW
# index.html already in place.
do_swap_sw() {
  atomic_publish_file "$BUILD_DIR/sw.js" "$WEB_ROOT/sw.js"
}

# --------------------------------------------------------------- manifest

do_write_manifest() {
  local timestamp="$1"
  local manifest_file="$RELEASES_DIR/${timestamp}.files"
  install -d -m 755 "$RELEASES_DIR"
  find "$BUILD_DIR" -type f -printf '%P\n' | sort > "$manifest_file"
}

# ------------------------------------------------------------------- prune

# Keeps the $RETENTION_COUNT newest release manifests; every older manifest
# is removed, and so is every file it lists that no retained manifest also
# lists — an asset that only an old, already-pruned release referenced.
# Manifest filenames sort chronologically (an ISO-8601-like timestamp
# prefix), so a lexical sort orders them oldest-first.
do_prune_old_releases() {
  local manifest_list
  manifest_list="$(mktemp)"
  find "$RELEASES_DIR" -maxdepth 1 -type f -name '*.files' -printf '%f\n' \
    | sort > "$manifest_list"

  local total
  total="$(wc -l < "$manifest_list")"
  if [ "$total" -le "$RETENTION_COUNT" ]; then
    rm -f "$manifest_list"
    return
  fi

  local prune_count=$((total - RETENTION_COUNT))
  local pruned_manifests retained_manifests
  pruned_manifests="$(head -n "$prune_count" "$manifest_list")"
  retained_manifests="$(tail -n "$RETENTION_COUNT" "$manifest_list")"
  rm -f "$manifest_list"

  local retained_files
  retained_files="$(mktemp)"
  local name
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    cat "$RELEASES_DIR/$name" >> "$retained_files"
  done <<< "$retained_manifests"
  sort -u "$retained_files" -o "$retained_files"

  local file
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if ! grep -qxF "$file" "$retained_files"; then
        rm -f "$WEB_ROOT/$file"
        log "[prune] removed orphaned release asset '$file'"
      fi
    done < "$RELEASES_DIR/$name"
    rm -f "$RELEASES_DIR/$name"
    log "[prune] removed old release manifest '$name'"
  done <<< "$pruned_manifests"

  rm -f "$retained_files"
}

main() {
  parse_args "$@"

  # The guard runs BEFORE anything else — for both --dry-run and a real
  # run — same principle as deploy.sh's preflight guards: a refusal here
  # costs nothing.
  require_build_dir
  require_valid_retention_count

  if [ "$DRY_RUN" = true ]; then
    print_plan
    exit 0
  fi

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  install -d -m 755 "$WEB_ROOT"

  log "[step] additively copying assets from '$BUILD_DIR' into '$WEB_ROOT'"
  do_copy_assets

  log "[step] publishing index.html"
  do_swap_index

  log "[step] publishing sw.js (last — see the note above do_swap_sw)"
  do_swap_sw

  log "[step] writing release manifest for '$timestamp'"
  do_write_manifest "$timestamp"

  log "[step] pruning release manifests beyond the $RETENTION_COUNT newest"
  do_prune_old_releases

  log "== publicar-assets.sh: published (release '$timestamp') =="
}

main "$@"
