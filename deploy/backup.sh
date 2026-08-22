#!/usr/bin/env bash
#
# Offsite, encrypted, retention-pruned daily backup of the database and the
# sealed-PDF archive (design.md D7). The ordering below is a falsifiability
# argument, not a style choice — it MUST run in exactly this order:
#   1. pg_dump           (quiescent-enough: a row written after this point
#                          is simply not yet in the dump)
#   2. copy the PDF tree (design.md's D7: dumping first can only ever
#                          strand a harmless orphan PDF on disk; copying
#                          first could strand a `contrato_documentos` row
#                          whose PDF is absent from the backup — evidence
#                          of a signed comodato this backup would then
#                          fail to actually preserve)
#   3. archive, then encrypt asymmetrically (deploy/encrypt-backup-archive.sh
#      — age preferred, gpg --recipient fallback; the VPS never holds a key
#      capable of decrypting its own backups)
#   4. push the encrypted archive offsite via rclone
#   5. prune: 30 remote copies retained, 2 local
#
# Usage:
#   deploy/backup.sh                 # apply: full dump → ... → prune cycle
#   deploy/backup.sh --dry-run        # preview the plan only, no writes;
#                                      # every guard still runs for real
#   deploy/backup.sh --prune-only     # re-run retention pruning alone —
#                                      # e.g. after a retention count change,
#                                      # or to clean up after a push that
#                                      # partially failed. Skips dump/copy/
#                                      # archive/encrypt/push entirely, so it
#                                      # needs neither a database nor an
#                                      # encryption recipient configured.
#   deploy/backup.sh --dry-run --prune-only   # preview the prune-only plan
#
# Every path is overridable via environment variable, same harness pattern
# as the other deploy/ scripts (design.md D8): backup.spec.ts execFiles this
# script against scratch temp directories and a mocked `rclone` binary,
# never a real remote or a real database.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=false
PRUNE_ONLY=false

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run)
        DRY_RUN=true
        ;;
      --prune-only)
        PRUNE_ONLY=true
        ;;
      *)
        echo "backup.sh: unrecognized argument: $arg" >&2
        exit 1
        ;;
    esac
  done
}

APP_DIR="${APP_DIR:-/opt/contratos}"
# DATABASE_URL comes from the SAME file deploy.sh reads — this script never
# duplicates that credential into backup.env.
ENV_FILE="${ENV_FILE:-/etc/contratos/api.env}"
# Offsite-transport and encryption-recipient configuration, new to this PR
# — root-owned, 0600, created by an operator on the host. Never committed;
# see task 8.7's repo scan.
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/contratos/backup.env}"
# Same default as provision.sh's DOCUMENT_STORE_DIR — this is the tree
# ALMACEN_DOCUMENTOS_RUTA points at (apps/api/src/config/configuracion.ts).
DOCUMENT_STORE_DIR="${DOCUMENT_STORE_DIR:-$APP_DIR/var/documentos}"
# Local staging for the dump/copy/archive steps, AND where the 2
# most-recently-retained encrypted archives live as a local safety net
# distinct from deploy.sh's PRE_MIGRATION_DUMP_DIR (a separate, unencrypted,
# short-lived pre-migration dump with a different purpose entirely).
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/var/backups/contratos-offsite}"
ENCRYPT_SCRIPT="${ENCRYPT_SCRIPT:-$SCRIPT_DIR/encrypt-backup-archive.sh}"
RETENTION_REMOTE_COUNT="${RETENTION_REMOTE_COUNT:-30}"
RETENTION_LOCAL_COUNT="${RETENTION_LOCAL_COUNT:-2}"

RCLONE_REMOTE=""
AGE_RECIPIENT=""
GPG_RECIPIENT=""
ENCRYPTION_TOOL=""

log() {
  printf '%s\n' "$*"
}

# --------------------------------------------------------- config loading

