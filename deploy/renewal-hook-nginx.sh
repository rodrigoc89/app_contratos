#!/usr/bin/env bash
#
# Certbot renewal deploy hook (design.md D6). Certbot's own packaged
# systemd timer renews the certificate automatically, but renewal alone
# does not make nginx pick up the new file — nginx keeps serving whatever
# certificate it loaded into memory at its last reload, while the file on
# disk is already current. This is the missing piece that closes that gap.
#
# Install:
#   deploy/tls-bootstrap.sh's [plan:renewal-hook] step installs this file at
#   /etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh — certbot runs
#   every executable under renewal-hooks/deploy/ automatically after a
#   SUCCESSFUL renewal only (never on a failed attempt), so this hook only
#   ever runs against a certificate that is already valid and already on
#   disk.
#
# `nginx -t` gates the reload, not the other way around: if a renewed
# certificate were ever paired with a config nginx cannot start (should not
# happen — deploy/nginx.conf's certificate paths never move), reloading a
# config that fails its own test would trade a working, if soon-to-expire,
# certificate for a broken nginx. Refusing to reload leaves the previous
# in-memory certificate serving until an operator investigates.
set -euo pipefail

nginx -t && systemctl reload nginx
