#!/usr/bin/env bash
#
# Deploy a git tag onto the server and into service: stop, dump, checkout,
# install, migrate, seed, publish, start, verify (design.md D5). This is the
# most dangerous script in `deploy/` — its real job is to stop the running
# production service — so every guard below MUST refuse BEFORE that happens:
#   1. git repository selection  (threat matrix — always $APP_DIR, never cwd)
#   2. commit state               (threat matrix — refuse a dirty worktree)
#   3. required configuration     (deployment-configuration spec.md)
# A guard that fires after the outage has already started is not a guard.
#
# Usage:
#   sudo TAG=v1.2.3 deploy/deploy.sh      # apply
#   deploy/deploy.sh --dry-run            # preview the plan only, no root,
#                                          # guards still run for real
#
# Every path is overridable via environment variable, same harness pattern as
# `provision.sh` (design.md D8): `deploy.spec.ts` execFiles this script with
# `--dry-run` against a scratch temp directory, never against /opt/contratos.
set -euo pipefail

DRY_RUN=false

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run)
        DRY_RUN=true
        ;;
      *)
        echo "deploy.sh: unrecognized argument: $arg" >&2
        exit 1
        ;;
    esac
  done
}

APP_DIR="${APP_DIR:-/opt/contratos}"
GIT_REMOTE_NAME="${GIT_REMOTE_NAME:-origin}"
ENV_FILE="${ENV_FILE:-/etc/contratos/api.env}"
SERVICE_USER="${SERVICE_USER:-contratos}"
SERVICE_NAME="${SERVICE_NAME:-contratos-api}"
TAG="${TAG:-}"
# Set FIRST_DEPLOY=true only for the very first deploy to a fresh database,
# before the admin/técnico accounts exist. It makes this preflight require
# SEED_ADMIN_PASSWORD and SEED_TECNICO_PASSWORD to be present, refusing
# before the service is stopped if either is missing. Leave it unset on
# every later deploy: seedDatabase.ts's own fail-closed gate (D3) still
# protects first-time account creation on its own, and D3's regression
# guard depends on being able to rotate both passwords OUT of this file
# once the accounts already exist — a preflight that always demanded them
# would break exactly the redeploy that guard exists to keep working.
FIRST_DEPLOY="${FIRST_DEPLOY:-false}"
# A local, pre-migration safety net — distinct from the encrypted, offsite,
# retention-pruned backups `backup.sh` (PR7, design.md D7) performs on a
# schedule. This dump exists only so a failed migration has something to
# restore from immediately, without waiting on the offsite path.
PRE_MIGRATION_DUMP_DIR="${PRE_MIGRATION_DUMP_DIR:-/var/backups/contratos}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/salud}"
HEALTH_MAX_ATTEMPTS="${HEALTH_MAX_ATTEMPTS:-10}"
HEALTH_RETRY_DELAY_SECONDS="${HEALTH_RETRY_DELAY_SECONDS:-3}"

log() {
  printf '%s\n' "$*"
}

# --------------------------------------------------------------- guard: git

# Threat matrix — git repository selection (Applicable): deploy.sh must
# always operate on $APP_DIR, never on whatever repository the operator
# happens to be standing in. `git -C "$APP_DIR"` already never reads cwd for
# its own operations; this guard additionally refuses to proceed at all
# unless $APP_DIR itself resolves to a real git checkout, so a
# misconfigured $APP_DIR can never silently fall back to acting on cwd.
check_git_repository() {
  local resolved_app_dir
  if ! resolved_app_dir="$(cd "$APP_DIR" 2>/dev/null && pwd -P)"; then
    echo "deploy.sh: must run against \$APP_DIR ('$APP_DIR'), not cwd — '$APP_DIR' does not exist" >&2
    exit 1
  fi

  local actual_toplevel
  if ! actual_toplevel="$(git -C "$APP_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "deploy.sh: must run against \$APP_DIR ('$APP_DIR'), not cwd — '$APP_DIR' is not a git checkout" >&2
    exit 1
  fi

  if [ "$actual_toplevel" != "$resolved_app_dir" ]; then
    echo "deploy.sh: must run against \$APP_DIR ('$APP_DIR'), not cwd — its git top-level is '$actual_toplevel', not '$resolved_app_dir'" >&2
    exit 1
  fi

  if ! git -C "$APP_DIR" remote get-url "$GIT_REMOTE_NAME" > /dev/null 2>&1; then
    echo "deploy.sh: \$APP_DIR ('$APP_DIR') has no '$GIT_REMOTE_NAME' remote configured" >&2
    exit 1
  fi
}

