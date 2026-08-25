# TLS Termination Specification

## Purpose

Acquire and renew a Let's Encrypt certificate via webroot ACME, and guarantee that a renewed certificate is actually served — not left on disk while nginx keeps the expired one in memory.

## Requirements

### Requirement: Correct first-issue ordering

TLS bootstrap MUST, in order: create `/var/www/certbot` → install an HTTP-only bootstrap nginx block → run `certbot certonly --webroot` → install `deploy/nginx.conf` → run `nginx -t` → reload. `deploy/nginx.conf`'s 443 block MUST NOT be installed before a certificate exists at the paths it references.

#### Scenario: Script order review (pre-VPS)

- GIVEN the TLS bootstrap script
- WHEN reviewed against `deploy/nginx.conf` lines 55-56 (`fullchain.pem`/`privkey.pem` paths) and line 41 (`/var/www/certbot`)
- THEN `deploy/nginx.conf` is installed only after certbot reports a successful issuance at those exact paths

#### Scenario: Real first-issue on the domain (not verifiable before the VPS exists)

- GIVEN a bare host with DNS for `contratos.iesnet.com.ar` pointed at it
- WHEN the TLS bootstrap script runs end-to-end
- THEN `certbot certonly --webroot` issues a real certificate and `nginx -t` subsequently passes with `deploy/nginx.conf` installed
- Requires a live, DNS-resolvable domain reachable by Let's Encrypt; cannot be simulated.

### Requirement: `nginx -t` as a hard gate

Installing `deploy/nginx.conf` MUST be followed by `nginx -t`; a nonzero exit MUST abort before any reload, leaving the previously-running nginx config untouched.

#### Scenario: Config validation on a real host (not verifiable before the VPS exists)

- GIVEN `deploy/nginx.conf` installed with a valid certificate present
- WHEN `nginx -t` runs
- THEN it reports syntax OK
- `deploy/nginx.conf` has never been run through `nginx -t`; unproven until nginx exists on real hardware. Pre-VPS, only manual directive review against nginx documentation is possible.

### Requirement: Renewal reload hook

A script MUST be installed under `/etc/letsencrypt/renewal-hooks/deploy/` that reloads nginx after every certificate renewal, so a renewed on-disk certificate is actually served.

#### Scenario: Hook script review (pre-VPS)

- GIVEN the renewal-hook script
- WHEN reviewed
- THEN it is placed at certbot's documented `renewal-hooks/deploy/` path, is executable, and its command reloads nginx (`systemctl reload nginx`); `bash -n`/`shellcheck` report zero errors

#### Scenario: Forced renewal actually reloads nginx (not verifiable before the VPS exists)

- GIVEN a real issued certificate and certbot's packaged renewal timer
- WHEN a renewal is forced as a drill
- THEN the deploy-hook fires and nginx subsequently serves the newly renewed certificate, confirmed by inspecting the certificate nginx presents (e.g. via `openssl s_client`)
- Requires a live host and a real issued certificate; cannot be simulated.
