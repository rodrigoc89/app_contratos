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

# Which tool encrypts is a decision the operator makes by setting a
# recipient, not one made for them by whatever happens to be installed.
# Selecting on $PATH alone means an unrelated `apt install` that pulls in
# `age` breaks every backup on a host deliberately configured for gpg:
# $AGE_RECIPIENT is unset there, so the run refuses — a backup that stopped
# working because of a package nobody connected to backups.
#
# Only when neither recipient is configured does $PATH decide, and then
# purely so the refusal below names the tool this host would have used.
resolve_encryption_tool() {
  if [ -n "$AGE_RECIPIENT" ]; then
    printf 'age\n'
    return
  fi

  if [ -n "$GPG_RECIPIENT" ]; then
    printf 'gpg\n'
    return
  fi

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
      echo "encrypt-backup-archive.sh: \$AGE_RECIPIENT must be set — age is on \$PATH and is the preferred tool when no recipient is configured" >&2
      exit 1
    fi
    if ! command -v age > /dev/null 2>&1; then
      echo "encrypt-backup-archive.sh: \$AGE_RECIPIENT is set but age is not installed on \$PATH. Install age, or unset \$AGE_RECIPIENT and set \$GPG_RECIPIENT to use the gpg fallback — this script will not silently encrypt to a different recipient than the one configured." >&2
      exit 1
    fi
    age -r "$AGE_RECIPIENT" -o "$OUTPUT_FILE" "$INPUT_FILE"
    ;;
  gpg)
    if [ -z "$GPG_RECIPIENT" ]; then
      echo "encrypt-backup-archive.sh: \$GPG_RECIPIENT must be set — age is not on \$PATH, falling back to gpg --recipient (still asymmetric, per design.md D7)" >&2
      exit 1
    fi
    if ! command -v gpg > /dev/null 2>&1; then
      echo "encrypt-backup-archive.sh: neither age nor gpg is installed on \$PATH — this file cannot be encrypted, and an unencrypted backup must never leave this host (design.md D7)." >&2
      exit 1
    fi
    gpg --batch --yes --trust-model always --recipient "$GPG_RECIPIENT" --output "$OUTPUT_FILE" --encrypt "$INPUT_FILE"
    ;;
  *)
    # Unreachable while resolve_encryption_tool only ever emits age or gpg —
    # and that is exactly why it is worth stating. Without this branch a
    # third value encrypts nothing, falls through to the success log below,
    # and exits 0 having produced no output file at all.
    echo "encrypt-backup-archive.sh: unknown encryption tool '$ENCRYPTION_TOOL' — refusing to report success without encrypting anything" >&2
    exit 1
    ;;
esac

log "encrypt-backup-archive.sh: encrypted '$INPUT_FILE' -> '$OUTPUT_FILE' using $ENCRYPTION_TOOL"
