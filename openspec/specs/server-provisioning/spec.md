# Server Provisioning Specification

## Purpose

Bring a bare Ubuntu host to a state where the API can render a *correct*, complete PDF: required system packages, Chromium runtime libraries, fonts, swap, the `contratos` service user, and directories with correct ownership — via an idempotent, reviewable script rather than tribal knowledge.

## Requirements

### Requirement: Idempotent host setup

The provisioning script MUST create the `contratos` service user, the required directories (including `ALMACEN_DOCUMENTOS_RUTA`) with correct ownership and permissions, and install required apt packages, and MUST be safely re-runnable without duplicating side effects or failing on a previously-provisioned host.

#### Scenario: Static validation before a host exists

- GIVEN the provisioning script
- WHEN it is checked with `shellcheck` and `bash -n`
- THEN both report zero errors, and each creation step (user, directories, packages) is guarded by an existence check

#### Scenario: Re-run on an already-provisioned host

- GIVEN a host where the script has already run once successfully
- WHEN the script is run a second time
- THEN it exits 0 without creating duplicate users, directories, or fstab entries
- Full proof requires a real host; before the VPS exists this is provable only by script-logic review and a local dry run, not a live re-run against production.

### Requirement: Correct Spanish-text font rendering

The provisioning script MUST install TrueType font packages sufficient for headless Chromium to render Spanish text — including `ñ` and accented vowels — and provisioning MUST end with a render smoke test that proves this by generating a PDF and extracting its text back, not merely by checking the package manager's exit code.

#### Scenario: Package list review (pre-VPS)

- GIVEN the provisioning script's font package list
- WHEN reviewed against DESIGN.md §10 (`fonts-dejavu-core fonts-liberation`)
- THEN the script installs at least those packages and runs `fc-cache -f -v` afterward
- This proves packages are requested, not that glyphs render.

#### Scenario: Render smoke test on the real host (not verifiable before the VPS exists)

- GIVEN a freshly provisioned host with the script's font packages installed
- WHEN the smoke test renders a PDF containing `ñ` and accented vowels and extracts its text
- THEN the extracted text matches the source exactly, with no tofu/missing-glyph substitution
- Listed under "not verifiable until the VPS exists" in the proposal's own success criteria; apt exit code is not evidence.

### Requirement: Chromium runtime libraries

The provisioning script MUST install the shared libraries headless Chromium requires to launch (e.g. `libnss3`, `libatk-bridge2.0-0`, `libgbm1`), via a mechanism confirmed against Puppeteer's own documentation during design.

#### Scenario: Chromium launches without missing-library errors (not verifiable before the VPS exists)

- GIVEN a provisioned host
- WHEN the API launches Puppeteer with `--no-sandbox --disable-setuid-sandbox`
- THEN Chromium starts without a missing-shared-library error
- The render smoke test above also exercises this path and fails loudly if a library is missing.

### Requirement: Swap file

The provisioning script MUST create a 2 GB swap file idempotently and persist it via `/etc/fstab`, since the systemd unit deliberately omits `MemoryMax`.

#### Scenario: Idempotent swap creation

- GIVEN the provisioning script
- WHEN reviewed, and separately run twice against a scratch filesystem
- THEN it creates the swapfile and fstab entry only if absent, never duplicating either
- Persistence across an actual reboot is host-only verifiable.