# ---------------------------------------------------------- guard: worktree

# Threat matrix — commit state (Applicable): a hot-fixed server worktree
# must never be silently discarded. This guard only reads `git status`; it
# never calls `git reset --hard`, `git checkout --force`, or any other
# destructive command — refusing is the entire mechanism, so there is
# nothing here that could discard an uncommitted change.
check_clean_worktree() {
  local status
  status="$(git -C "$APP_DIR" status --porcelain)"
  if [ -n "$status" ]; then
    echo "deploy.sh: \$APP_DIR ('$APP_DIR') has uncommitted changes — refusing to deploy over a dirty worktree:" >&2
    printf '%s\n' "$status" >&2
    exit 1
  fi
}

# ------------------------------------------------------- guard: config env

# Reads a `KEY=value` line from $ENV_FILE without sourcing it (the app
# itself deliberately never loads this file either — see
# configuracion.ts — an operator supplies it, deploy.sh only reads it).
env_value() {
  local var_name="$1"
  local line
  line="$(grep -E "^${var_name}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

require_env_var() {
  local var_name="$1"
  if [ -z "$(env_value "$var_name")" ]; then
    echo "deploy.sh: missing required configuration variable '$var_name' in '$ENV_FILE' — aborting before touching the running service" >&2
    exit 1
  fi
}

# deployment-configuration spec.md: deploy aborts on missing required
# configuration, before proceeding — DATABASE_URL and JWT_SECRET always;
# the seed passwords only on an explicit first deploy (see FIRST_DEPLOY
# above).
check_deploy_configuration() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "deploy.sh: configuration file '$ENV_FILE' does not exist — aborting before touching the running service" >&2
    exit 1
  fi

  require_env_var DATABASE_URL
  require_env_var JWT_SECRET

  if [ "$FIRST_DEPLOY" = "true" ]; then
    require_env_var SEED_ADMIN_PASSWORD
    require_env_var SEED_TECNICO_PASSWORD
    require_env_var SEED_OFICINA_PASSWORD
    require_env_var SEED_OFICINA2_PASSWORD
  fi
}

# Exports the variables the real (non-dry-run) steps below need into this
# script's own environment, so `pg_dump`, `prisma migrate deploy`, and
# `prisma:seed` (run outside systemd, which is the only other place that
# reads $ENV_FILE) see the same configuration the running service does.
load_env_file_into_environment() {
  local var_name value
  for var_name in \
    DATABASE_URL JWT_SECRET CONFIAR_EN_PROXY ALMACEN_DOCUMENTOS_RUTA PORT \
    SEED_ADMIN_USERNAME SEED_ADMIN_NOMBRE SEED_ADMIN_PASSWORD \
    SEED_TECNICO_USERNAME SEED_TECNICO_NOMBRE SEED_TECNICO_PASSWORD \
    SEED_OFICINA_USERNAME SEED_OFICINA_NOMBRE SEED_OFICINA_PASSWORD \
    SEED_OFICINA2_USERNAME SEED_OFICINA2_NOMBRE SEED_OFICINA2_PASSWORD
  do
    value="$(env_value "$var_name")"
    if [ -n "$value" ]; then
      export "$var_name=$value"
    fi
  done
}

# ------------------------------------------------------------------- plan

