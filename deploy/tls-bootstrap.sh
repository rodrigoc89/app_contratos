#!/usr/bin/env bash
#
# Bootstrap TLS on a fresh host (design.md D6). `deploy/nginx.conf:55-56`
# references certificate paths that do not exist until a certificate has
# been issued, so installing it first makes nginx refuse to start — the
# chicken-and-egg this script exists to break:
#
#   install nginx-bootstrap.conf (HTTP-only: ACME location + 503 catch-all)
#     → nginx -t → reload
#     → certbot certonly --webroot          (cert now exists)
#     → render deploy/nginx.conf, install it
#     → nginx -t          ← HARD GATE: on failure, repoint back to the
#                            bootstrap conf and reload, so nginx never ends
#                            this run unable to start
#     → reload
#     → install the renewal deploy hook
#
# Usage:
#   sudo CONTRATOS_HOST=contratos.example.com deploy/tls-bootstrap.sh  # apply
#   CONTRATOS_HOST=contratos.example.com deploy/tls-bootstrap.sh --dry-run
#                                          # preview the plan only, no root;
#                                          # the render + placeholder guard
#                                          # still runs for real
#
# Every path is overridable via environment variable, same harness pattern
# as `provision.sh`/`deploy.sh`/`publicar-assets.sh` (design.md D8):
# `tls-bootstrap.spec.ts` execFiles this script with `--dry-run` and a
# scratch/fixture `NGINX_CONF_TEMPLATE`, never against a real host.
set -euo pipefail

DRY_RUN=false

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run)
        DRY_RUN=true
        ;;
      *)
        echo "tls-bootstrap.sh: unrecognized argument: $arg" >&2
        exit 1
        ;;
    esac
  done
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The real hostname certbot issues the certificate for, and the path
# deploy/nginx.conf's `root` serves — no sensible default for either exists
# per-host, so both are required (checked below, before anything touches
# nginx).
CONTRATOS_HOST="${CONTRATOS_HOST:-}"
WEB_ROOT="${WEB_ROOT:-/var/www/contratos}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
CERTBOT_WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"

NGINX_CONF_TEMPLATE="${NGINX_CONF_TEMPLATE:-$SCRIPT_DIR/nginx.conf}"
NGINX_BOOTSTRAP_CONF_TEMPLATE="${NGINX_BOOTSTRAP_CONF_TEMPLATE:-$SCRIPT_DIR/nginx-bootstrap.conf}"
RENEWAL_HOOK_SOURCE="${RENEWAL_HOOK_SOURCE:-$SCRIPT_DIR/renewal-hook-nginx.sh}"
RENEWAL_HOOK_TARGET="${RENEWAL_HOOK_TARGET:-/etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh}"

NGINX_SITES_AVAILABLE_DIR="${NGINX_SITES_AVAILABLE_DIR:-/etc/nginx/sites-available}"
NGINX_SITES_ENABLED_DIR="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"
SITE_NAME="${SITE_NAME:-contratos}"
BOOTSTRAP_SITE_FILE="$NGINX_SITES_AVAILABLE_DIR/$SITE_NAME-bootstrap"
FULL_SITE_FILE="$NGINX_SITES_AVAILABLE_DIR/$SITE_NAME"
ENABLED_LINK="$NGINX_SITES_ENABLED_DIR/$SITE_NAME"

# Where the rendered deploy/nginx.conf is written before it is ever copied
# into $FULL_SITE_FILE. Left as an empty default so a fresh scratch file is
# used per run unless a caller (a test) overrides it explicitly.
RENDERED_CONF_FILE="${RENDERED_CONF_FILE:-}"

log() {
  printf '%s\n' "$*"
}

# ------------------------------------------------------ guard: required config

