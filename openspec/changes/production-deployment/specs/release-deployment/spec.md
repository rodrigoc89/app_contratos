# Release Deployment Specification

## Purpose

Get a named git tag onto the server and into service — install, build, migrate, seed, restart, verify health — through an idempotent script that never reports success while the técnico signing flow is unreachable.

## Requirements

### Requirement: Idempotent deploy script

The deploy script MUST checkout a git tag, run `pnpm install --frozen-lockfile`, build the web bundle, publish assets, run migrations, seed, restart the service, and verify health, and MUST be safely re-runnable.

#### Scenario: Static validation before the VPS exists

- GIVEN the deploy script
- WHEN checked with `shellcheck` and `bash -n`
- THEN both report zero errors, and each step is idempotent by construction

#### Scenario: End-to-end deploy on a real host (not verifiable before the VPS exists)

- GIVEN a running server on tag `vN`
- WHEN the deploy script targets tag `vN+1`
- THEN the service runs `vN+1`'s code and responds healthy, with no manual step

### Requirement: Deploy-time migration, not boot-time

The deploy script MUST stop the service, run `prisma migrate deploy`, seed, then start the service — never via `ExecStartPre=`, which would re-run migrations on every crash-loop restart.

#### Scenario: Unit file has no boot-time migration hook

- GIVEN `deploy/contratos-api.service`
- WHEN inspected
- THEN it declares no `ExecStartPre=` migration directive

#### Scenario: Deploy script orders stop, migrate, seed, start

- GIVEN the deploy script
- WHEN reviewed
- THEN `prisma migrate deploy` runs only after the service is stopped and before it is started
- This ordering, and that `migrate deploy` applies cleanly, is already exercised in CI's integration job against a throwaway Postgres 17 container — no VPS required for this part.

### Requirement: Fail-closed técnico seed gate

When `NODE_ENV=production` and the técnico account cannot be created (e.g. `SEED_TECNICO_PASSWORD` unset or too short), `seedDatabase()` MUST fail the process (nonzero exit) instead of the current warn-and-exit-0 behavior, since a successful-looking deploy with no técnico account leaves the signing flow unreachable.

#### Scenario: Missing técnico password fails the seed (TDD — write this test first)

- GIVEN `NODE_ENV=production` and `SEED_TECNICO_PASSWORD` unset
- WHEN `seedDatabase()` runs
- THEN it throws / the process exits non-zero, and the deploy script aborts
- Failing unit/integration test in `apps/api`, written before the implementation change; runs in CI with no server.

#### Scenario: Valid seed configuration still succeeds

- GIVEN `NODE_ENV=production` and valid admin + técnico credentials
- WHEN `seedDatabase()` runs, including a second run
- THEN it exits 0 and both accounts exist exactly once (idempotent by version-lookup, unchanged behavior)

### Requirement: Post-restart health verification

The deploy script MUST verify the API responds healthy (`/salud`) after restart before declaring success, and MUST report failure explicitly rather than exiting 0 when the new version fails to start.

#### Scenario: Health check fails after a bad deploy (not verifiable before the VPS exists)

- GIVEN a deploy where the new tag's API fails to start
- WHEN the deploy script's health check queries `/salud`
- THEN the script exits non-zero and reports the failure

### Requirement: Asset-swap ordering

New hashed web assets MUST be published before `index.html`/`sw.js` are overwritten, so a técnico with the PWA already open does not receive a 404 for a hashed asset the old shell still references.

#### Scenario: Publish order review (pre-VPS)

- GIVEN the deploy script's asset-publish step
- WHEN reviewed
- THEN hashed `/assets/*` files are copied before `index.html`/`sw.js` are replaced
- The técnico-facing outcome (no mid-visit 404) is only observable during a real deploy with live traffic.
