#!/usr/bin/env bash
#
# Restore a backup produced by `deploy/backup.sh` into a SCRATCH database and
# document directory, then hand off to `deploy/verify-restore.sh` to prove
# the restore actually reconstructs what was backed up (design.md D7).
#
# This is a loaded gun pointed at production: its entire job is to overwrite
# a database and a document tree with the contents of a backup archive. The
# FIRST thing it does, before anything else, is refuse when its target
# equals the production database or document store — a tired operator at
# 2am reusing a shell that still has the production $DATABASE_URL exported
# gets a refusal, not a restored-over production database. This guard
# compares the SAME env var names the app and every other deploy/*.sh script
# already use ($DATABASE_URL, $ALMACEN_DOCUMENTOS_RUTA) against the
# production values recorded in $ENV_FILE (default /etc/contratos/api.env,
# the same file deploy.sh/backup.sh read) — never a differently-named
# "restore target" variable a rushed operator would not think to check.
#
# Usage:
#   ARCHIVE_FILE=/path/to/contratos-backup-<ts>.tar.enc \
#   DATABASE_URL=postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore \
#   ALMACEN_DOCUMENTOS_RUTA=/tmp/scratch-restore-documentos \
#     deploy/restore.sh
#
# Every path is overridable via environment variable, same harness pattern
# as the other deploy/ scripts (design.md D8): restore.spec.ts execFiles
# this script against scratch temp directories, never against a real
# database or /srv/contratos/documentos.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      *)
        echo "restore.sh: unrecognized argument: $arg" >&2
        exit 1
        ;;
    esac
  done
}

# The file holding the PRODUCTION values to guard against — the same file
# deploy.sh/backup.sh read from, never sourced, only compared against.
ENV_FILE="${ENV_FILE:-/etc/contratos/api.env}"

# The restore TARGET — deliberately the same variable names the running
# application, deploy.sh and backup.sh all use, so a shell that still has
# the production values exported is caught by the very values it is
# carrying, not by a differently-named variable it would never think to
# unset.
DATABASE_URL="${DATABASE_URL:-}"
ALMACEN_DOCUMENTOS_RUTA="${ALMACEN_DOCUMENTOS_RUTA:-}"

ARCHIVE_FILE="${ARCHIVE_FILE:-}"
# Decryption is the mirror image of encrypt-backup-archive.sh's asymmetric
# choice (design.md D7): the VPS that PRODUCES a backup never holds a
# decryption key, so decrypting only ever happens off that box — on the
# scratch host running this drill. age needs the recipient's private
# identity file; gpg needs the matching secret key already imported into
# the invoking user's own keyring (no path variable for that half).
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-}"
DECRYPTION_TOOL=""

VERIFY_RESTORE_SCRIPT="${VERIFY_RESTORE_SCRIPT:-$SCRIPT_DIR/verify-restore.sh}"

log() {
  printf '%s\n' "$*"
}

# ------------------------------------------------------------ guard: prod

# Reads a `KEY=value` line from a file without sourcing it — same posture
# deploy.sh's env_value() already established: an operator supplies these
# files, this script only ever reads them.
env_value_from_file() {
  local file="$1"
  local var_name="$2"
  local line
  line="$(grep -E "^${var_name}=" "$file" 2>/dev/null | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

# Task 9.1's guard, and the FIRST thing this script checks: refuses,
# before touching anything, when the restore TARGET equals a PRODUCTION
# value. A scratch host that genuinely has no /etc/contratos/api.env (the
# ordinary case for a restore drill) has nothing to compare against, so it
# is not this guard's job to require that file — only to use it when
# present.
check_not_production_target() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  local prod_database_url
  prod_database_url="$(env_value_from_file "$ENV_FILE" DATABASE_URL)"
  if [ -n "$prod_database_url" ] && [ "$DATABASE_URL" = "$prod_database_url" ]; then
    echo "restore.sh: target \$DATABASE_URL equals the production database configured in '$ENV_FILE' — refusing before touching anything" >&2
    exit 1
  fi

  local prod_documentos_ruta
  prod_documentos_ruta="$(env_value_from_file "$ENV_FILE" ALMACEN_DOCUMENTOS_RUTA)"
  if [ -n "$prod_documentos_ruta" ] && [ "$ALMACEN_DOCUMENTOS_RUTA" = "$prod_documentos_ruta" ]; then
    echo "restore.sh: target \$ALMACEN_DOCUMENTOS_RUTA equals the production document store configured in '$ENV_FILE' — refusing before touching anything" >&2
    exit 1
  fi
}