# backup.env's keys are not a fixed allowlist (RCLONE_CONFIG_<REMOTE>_* key
# names depend on the operator-chosen remote name), unlike deploy.sh's
# ENV_FILE reader. Every KEY=value line is exported into this script's own
# environment so rclone (a child process) inherits it — the file is
# root-owned 0600 and entirely operator-controlled, so this is safe for
# exactly this purpose.
load_backup_env_into_environment() {
  if [ ! -f "$BACKUP_ENV_FILE" ]; then
    echo "backup.sh: configuration file '$BACKUP_ENV_FILE' does not exist" >&2
    exit 1
  fi

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    [ -z "$key" ] && continue
    export "$key=$value"
  done < "$BACKUP_ENV_FILE"

  RCLONE_REMOTE="${RCLONE_REMOTE:-}"
  AGE_RECIPIENT="${AGE_RECIPIENT:-}"
  GPG_RECIPIENT="${GPG_RECIPIENT:-}"
}

# Same rule as encrypt-backup-archive.sh, which does the actual encrypting:
# the recipient the operator configured decides, not whatever happens to be
# installed. Selecting on $PATH here means a host deliberately configured
# for gpg stops backing up the moment an unrelated package pulls `age` in.
# $PATH only breaks the tie when neither recipient is configured, so that
# the refusal below names the tool this host would have used.
resolve_encryption_tool() {
  if [ -n "$AGE_RECIPIENT" ]; then
    ENCRYPTION_TOOL="age"
  elif [ -n "$GPG_RECIPIENT" ]; then
    ENCRYPTION_TOOL="gpg"
  elif command -v age > /dev/null 2>&1; then
    ENCRYPTION_TOOL="age"
  else
    ENCRYPTION_TOOL="gpg"
  fi
}

# --------------------------------------------------------------- guards

# `total -le RETENTION` is the only thing standing between a prune and a
# wipe: at 0 nothing is retained, so every artifact — including the one this
# very run just pushed — lands in the pruned set. The remote copy is the
# only one that survives losing the VPS, so 0 there is never a policy, it is
# the destruction of the entire backup history; the run refuses. A local 0
# IS a legitimate policy ("offsite only, keep nothing on the box"), so it is
# allowed — the artifact it deletes is already at the remote by then.
check_retention_counts() {
  local name value
  for name in RETENTION_REMOTE_COUNT RETENTION_LOCAL_COUNT; do
    value="${!name}"
    case "$value" in
      '' | *[!0-9]*)
        echo "backup.sh: \$$name must be a whole number, got '$value'" >&2
        exit 1
        ;;
    esac
  done

  if [ "$RETENTION_REMOTE_COUNT" -lt 1 ]; then
    echo "backup.sh: \$RETENTION_REMOTE_COUNT must be at least 1 (got '$RETENTION_REMOTE_COUNT') — at 0 the prune deletes every offsite artifact, including the one this run just pushed, and the remote copy is the only one that survives losing this host" >&2
    exit 1
  fi
}

check_rclone_remote_set() {
  if [ -z "$RCLONE_REMOTE" ]; then
    echo "backup.sh: \$RCLONE_REMOTE must be set in '$BACKUP_ENV_FILE' — refusing before touching anything" >&2
    exit 1
  fi
}

check_encryption_recipient_set() {
  case "$ENCRYPTION_TOOL" in
    age)
      if [ -z "$AGE_RECIPIENT" ]; then
        echo "backup.sh: \$AGE_RECIPIENT must be set in '$BACKUP_ENV_FILE' — age is on \$PATH and is the preferred tool" >&2
        exit 1
      fi
      ;;
    gpg)
      if [ -z "$GPG_RECIPIENT" ]; then
        echo "backup.sh: \$GPG_RECIPIENT must be set in '$BACKUP_ENV_FILE' — age is not on \$PATH, falling back to gpg --recipient" >&2
        exit 1
      fi
      ;;
    *)
      # This is a guard: with no default branch, an unrecognised tool makes
      # it validate nothing and let the run continue — a check that passes
      # by not running.
      echo "backup.sh: unknown encryption tool '$ENCRYPTION_TOOL' — refusing rather than skipping the recipient check" >&2
      exit 1
      ;;
  esac
}

check_database_configuration() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "backup.sh: configuration file '$ENV_FILE' does not exist — aborting before touching the database" >&2
    exit 1
  fi
  local database_url
  database_url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  database_url="${database_url#*=}"
  if [ -z "$database_url" ]; then
    echo "backup.sh: missing required configuration variable 'DATABASE_URL' in '$ENV_FILE'" >&2
    exit 1
  fi
  DATABASE_URL="$database_url"
}