print_plan() {
  log "== deploy.sh plan for $APP_DIR (dry-run=$DRY_RUN, tag='${TAG:-<unset>}') =="
  log "[plan:stop] stop the $SERVICE_NAME service"
  log "[plan:dump] pg_dump -Fc the database to $PRE_MIGRATION_DUMP_DIR before touching the checkout (quiescent — service already stopped)"
  log "[plan:checkout] git fetch --tags && git checkout --detach '${TAG:-<unset>}'"
  log "[plan:install] pnpm install --frozen-lockfile, install the Chromium browser (D1), and build the web app, all as '$SERVICE_USER'"
  log "[plan:migrate] prisma migrate deploy"
  log "[plan:seed] $(seed_command) — fails closed in production per D3, never at boot"
  log "[plan:publish] deploy/publicar-assets.sh — additive assets, then index.html, then sw.js (D4)"
  log "[plan:start] start the $SERVICE_NAME service and verify GET $HEALTH_URL with retries"
}

# ------------------------------------------------------------------- steps

do_stop() {
  log "[step] stopping $SERVICE_NAME"
  systemctl stop "$SERVICE_NAME"
}

do_dump() {
  local dump_file="$1"
  log "[step] dumping the database to '$dump_file' before touching the checkout"
  mkdir -p "$PRE_MIGRATION_DUMP_DIR"
  pg_dump -Fc "$DATABASE_URL" -f "$dump_file"
}

do_checkout() {
  log "[step] fetching tags and checking out '$TAG' (detached)"
  git -C "$APP_DIR" fetch "$GIT_REMOTE_NAME" --tags
  git -C "$APP_DIR" checkout --detach "$TAG"
}

# D1: root already resolved Chromium's shared-library dependencies
# (provision.sh); the browser binary itself installs here, as the
# unprivileged `contratos` user, into $SERVICE_USER's own cache — the same
# command `.github/workflows/ci.yml` runs for the same reason: a warm pnpm
# store does not re-run Puppeteer's postinstall.
run_as_service_user() {
  local preserve_env="DATABASE_URL,JWT_SECRET,CONFIAR_EN_PROXY,ALMACEN_DOCUMENTOS_RUTA,PORT,SEED_ADMIN_USERNAME,SEED_ADMIN_NOMBRE,SEED_ADMIN_PASSWORD,SEED_TECNICO_USERNAME,SEED_TECNICO_NOMBRE,SEED_TECNICO_PASSWORD,SEED_OFICINA_USERNAME,SEED_OFICINA_NOMBRE,SEED_OFICINA_PASSWORD,SEED_OFICINA2_USERNAME,SEED_OFICINA2_NOMBRE,SEED_OFICINA2_PASSWORD"
  if [ "$(id -un)" = "$SERVICE_USER" ]; then
    bash -c "$1"
  else
    sudo -u "$SERVICE_USER" --preserve-env="$preserve_env" -- bash -c "$1"
  fi
}

do_install() {
  log "[step] installing dependencies, the Chromium browser, and building the web app as '$SERVICE_USER'"
  run_as_service_user "cd '$APP_DIR' && pnpm install --frozen-lockfile"
  run_as_service_user "cd '$APP_DIR' && pnpm --filter @contratos/api exec puppeteer browsers install chrome"
  run_as_service_user "cd '$APP_DIR' && pnpm --filter @contratos/api exec prisma generate"
  run_as_service_user "cd '$APP_DIR' && pnpm --filter @contratos/web build"
}

# Deploy-time migration, never boot-time (design.md D5): the systemd unit
# has no ExecStartPre= on purpose — that would re-run migrations on every
# crash-loop restart. This is the one and only place `prisma migrate
# deploy` runs.
do_migrate() {
  log "[step] running pending Prisma migrations"
  run_as_service_user "cd '$APP_DIR/apps/api' && pnpm prisma:migrate:deploy"
}

# Fails closed in production when an admin/técnico account resolves to
# `omitido` (D3, apps/api/src/seed/seedDatabase.ts) — never on
# `already-present`, which is what keeps a routine redeploy working after
# both passwords are rotated out of $ENV_FILE.
# The one definition of what the seed step runs, so `print_plan` above shows
# the real command instead of a prose description that can drift from it.
#
# `NODE_ENV=production` is stated here rather than read from $ENV_FILE, and
# it is not optional: `prisma:seed` runs outside systemd, so it inherits
# nothing from `EnvironmentFile=`; `load_env_file_into_environment` exports
# an explicit whitelist; `run_as_service_user` passes an explicit
# `--preserve-env` list; and `dotenv/config` in `prisma/seed.ts` loads
# `apps/api/.env`, which does not exist on this host. Without this
# assignment `process.env.NODE_ENV` is undefined and every
# `nodeEnv === "production"` guard in `seedDatabase.ts` silently passes —
# including the one that refuses to seed with the placeholder signature,
# which the comment there calls "THE line" because a contract signed with it
# is rendered, hashed, sealed and stored exactly like a real one, with no
# later stage that would catch it. Reading the value from $ENV_FILE would
# fail open again the first time an operator left the line out; deploy.sh
# only ever runs on the production host, so it asserts it.
seed_command() {
  printf "cd '%s/apps/api' && NODE_ENV=production pnpm prisma:seed" "$APP_DIR"
}

