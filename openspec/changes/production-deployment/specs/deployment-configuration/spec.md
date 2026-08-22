# Deployment Configuration Specification

## Purpose

Define the complete environment-variable contract — 9 runtime variables from `configuracion.ts`'s Zod schema plus 6 raw `SEED_*` variables read outside it — and enforce that an incomplete configuration fails the deploy instead of producing a server that starts but cannot sign contracts.

## Requirements

### Requirement: `.env.example` completeness

`.env.example` MUST document every variable read by `configuracion.ts` and every raw `SEED_*` variable read by `prisma/seed.ts` / `seedDatabase.ts` — 15 total — with required/optional status and defaults, and no variable may exist in one source but not the other.

#### Scenario: Cross-check test (TDD — write first)

- GIVEN a test that parses `.env.example` and cross-checks its variable names against `configuracion.ts`'s Zod schema keys and the raw `process.env.SEED_*` reads
- WHEN run against the current repository state (no `.env.example` exists yet)
- THEN the test fails first, then passes once `.env.example` is authored with all 15 variables and no orphans in either direction
- Runs in CI with no server.

### Requirement: `CONFIAR_EN_PROXY` documented for production

`.env.example` MUST document `CONFIAR_EN_PROXY=true` as the required production value, with a comment stating that leaving it `false` behind nginx collapses the login rate limiter to a single client (127.0.0.1).

#### Scenario: Doc content check (pre-VPS)

- GIVEN `.env.example`
- WHEN inspected
- THEN it states `CONFIAR_EN_PROXY=true` for production with the rate-limiter consequence documented
- Text-content assertion, testable in CI with no server.

### Requirement: Deploy aborts on missing required configuration

The deploy script MUST check that required runtime variables (`DATABASE_URL`, `JWT_SECRET`) and, when seeding is enabled, the seed credential variables, are present and non-empty before proceeding, and MUST abort with a clear message rather than starting a service that will fail at request time.

#### Scenario: Static validation of the presence check (pre-VPS)

- GIVEN the deploy script
- WHEN reviewed and checked with `shellcheck` and `bash -n`
- THEN it checks each required variable's presence before invoking `migrate deploy`, seed, or `pnpm start`, and exits non-zero with a named-variable error message when one is missing

#### Scenario: Real abort on a real host (not verifiable before the VPS exists)

- GIVEN a `/etc/contratos/api.env` missing `JWT_SECRET`
- WHEN the deploy script runs
- THEN it aborts before starting the service, and the previous version keeps running
- End-to-end proof requires a real systemd unit and a real environment file.
