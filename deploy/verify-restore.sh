#!/usr/bin/env bash
#
# Thin wrapper: runs the TypeScript restore hash verifier
# (apps/api/prisma/restauracion/verificarRestauracion.ts, design.md D7)
# against the SCRATCH targets deploy/restore.sh (task 9.2) just restored
# into. All of the actual verification logic lives in that TypeScript
# module — streaming every `contrato_documentos` row's file and comparing
# it against its stored sha256 (task 9.4) — this script's only job is to
# invoke it with the right working directory and let $DATABASE_URL /
# $ALMACEN_DOCUMENTOS_RUTA (already set by the caller) reach it unchanged.
#
# Usage:
#   DATABASE_URL=postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore \
#   ALMACEN_DOCUMENTOS_RUTA=/tmp/scratch-restore-documentos \
#     deploy/verify-restore.sh
#
# Called by deploy/restore.sh's do_invoke_verifier step; also runnable on
# its own, e.g. to re-check a restore already in place without re-running
# the whole restore.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/contratos}"

require_target_var() {
  local var_name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "verify-restore.sh: \$$var_name must be set to the SCRATCH restore target — refusing before running the verifier" >&2
    exit 1
  fi
}

require_target_var DATABASE_URL "${DATABASE_URL:-}"
require_target_var ALMACEN_DOCUMENTOS_RUTA "${ALMACEN_DOCUMENTOS_RUTA:-}"

echo "verify-restore.sh: running the restore hash verifier (design.md D7) against \$ALMACEN_DOCUMENTOS_RUTA='$ALMACEN_DOCUMENTOS_RUTA'"

cd "$APP_DIR" && pnpm --filter @contratos/api verify:restore
