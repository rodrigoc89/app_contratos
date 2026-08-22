# Proposal: Production deployment to a HostGator VPS

## Intent

**Current-state gap.** `deploy/nginx.conf` and `deploy/contratos-api.service` are written and merged (PR #35) but have never been executed: `nginx -t` has never run against them and the unit has never started under real systemd. Everything between "a bare Ubuntu host" and "a técnico signs a contract" is either prose in `DESIGN.md` §10 (fonts, swap, backups) or nowhere at all (provisioning, artifact delivery, TLS acquisition, migration/seed execution). "Written but never run" is the actual starting state.

**Why now.** The system is feature-complete for the técnico signing flow and the VPS purchase is imminent. The two gaps that are not merely inconvenient are legal: a missing font renders a legally-signed contract as a page of `□` that still hashes and still gets signed, and there is no backup at all — `DESIGN.md` §10 prices a 7-day gap at ~100 customers re-visited for a second signature.

**Success.** A named release reaches a reproducible server state through a reviewable, idempotent script, and a signed contract can be provably restored from an offsite copy.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | Idempotent provisioning script: packages, Chromium runtime libraries, fonts + `fc-cache`, 2 GB swap, `contratos` user, directories, permissions |
| 2 | Idempotent deploy script: checkout a git tag, `pnpm install --frozen-lockfile`, `vite build`, publish web assets, migrate, seed, restart, health check |
| 3 | TLS: HTTP-only bootstrap block → `certbot certonly --webroot` first-issue → install `deploy/nginx.conf`; renewal deploy-hook that reloads nginx |
| 4 | Backup service: daily encrypted offsite copy of Postgres + the sealed-PDF archive, with a restore script and a restore-verification routine |
| 5 | `.env.example` covering all 15 variables (9 runtime + 6 `SEED_*`), plus a fail-closed seed gate |
| 6 | `deploy/README.md`: first-install order, update order, restore drill |

### Out of Scope

- Containerizing anything in production (see Approach).
- A CD job in `.github/workflows/ci.yml`. Adding an SSH deploy credential before the server has ever been provisioned once by hand multiplies failure surfaces; sequence it after the first successful deploy.
- Moving the six `SEED_*` variables into `configuracion.ts`'s Zod schema (see Decision 3).
- Purchasing the VPS or the domain, and the datacentre-location question — recorded in `DESIGN.md` §10 as Guillermo Seira's decision, not reopened here.
- Any change to `apps/web`, the domain layer, or the PDF pipeline.

## Capabilities

### New Capabilities

- `server-provisioning`: bringing a bare Ubuntu host to a state where the API can render a *correct* PDF — packages, Chromium libraries, fonts, swap, users, directories.
- `release-deployment`: getting a named version onto the server and into service, including migration/seed ordering and post-deploy health verification.
- `tls-termination`: certificate first-issue, renewal, and the nginx reload that makes renewal effective.
- `contract-archive-backup`: offsite, encrypted, restore-proven copies of the database and the sealed-PDF archive.
- `deployment-configuration`: the complete environment contract and the rule that an incomplete configuration fails the deploy instead of producing a silently unusable server.

### Modified Capabilities

None. `openspec/specs/` is currently empty.

## Approach

**Adopt exploration Approach 2** — a thin scripted provisioning/deploy layer over the existing `deploy/` artifacts. Approach 1 (manual runbook) leaves fonts, swap, and backups as tribal knowledge, which is precisely how the tofu-box failure ships. Approach 3 (containerize) is rejected on evidence, not taste: `DESIGN.md` §10 already closed systemd+nginx, `contratos-api.service` documents *why* `RestrictNamespaces`/`PrivateUsers` stay unset (Chromium's sandbox needs those namespaces), and a container runtime costs RAM on the one axis §10 identifies as constrained. Approach 2 is also the only one that leaves reviewed PR #35 work intact.

### Decisions this proposal closes

**1. Backup mechanism.** Daily, not weekly — §10's own arithmetic makes a 7-day window ~100 home re-visits and a 1-day window ~20. Scope: a `pg_dump` custom-format dump plus the sealed-PDF tree under `ALMACEN_DOCUMENTOS_RUTA`. **Order matters: dump the database first, then copy the PDFs.** The reverse order can produce a `contrato_documentos` row whose PDF is absent from the backup; this order can only produce an orphan PDF, which is harmless. Destination: an object store *outside HostGator* (§10: provider backup dies with the account), reached through a configured URL/credential so the provider stays a config value. Encrypted at rest — the payload is DNIs and signatures. Retention 30 daily copies. **Restore is proven mechanically, not asserted**: `contrato_documentos` stores `ruta` and a lowercase-hex `sha256` of each final PDF, so a restore drill restores into a scratch database and directory and asserts that every row's file exists and re-hashes to its stored `sha256`. A drill that skips that comparison has verified nothing.

**2. Postgres hosting: native `postgresql.service`.** `contratos-api.service` already declares `After=network-online.target postgresql.service`; under a containerized Postgres that unit name does not exist and the ordering silently becomes a no-op, so the API races the database at boot and `Restart=on-failure` masks it as a restart loop. A container runtime also adds a daemon to a 4 GB box already at ~1.9 GB. The parity that matters — PostgreSQL major version 17 and the six committed migrations — is preserved by apt-pinning 17 and running the same `prisma migrate deploy` CI already runs. Consequence to record explicitly: `docker-compose.yml` is dev-only and diverges from production by design.

**3. The `SEED_*` gap: in scope, narrowly.** Without `SEED_TECNICO_PASSWORD` the seed prints a warning and *exits 0* (`seedDatabase.ts` L278-285: "el flujo de firma es inalcanzable"). A deploy script that trusts that exit code reports success on a server where nobody can sign a contract — exactly the failure this change exists to prevent, and it lives in the deploy path. So: ship `.env.example` (all 15 vars) and make an omitted técnico account **fail the deploy**. Deferred: folding the six variables into `configuracion.ts`. That schema runs at API boot; the seed is a one-shot process. Merging them would force the API to require seed passwords to boot and the seed to require `JWT_SECRET` — coupling two lifecycles to fix a documentation problem.

**4. Migration and seed flow: stop → `migrate deploy` → seed → start.** Deliberately *not* `ExecStartPre=`, which would run migrations on every `Restart=on-failure` restart, hammering production during a crash loop and turning a failed migration into a permanently unstartable service. Migration is a deploy-time action, not a boot-time one. Stopping first avoids expand/contract discipline on a single instance; the cost is a short outage, acceptable at a handful of installations per day and mitigated by deploys being operator-initiated outside install hours. Seeding runs every deploy — it is idempotent by version-lookup and guarded against installing the provisional signatory under `NODE_ENV=production`.

**5. TLS: webroot ACME, made explicit.** `nginx.conf` already implies it (`/.well-known/acme-challenge/` → `/var/www/certbot`). The unencoded trap is ordering: the 443 block references `/etc/letsencrypt/live/<host>/*.pem`, so installing `deploy/nginx.conf` before a certificate exists makes nginx fail to start. First-issue is therefore: create `/var/www/certbot` → install an HTTP-only bootstrap block → `certbot certonly --webroot` → *then* install `deploy/nginx.conf` → `nginx -t` → reload. Renewal rides certbot's packaged systemd timer (verified in exploration), plus the missing piece: a `/etc/letsencrypt/renewal-hooks/deploy/` hook that reloads nginx, without which nginx serves the expired certificate from memory while the file on disk is fine.

**6. Chromium deps, fonts, swap: correctness, verified by rendering.** Installing `fonts-dejavu-core fonts-liberation` is not proof. Provisioning ends with a render smoke test that generates a document and extracts its text back, asserting `ñ` and accented characters survive — §10 asks for exactly this. Swap: a 2 GB file, created idempotently and persisted in `/etc/fstab`, as the safety net that justifies the unit's deliberate absence of `MemoryMax`. The acquisition mechanism for Chromium's shared libraries (Puppeteer's own installer versus an explicit apt list) must be confirmed against Puppeteer 25.4 documentation during design — this executor had no documentation-fetch tool and will not assert it from training data.

**7. Artifact delivery: git tag checkout, built on the server.** The API has no build step (`jiti src/main.ts`), so its "artifact" is the source tree — rsyncing it is a worse `git fetch` with no provenance. Building the web bundle on the box reuses the pnpm/Node toolchain the API already needs and avoids a `dist/` whose provenance is a laptop; §10's RAM breakdown already budgets for an install during deploy. Deploying a *tag* makes the running version nameable and rollback a re-deploy. Edge case to honor: a técnico with the PWA open mid-visit must not get a 404 for a hashed asset the old shell references, so new assets are published before `index.html` and `sw.js` are swapped, and stale assets are pruned on a later deploy.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `deploy/provision.sh` | New | Packages, Chromium libs, fonts, swap, user, directories |
| `deploy/deploy.sh` | New | Tag checkout, install, build, migrate, seed, restart, health check |
| `deploy/tls-bootstrap.sh`, `deploy/renewal-hook-nginx.sh` | New | First-issue and post-renewal reload |
| `deploy/backup.sh`, `deploy/restore.sh`, `deploy/verify-restore.sh` + timer units | New | Daily offsite copy, restore, hash-verified drill |
| `deploy/README.md` | New | Install order, update order, restore drill |
| `.env.example` | New | All 15 variables, derived from `configuracion.ts` + `prisma/seed.ts` |
| `apps/api/src/seed/*` | Modified | Fail-closed gate when the técnico account is omitted (test first) |
| `deploy/nginx.conf`, `deploy/contratos-api.service` | Modified (minimal) | Only placeholder resolution once the real host exists |
| `docker-compose.yml` | Unchanged | Documented as dev-only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scripts unvalidated until the VPS exists | **Certain** | Split verifiable from unverifiable criteria (below); `shellcheck` + `bash -n` + idempotency review pre-purchase |
| Font install succeeds, render still tofu | Med | Render smoke test extracting text is the gate, not the apt exit code |
| Backup runs but is unrestorable | Med | Drill compares restored files against `contrato_documentos.sha256`; an unverified drill fails |
| `prisma migrate deploy` has no down migration | Med | Deploy script takes a local pre-migration dump; rollback is restore + previous tag |
| Deploy interrupts a técnico mid-signature | Low | Operator-initiated deploys outside install hours; documented in `deploy/README.md` |
| Chromium library list drifts per Ubuntu release | Med | Confirm mechanism against Puppeteer 25.4 docs in design; smoke test catches regressions |
| Offsite credentials become a new secret on the box | Med | Write-only/append-scoped credential, `0600` root-owned, never in the repo |

## Rollback Plan

- **Repository**: each slice is an independent PR; `git revert` restores the previous state. Only the seed gate touches `apps/`.
- **Server, code**: re-run the deploy script against the previous tag.
- **Server, schema**: `migrate deploy` is one-directional, so a schema change that breaks the old code is not undone by checking out the old tag. Recovery is: restore the pre-migration dump the deploy script took, then deploy the previous tag. This is why the local pre-deploy dump belongs to the deploy slice, not the backup slice.
- **Server, TLS**: the bootstrap HTTP-only block remains on disk; reverting to it restores plain-HTTP reachability while a certificate problem is diagnosed.

## Dependencies

External sequencing dependencies — **not implementation tasks**:

1. **The VPS is not purchased** (`DESIGN.md` §10, opening line). HostGator VPS NVMe 4, 2 vCPU / 4 GB / 100 GB, root SSH. Blocks every server-side validation.
2. **Domain registered and DNS pointed.** `contratos.iesnet.com.ar` is a placeholder flagged as such in `nginx.conf`'s own header; an A/AAAA record must resolve to the VPS before certbot can issue.
3. **Offsite backup destination chosen and credentialed**, outside HostGator.
4. **`SEED_*` passwords chosen by the operator** (≥12 characters). The application deliberately invents none.
5. Datacentre location and regional HostGator entity: purchase-side, explicitly not resolved here.

## Success Criteria

**Verifiable before the VPS exists:**

- [ ] `.env.example` documents all 15 variables; a test asserts it against `configuracion.ts` and `prisma/seed.ts`
- [ ] Every script passes `shellcheck` and `bash -n`, and is idempotent by construction
- [ ] The seed fail-closed gate has a failing test written first (strict TDD) and runs in CI with no server
- [ ] The restore-verification routine is integration-tested against CI's existing Postgres 17 container
- [ ] `deploy/README.md` states install order, update order, and the restore drill

**Not verifiable until the VPS exists** — these gate "done", not "merged":

- [ ] `nginx -t` passes and `contratos-api.service` starts under real systemd
- [ ] certbot issues a real certificate; a forced renewal reloads nginx
- [ ] A contract renders on the real box with `ñ` and accents extracting back correctly
- [ ] A full restore drill on a scratch host reproduces every PDF at its stored `sha256`
- [ ] Peak RAM during a render stays within the §10 headroom with swap present

## Size forecast

Honest estimate is **~900–1300 changed lines**, against a 400-line review budget. Stating that rather than shrinking it: this repository comments deploy artifacts densely (`nginx.conf` is 187 lines for roughly 60 lines of directives), and the scripts inherit that standard. Natural slice boundaries, each independently reviewable and rollback-able:

| Slice | Content | Est. |
|-------|---------|------|
| **A** | `server-provisioning` + `deployment-configuration`: `.env.example`, provisioning script, fonts/Chromium/swap, render smoke test | ~400 |
| **B** | `release-deployment` + `tls-termination`: deploy script, migrate/seed order, seed fail-closed gate, TLS bootstrap + renewal hook, pre-migration dump | ~400 |
| **C** | `contract-archive-backup`: backup/restore/verify scripts, timer units, restore drill | ~400 |

Order A → B → C by dependency. **Constraint: C must ship before the first real customer contract is signed on the box.** Until it does, the system is running the exact failure `DESIGN.md` §10 calls non-negotiable.
