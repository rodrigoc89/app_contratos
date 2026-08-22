#!/usr/bin/env bash
#
# Encrypt a single file for offsite storage, asymmetrically — so the VPS
# that produces a backup never holds anything capable of decrypting it
# (design.md D7). Prefers `age` (a recipient public key, no local keyring
# needed) whenever it is present on $PATH; falls back to `gpg --recipient`
# otherwise. Both are asymmetric — the rejected choice in design.md is
# specifically `gpg --symmetric`, a passphrase that would have to live on
# the box being protected, not gpg itself.
#
# `age` is confirmed packaged for Ubuntu 22.04 (jammy) and 24.04 (noble)
# `universe`, so it is expected to be installable on the VPS; this script
# still checks at runtime rather than assuming, since the exact release the
# VPS ships is not pinned anywhere in this repository yet (`vps-purchase`
# is still an open external dependency).
#
# Usage:
#   AGE_RECIPIENT=age1... deploy/encrypt-backup-archive.sh INPUT OUTPUT
#   GPG_RECIPIENT=<fingerprint> deploy/encrypt-backup-archive.sh INPUT OUTPUT   # fallback
#
# For the gpg fallback, the recipient's PUBLIC key must already be present
# in $GNUPGHOME's keyring (gpg needs it to encrypt TO that recipient, even
# though it never needs — and must never receive — the matching SECRET
# key). age needs no such import step: the recipient string alone is
# sufficient.
#
# Called by deploy/backup.sh's [plan:encrypt] step; also directly testable
# on its own (design.md D8's harness pattern) — encrypt-backup-archive.spec.ts
# `execFile`s this script against real fixtures, with age mocked via $PATH
# injection when age itself is not installed on the machine running the
# tests.
set -euo pipefail

INPUT_FILE="${1:?usage: encrypt-backup-archive.sh INPUT OUTPUT}"
OUTPUT_FILE="${2:?usage: encrypt-backup-archive.sh INPUT OUTPUT}"

AGE_RECIPIENT="${AGE_RECIPIENT:-}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"

log() {
  printf '%s\n' "$*" >&2
}

resolve_encryption_tool() {
  if command -v age > /dev/null 2>&1; then
    printf 'age\n'
  else
    printf 'gpg\n'
  fi
}

ENCRYPTION_TOOL="$(resolve_encryption_tool)"

case "$ENCRYPTION_TOOL" in
  age)
    if [ -z "$AGE_RECIPIENT" ]; then
      echo "encrypt-backup-archive.sh: \$AGE_RECIPIENT must be set — age is on \$PATH and is the preferred tool" >&2
      exit 1
    fi
    age -r "$AGE_RECIPIENT" -o "$OUTPUT_FILE" "$INPUT_FILE"
    ;;
  gpg)
    if [ -z "$GPG_RECIPIENT" ]; then
      echo "encrypt-backup-archive.sh: \$GPG_RECIPIENT must be set — age is not on \$PATH, falling back to gpg --recipient (still asymmetric, per design.md D7)" >&2
      exit 1
    fi
    gpg --batch --yes --trust-model always --recipient "$GPG_RECIPIENT" --output "$OUTPUT_FILE" --encrypt "$INPUT_FILE"
    ;;
esac

log "encrypt-backup-archive.sh: encrypted '$INPUT_FILE' -> '$OUTPUT_FILE' using $ENCRYPTION_TOOL"