check_document_store_dir() {
  if [ ! -d "$DOCUMENT_STORE_DIR" ]; then
    echo "backup.sh: document store directory '$DOCUMENT_STORE_DIR' does not exist — nothing to back up" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------ plan

# Prints the remote artifact's rclone path (RCLONE_REMOTE joined with a
# single slash, regardless of whether RCLONE_REMOTE itself already ends in
# one) — shared by the plan text, the push step, and prune-remote.
remote_artifact_path() {
  local name="$1"
  printf '%s/%s' "${RCLONE_REMOTE%/}" "$name"
}

print_plan() {
  log "== backup.sh plan (dry-run=$DRY_RUN, encryption=$ENCRYPTION_TOOL) =="
  log "[plan:dump] pg_dump -Fc the database to local staging — MUST complete before the PDF-tree copy begins (design.md D7: dump-first can only orphan a harmless PDF; copy-first can strand an unrecoverable database row)"
  log "[plan:copy-documents] copy '$DOCUMENT_STORE_DIR' into local staging"
  log "[plan:archive] tar the staged dump + documents into a single archive"
  log "[plan:encrypt] encrypt the archive asymmetrically via $ENCRYPTION_TOOL (deploy/encrypt-backup-archive.sh) — the VPS never holds a key capable of decrypting it"
  log "[plan:push] rclone push the encrypted archive to '$(remote_artifact_path "<timestamp>.tar.enc")'"
  log "[plan:prune-remote] keep the $RETENTION_REMOTE_COUNT most recent remote copies, prune older ones"
  log "[plan:prune-local] keep the $RETENTION_LOCAL_COUNT most recent local copies, prune older ones"
}

print_prune_only_plan() {
  log "== backup.sh --prune-only plan (dry-run=$DRY_RUN) =="
  log "[plan:prune-remote] keep the $RETENTION_REMOTE_COUNT most recent remote copies under '$RCLONE_REMOTE', prune older ones"
  log "[plan:prune-local] keep the $RETENTION_LOCAL_COUNT most recent local copies under '$BACKUP_WORK_DIR', prune older ones"
}

# ----------------------------------------------------------------- steps

do_dump() {
  local dump_file="$1"
  log "[step] dumping the database to '$dump_file' before touching the PDF tree"
  mkdir -p "$(dirname "$dump_file")"
  pg_dump -Fc "$DATABASE_URL" -f "$dump_file"
}

do_copy_documents() {
  local staging_dir="$1"
  log "[step] copying '$DOCUMENT_STORE_DIR' into '$staging_dir'"
  mkdir -p "$staging_dir"
  cp -a "$DOCUMENT_STORE_DIR/." "$staging_dir/"
}

do_archive() {
  local stage_root="$1"
  local dump_file="$2"
  local documents_dir="$3"
  local tar_file="$4"
  log "[step] archiving '$dump_file' and '$documents_dir' into '$tar_file'"
  tar -C "$stage_root" -cf "$tar_file" "$(basename "$dump_file")" "$(basename "$documents_dir")"
}

do_encrypt() {
  local tar_file="$1"
  local encrypted_file="$2"
  log "[step] encrypting '$tar_file' -> '$encrypted_file' via $ENCRYPTION_TOOL"
  "$ENCRYPT_SCRIPT" "$tar_file" "$encrypted_file"
}

do_push() {
  local encrypted_file="$1"
  local remote_path
  remote_path="$(remote_artifact_path "$(basename "$encrypted_file")")"
  log "[step] pushing '$encrypted_file' -> '$remote_path'"
  rclone copyto "$encrypted_file" "$remote_path"
}

# ------------------------------------------------------------ retention

# Names sort chronologically (an ISO-8601-like timestamp prefix, same
# convention as publicar-assets.sh's `.releases/<timestamp>.files`), so a
# lexical sort orders them oldest-first — the same head/tail split
# publicar-assets.sh's do_prune_old_releases already uses.
# Filtered to this script's OWN artifacts, exactly as
# list_local_artifact_names already filters on '*.tar.enc'. `rclone lsjson`
# lists everything at the remote path, and the prune deletes the
# lexically-first entries — so an unrelated file sharing that bucket would
# both inflate the count and be deleted as an "old backup". This script must
# only ever delete what it created.
#
# Filtered with `sed -n '/…/p'`, not `grep`: under `set -o pipefail` a grep
# that matches nothing fails the whole pipeline, and the usual `|| true`
# would then also swallow a genuine `rclone lsjson` failure — a remote this
# script could not reach would look like a remote holding no backups.
list_remote_artifact_names() {
  rclone lsjson "$RCLONE_REMOTE" \
    | sed -n 's/.*"Name": *"\([^"]*\)".*/\1/p' \
    | sed -n '/\.tar\.enc$/p' \
    | sort
}

do_prune_remote() {
  local names total
  names="$(list_remote_artifact_names)"
  total="$(printf '%s\n' "$names" | grep -c . || true)"
  if [ "$total" -le "$RETENTION_REMOTE_COUNT" ]; then
    log "[skip] remote retention: $total artifact(s) at or under the $RETENTION_REMOTE_COUNT-copy limit"
    return
  fi

  local prune_count=$((total - RETENTION_REMOTE_COUNT))
  local to_prune name
  to_prune="$(printf '%s\n' "$names" | head -n "$prune_count")"
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    log "[prune-remote] removing '$name' (older than the $RETENTION_REMOTE_COUNT most recent)"
    rclone deletefile "$(remote_artifact_path "$name")"
  done <<< "$to_prune"
}

list_local_artifact_names() {
  find "$BACKUP_WORK_DIR" -maxdepth 1 -type f -name '*.tar.enc' -printf '%f\n' 2>/dev/null | sort
}

do_prune_local() {
  if [ ! -d "$BACKUP_WORK_DIR" ]; then
    log "[skip] local retention: '$BACKUP_WORK_DIR' does not exist yet"
    return
  fi

  local names total
  names="$(list_local_artifact_names)"
  total="$(printf '%s\n' "$names" | grep -c . || true)"
  if [ "$total" -le "$RETENTION_LOCAL_COUNT" ]; then
    log "[skip] local retention: $total copy/copies at or under the $RETENTION_LOCAL_COUNT-copy limit"
    return
  fi

  local prune_count=$((total - RETENTION_LOCAL_COUNT))
  local to_prune name
  to_prune="$(printf '%s\n' "$names" | head -n "$prune_count")"
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    log "[prune-local] removing local copy '$name'"
    rm -f "$BACKUP_WORK_DIR/$name"
  done <<< "$to_prune"
}

main() {
  parse_args "$@"

  # Every guard below runs BEFORE anything else — for both --dry-run and a
  # real run, same principle as deploy.sh's and tls-bootstrap.sh's
  # preflight guards (design.md D5/D6): a refusal here costs nothing.
  load_backup_env_into_environment
  resolve_encryption_tool
  check_retention_counts
  check_rclone_remote_set

  if [ "$PRUNE_ONLY" = true ]; then
    if [ "$DRY_RUN" = true ]; then
      print_prune_only_plan
      exit 0
    fi
    do_prune_remote
    do_prune_local
    log "== backup.sh: retention pruning complete =="
    exit 0
  fi

  check_encryption_recipient_set
  check_database_configuration
  check_document_store_dir

  if [ "$DRY_RUN" = true ]; then
    print_plan
    exit 0
  fi

  mkdir -p "$BACKUP_WORK_DIR"
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local stage_root
  stage_root="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$stage_root'" EXIT

  local dump_file="$stage_root/database.dump"
  local documents_dir="$stage_root/documentos"
  local tar_file="$stage_root/contratos-backup-$timestamp.tar"
  local encrypted_file="$BACKUP_WORK_DIR/contratos-backup-$timestamp.tar.enc"

  do_dump "$dump_file"
  do_copy_documents "$documents_dir"
  do_archive "$stage_root" "$dump_file" "$documents_dir" "$tar_file"
  do_encrypt "$tar_file" "$encrypted_file"
  do_push "$encrypted_file"
  do_prune_remote
  do_prune_local

  log "== backup.sh: backup complete (contratos-backup-$timestamp.tar.enc) =="
}

main "$@"