# $WEB_ROOT has a sensible default (above, matching publicar-assets.sh and
# deploy/nginx.conf's original root), so "${WEB_ROOT:-...}" already turns an
# empty override back into that default before this function ever runs —
# there is no reachable "$WEB_ROOT is empty" state to guard here. No default
# is sensible for $CONTRATOS_HOST — a wrong-but-present one would silently
# render a template for the wrong host — so it alone is required.
check_contratos_host_set() {
  if [ -z "$CONTRATOS_HOST" ]; then
    echo "tls-bootstrap.sh: \$CONTRATOS_HOST must be set (the real hostname certbot issues the certificate for) — refusing to touch nginx" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------ render

# Substitutes deploy/nginx.conf's two placeholder tokens (task 6.1) into
# $RENDERED_CONF_FILE. `|` as the sed delimiter, not `/`, since both
# substituted values are filesystem paths that legitimately contain `/`.
render_nginx_conf() {
  if [ -z "$RENDERED_CONF_FILE" ]; then
    RENDERED_CONF_FILE="$(mktemp)"
  fi

  if [ ! -f "$NGINX_CONF_TEMPLATE" ]; then
    echo "tls-bootstrap.sh: nginx.conf template '$NGINX_CONF_TEMPLATE' not found — refusing to touch nginx" >&2
    exit 1
  fi

  sed \
    -e "s|__CONTRATOS_HOST__|$CONTRATOS_HOST|g" \
    -e "s|__WEB_ROOT__|$WEB_ROOT|g" \
    "$NGINX_CONF_TEMPLATE" > "$RENDERED_CONF_FILE"
}

# Catches template drift, not just a missing env var: a future edit to
# deploy/nginx.conf that introduces a new `__TOKEN__` this script does not
# yet know how to substitute must still refuse before nginx is ever
# touched — an empty $CONTRATOS_HOST/$WEB_ROOT is caught earlier, by
# check_host_and_web_root_set, since sed would otherwise happily substitute
# an empty string and leave no literal token behind for this guard to see.
check_no_placeholder_literals() {
  local rendered_file="$1"
  if grep -qE '__[A-Za-z0-9_]+__' "$rendered_file"; then
    local leftover
    leftover="$(grep -oE '__[A-Za-z0-9_]+__' "$rendered_file" | sort -u | tr '\n' ' ')"
    echo "tls-bootstrap.sh: rendered nginx.conf still contains unresolved placeholder token(s): ${leftover}— refusing to touch nginx" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------- plan

print_plan() {
  log "== tls-bootstrap.sh plan for '$CONTRATOS_HOST' (dry-run=$DRY_RUN) =="
  log "[plan:render-check] render deploy/nginx.conf with \$CONTRATOS_HOST/\$WEB_ROOT and confirm no placeholder token survives — already done above"
  log "[plan:install-nginx] apt-get install -y nginx"
  log "[plan:certbot-webroot-dir] install -d '$CERTBOT_WEBROOT' (ACME challenge webroot)"
  log "[plan:remove-default-site] remove nginx's default site from '$NGINX_SITES_ENABLED_DIR'"
  log "[plan:bootstrap-install] install '$NGINX_BOOTSTRAP_CONF_TEMPLATE' -> '$BOOTSTRAP_SITE_FILE', symlink '$ENABLED_LINK' -> it"
  log "[plan:bootstrap-test] nginx -t against the HTTP-only bootstrap conf"
  log "[plan:bootstrap-reload] systemctl reload nginx"
  log "[plan:certbot] certbot certonly --webroot -w '$CERTBOT_WEBROOT' -d '$CONTRATOS_HOST'"
  log "[plan:full-install] install the rendered nginx.conf -> '$FULL_SITE_FILE', repoint '$ENABLED_LINK' -> it"
  log "[plan:full-test] nginx -t against the full TLS conf — HARD GATE: on failure, repoint '$ENABLED_LINK' back to '$BOOTSTRAP_SITE_FILE' and reload, so nginx never ends this run unable to start"
  log "[plan:full-reload] systemctl reload nginx"
  log "[plan:renewal-hook] install deploy/renewal-hook-nginx.sh -> '$RENEWAL_HOOK_TARGET'"
}

# ------------------------------------------------------------------- steps

do_install_nginx() {
  log "[step] installing nginx"
  apt-get update
  apt-get install -y nginx
}

do_prepare_certbot_webroot() {
  log "[step] preparing the ACME webroot at '$CERTBOT_WEBROOT'"
  install -d -m 755 "$CERTBOT_WEBROOT"
}

# Idempotent: a re-run on an already-bootstrapped host finds the default
# site already gone.
do_remove_default_site() {
  local default_enabled="$NGINX_SITES_ENABLED_DIR/default"
  if [ -e "$default_enabled" ] || [ -L "$default_enabled" ]; then
    log "[step] removing nginx's default site '$default_enabled'"
    rm -f "$default_enabled"
  else
    log "[skip] nginx's default site already removed"
  fi
}

do_install_bootstrap_site() {
  log "[step] installing the HTTP-only bootstrap conf as the active nginx site"
  install -m 644 "$NGINX_BOOTSTRAP_CONF_TEMPLATE" "$BOOTSTRAP_SITE_FILE"
  ln -sf "$BOOTSTRAP_SITE_FILE" "$ENABLED_LINK"
}

do_test_and_reload_bootstrap() {
  log "[step] nginx -t (HTTP-only bootstrap conf)"
  nginx -t
  log "[step] reloading nginx (HTTP-only bootstrap conf)"
  systemctl reload nginx
}

# Idempotent per certbot itself: an existing, still-valid certificate for
# $CONTRATOS_HOST is not reissued (--keep-until-expiring).
do_issue_certificate() {
  log "[step] requesting/renewing the certificate for '$CONTRATOS_HOST' via certbot"
  local email_args=()
  if [ -n "$CERTBOT_EMAIL" ]; then
    email_args=(--email "$CERTBOT_EMAIL")
  else
    email_args=(--register-unsafely-without-email)
  fi
  certbot certonly --webroot -w "$CERTBOT_WEBROOT" -d "$CONTRATOS_HOST" \
    --non-interactive --agree-tos --keep-until-expiring "${email_args[@]}"
}

do_install_full_site() {
  log "[step] installing the rendered nginx.conf as the active nginx site"
  install -m 644 "$RENDERED_CONF_FILE" "$FULL_SITE_FILE"
  ln -sf "$FULL_SITE_FILE" "$ENABLED_LINK"
}

# The hard gate task 6.4 requires: nginx must never end a run unable to
# start. If the full TLS conf fails its own test, the symlink goes back to
# the bootstrap conf — already proven valid by do_test_and_reload_bootstrap
# above — and nginx reloads on THAT, not on the broken conf.
do_test_full_site_or_rollback() {
  log "[step] nginx -t (full TLS conf — hard gate)"
  if nginx -t; then
    log "[step] reloading nginx (full TLS conf)"
    systemctl reload nginx
    return 0
  fi

  echo "tls-bootstrap.sh: 'nginx -t' failed against the rendered TLS conf — repointing '$ENABLED_LINK' back to the bootstrap conf so nginx never ends this run unable to start" >&2
  ln -sf "$BOOTSTRAP_SITE_FILE" "$ENABLED_LINK"
  nginx -t
  systemctl reload nginx
  exit 1
}

do_install_renewal_hook() {
  log "[step] installing the certbot renewal deploy hook"
  install -d -m 755 "$(dirname "$RENEWAL_HOOK_TARGET")"
  install -m 755 "$RENEWAL_HOOK_SOURCE" "$RENEWAL_HOOK_TARGET"
}

main() {
  parse_args "$@"

  # Both guards below run BEFORE anything touches nginx — for both
  # --dry-run and a real run, exactly like deploy.sh's preflight guards
  # (design.md D5): a refusal here costs nothing; a refusal after the
  # bootstrap conf is already installed costs a needless partial state.
  check_contratos_host_set
  render_nginx_conf
  check_no_placeholder_literals "$RENDERED_CONF_FILE"

  if [ "$DRY_RUN" = true ]; then
    print_plan
    exit 0
  fi

  do_install_nginx
  do_prepare_certbot_webroot
  do_remove_default_site
  do_install_bootstrap_site
  do_test_and_reload_bootstrap
  do_issue_certificate
  do_install_full_site
  do_test_full_site_or_rollback
  do_install_renewal_hook

  log "== tls-bootstrap.sh: TLS bootstrapped for '$CONTRATOS_HOST' =="
}

main "$@"