# --------------------------------------------------------- guard: targets

require_target_var() {
  local var_name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "restore.sh: \$$var_name must be set to the SCRATCH restore target — refusing before touching anything" >&2
    exit 1
  fi
}

require_archive_file() {
  if [ -z "$ARCHIVE_FILE" ]; then
    echo "restore.sh: \$ARCHIVE_FILE must be set to the encrypted backup archive to restore from — refusing before touching anything" >&2
    exit 1
  fi
  if [ ! -f "$ARCHIVE_FILE" ]; then
    echo "restore.sh: archive file '$ARCHIVE_FILE' (\$ARCHIVE_FILE) does not exist" >&2
    exit 1
  fi
}

# The tool has to match how the ARCHIVE was encrypted — a property of the
# archive, not of the scratch host. Selecting on $PATH means an `age` that
# happens to be installed demands an age identity for a gpg-encrypted
# archive, and the operator's own $AGE_IDENTITY_FILE is the only statement
# of intent this script has. Same rule as encrypt-backup-archive.sh and
# backup.sh use on the way out.
# `do_restore_documents` copies additively (`cp -a src/. dst/`) and never
# clears the target, so anything already sitting there survives the restore.
# A file left by an earlier drill at the same path then satisfies
# verificarRestauracion's `faltantes` check for a row whose PDF is MISSING
# from this archive — and, being the same document, its sha256 matches too,
# so `desajustados` stays clean as well. The drill passes on a backup that
# cannot actually be restored, which is the one outcome the go-live gate
# depends on it never producing.
#
# It refuses rather than clearing: this script's whole posture is that it
# never deletes what an operator pointed it at. Emptying the directory is
# their call, made knowingly.
check_document_target_empty() {
  if [ ! -d "$ALMACEN_DOCUMENTOS_RUTA" ]; then
    return
  fi

  if [ -n "$(ls -A "$ALMACEN_DOCUMENTOS_RUTA" 2>/dev/null)" ]; then
    echo "restore.sh: the restore target '$ALMACEN_DOCUMENTOS_RUTA' (\$ALMACEN_DOCUMENTOS_RUTA) is not empty. A file left there by an earlier run would stand in for one this archive is missing, and the verifier would report a clean restore of a backup that cannot actually be restored. Empty it (or point at a fresh directory) and run again — this script will not delete it for you." >&2
    exit 1
  fi
}

resolve_decryption_tool() {
  if [ -n "$AGE_IDENTITY_FILE" ]; then
    DECRYPTION_TOOL="age"
  elif command -v age > /dev/null 2>&1 && ! command -v gpg > /dev/null 2>&1; then
    DECRYPTION_TOOL="age"
  else
    DECRYPTION_TOOL="gpg"
  fi
}