do_seed() {
  log "[step] seeding the database (fails closed in production per D3)"
  run_as_service_user "$(seed_command)"
}

# publicar-assets.sh (PR5, D4) does not exist in this repository yet — only
# its --dry-run plan lists this step's name as a string; calling it here by
# path needs no earlier task to have created it, and this line is never
# reached by --dry-run in the first place.
do_publish() {
  log "[step] publishing web assets"
  "$APP_DIR/deploy/publicar-assets.sh"
}

print_rollback_recipe() {
  local previous_ref="$1"
  local dump_file="$2"
  cat >&2 <<EOF
deploy.sh: health check failed after starting '$SERVICE_NAME' — the service was left in a failed or unhealthy state.

Rollback recipe (manual — deploy.sh does not run this automatically):
  1. git -C '$APP_DIR' checkout --detach '$previous_ref'
  2. Re-run this script's install/migrate/seed steps against '$previous_ref' if the
     checkout alone is not enough (e.g. node_modules or the built web app changed).
  3. If the schema itself moved incompatibly, restore the pre-migration dump instead
     of re-migrating forward:
       pg_restore --clean --if-exists -d "\$DATABASE_URL" '$dump_file'
  4. systemctl start '$SERVICE_NAME'
  5. curl -fsS '$HEALTH_URL'
EOF
}

do_start_and_verify() {
  local previous_ref="$1"
  local dump_file="$2"

  log "[step] starting $SERVICE_NAME"
  systemctl start "$SERVICE_NAME"

  local attempt=1
  while [ "$attempt" -le "$HEALTH_MAX_ATTEMPTS" ]; do
    if curl -fsS -o /dev/null "$HEALTH_URL"; then
      log "[step] $HEALTH_URL responded OK on attempt $attempt/$HEALTH_MAX_ATTEMPTS"
      return 0
    fi
    log "[step] $HEALTH_URL not ready yet (attempt $attempt/$HEALTH_MAX_ATTEMPTS)"
    sleep "$HEALTH_RETRY_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done

  print_rollback_recipe "$previous_ref" "$dump_file"
  exit 1
}

main() {
  parse_args "$@"

  # Every guard below runs BEFORE the service is ever stopped — for both
  # --dry-run and a real deploy. A refusal here costs nothing; a refusal
  # after `systemctl stop` costs an outage for no reason.
  check_git_repository
  check_clean_worktree
  check_deploy_configuration

  if [ "$DRY_RUN" = true ]; then
    print_plan
    exit 0
  fi

  if [ -z "$TAG" ]; then
    echo "deploy.sh: \$TAG must be set to the git tag to deploy (e.g. TAG=v1.2.3 deploy/deploy.sh)" >&2
    exit 1
  fi

  load_env_file_into_environment

  do_stop

  local previous_ref
  previous_ref="$(git -C "$APP_DIR" rev-parse HEAD)"
  # Assigned separately from `local`: `local x="$(cmd)"` takes `local`'s own
  # exit status, so a failing command substitution goes unnoticed (SC2155).
  local dump_file
  dump_file="$PRE_MIGRATION_DUMP_DIR/pre-migration-$(date -u +%Y%m%dT%H%M%SZ).dump"

  do_dump "$dump_file"
  do_checkout
  do_install
  do_migrate
  do_seed
  do_publish
  do_start_and_verify "$previous_ref" "$dump_file"

  log "== deploy.sh: '$TAG' is live =="
}

main "$@"