check_decryption_identity() {
  if [ "$DECRYPTION_TOOL" = "age" ]; then
    if [ -z "$AGE_IDENTITY_FILE" ]; then
      echo "restore.sh: \$AGE_IDENTITY_FILE must be set — gpg is not available, so age is the only tool left. This identity file must NEVER live on the production VPS." >&2
      exit 1
    fi
    if [ ! -f "$AGE_IDENTITY_FILE" ]; then
      echo "restore.sh: age identity file '$AGE_IDENTITY_FILE' (\$AGE_IDENTITY_FILE) does not exist — refusing before touching anything" >&2
      exit 1
    fi
    if ! command -v age > /dev/null 2>&1; then
      echo "restore.sh: \$AGE_IDENTITY_FILE is set but age is not installed on \$PATH — install age, or unset it to decrypt a gpg-encrypted archive" >&2
      exit 1
    fi
  fi
  # The gpg fallback needs the matching secret key already imported into
  # the invoking user's own keyring — there is no path variable to check
  # for that; a missing key surfaces as `gpg --decrypt` itself failing.
}

# ----------------------------------------------------------------- steps

do_decrypt() {
  local encrypted_file="$1"
  local decrypted_file="$2"
  log "[step] decrypting '$encrypted_file' -> '$decrypted_file' via $DECRYPTION_TOOL"
  case "$DECRYPTION_TOOL" in
    age)
      age -d -i "$AGE_IDENTITY_FILE" -o "$decrypted_file" "$encrypted_file"
      ;;
    gpg)
      gpg --batch --yes --output "$decrypted_file" --decrypt "$encrypted_file"
      ;;
    *)
      echo "restore.sh: unknown decryption tool '$DECRYPTION_TOOL' — refusing rather than continuing with nothing decrypted" >&2
      exit 1
      ;;
  esac
}

do_extract() {
  local tar_file="$1"
  local staging_dir="$2"
  log "[step] extracting '$tar_file' into '$staging_dir'"
  mkdir -p "$staging_dir"
  tar -C "$staging_dir" -xf "$tar_file"
}

# `--clean --if-exists` matches deploy.sh's own rollback recipe
# (print_rollback_recipe) for restoring a pre-migration dump — same
# pg_restore invocation shape, applied here to a scratch target instead of
# production.
do_restore_database() {
  local dump_file="$1"
  log "[step] restoring '$dump_file' into \$DATABASE_URL (scratch target)"
  pg_restore --clean --if-exists -d "$DATABASE_URL" "$dump_file"
}

do_restore_documents() {
  local documents_dir="$1"
  log "[step] copying '$documents_dir' into \$ALMACEN_DOCUMENTOS_RUTA (scratch target)"
  mkdir -p "$ALMACEN_DOCUMENTOS_RUTA"
  cp -a "$documents_dir/." "$ALMACEN_DOCUMENTOS_RUTA/"
}

do_invoke_verifier() {
  log "[step] handing off to verify-restore.sh"
  DATABASE_URL="$DATABASE_URL" ALMACEN_DOCUMENTOS_RUTA="$ALMACEN_DOCUMENTOS_RUTA" "$VERIFY_RESTORE_SCRIPT"
}

main() {
  parse_args "$@"

  # Every guard below runs BEFORE any write — the production-target guard
  # runs first of all, per task 9.1: not a warning, a refusal, before
  # anything else in this script executes.
  check_not_production_target
  require_target_var DATABASE_URL "$DATABASE_URL"
  require_target_var ALMACEN_DOCUMENTOS_RUTA "$ALMACEN_DOCUMENTOS_RUTA"
  require_archive_file
  check_document_target_empty
  resolve_decryption_tool
  check_decryption_identity

  local stage_root
  stage_root="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$stage_root'" EXIT

  local decrypted_tar="$stage_root/contratos-backup.tar"
  local extract_dir="$stage_root/extracted"
  local dump_file="$extract_dir/database.dump"
  local documents_dir="$extract_dir/documentos"

  do_decrypt "$ARCHIVE_FILE" "$decrypted_tar"
  do_extract "$decrypted_tar" "$extract_dir"
  do_restore_database "$dump_file"
  do_restore_documents "$documents_dir"
  do_invoke_verifier

  log "== restore.sh: restore complete, handed off to verify-restore.sh =="
}

main "$@"
