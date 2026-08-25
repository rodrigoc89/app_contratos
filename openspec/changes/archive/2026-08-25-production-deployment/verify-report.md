```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:65f725ddd4d6b57e8867438dd643fed098eea7ad0c560b2b78aa90923c30e0b1
verdict: fail
blockers: 0
critical_findings: 0
requirements: 10/20
scenarios: 20/30
test_command: pnpm -r test
test_exit_code: 0
test_output_hash: sha256:725c1b15eb39803e4066242fe568f534950d2280692aaf30ebedcc29f1ad6eec
build_command: pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:f1cca5a2b5f3468dccc2424f58a31078f054658bac0f68d4a25eb207ca421e8b
```

## Verification Report

**Change**: production-deployment
**Version**: N/A (5 new capabilities, no existing `openspec/specs/` to diff against)
**Mode**: Strict TDD

Verified against the actual merged state of `master` (`HEAD=13e18ad`, `git status` clean except orchestrator-owned `state.yaml`/`tasks.md` bookkeeping edits), not against `apply-progress.md`'s intermediate snapshot. Confirmed independently: `gh pr list --state open` returns zero results; `gh pr list --state merged` shows PR #78 and #80-#91 all merged, PR #90 is the tracker merge (`2582a19`) and PR #91 adds shellcheck-in-CI (`13e18ad`); `gh run list` shows CI green on both `2582a19` and `13e18ad`.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 73 |
| Tasks complete | 73 |
| Tasks incomplete | 0 |

Task 10.3 (open PR #8) and every other "open PR" close-out task were intentionally left for the orchestrator, not `sdd-apply` — consistent with `apply-progress.md`'s own convention, and moot now since `gh pr list` confirms all PRs are merged.

### Build & Tests Execution

**Build**: PASS
```text
$ pnpm typecheck   → exit 0 (deploy, packages/esquemas, apps/api, apps/web all "Done")
$ pnpm lint        → exit 0 (eslint . --max-warnings 0, no output)
```

**Tests**: PASS — 1543 passed / 0 failed / 0 skipped, across 4 commands
```text
$ pnpm -r test
  packages/esquemas: Test Files  5 passed (5)   Tests 125 passed (125)
  deploy test:        Test Files  9 passed (9)   Tests  63 passed (63)
  apps/api test:       Test Files 58 passed (58)  Tests 784 passed (784)
  apps/web test:       Test Files 72 passed (72)  Tests 571 passed (571)
  exit code: 0

$ pnpm --filter @contratos/api test:integration   (docker compose postgres already up, healthy)
  Test Files  13 passed (13)   Tests 144 passed (144)
  includes: verificarRender.integration.spec.ts (real Chromium render, fc-match/pdffonts/pdftotext all present:
    "[verificarRender] fc-match=true pdffonts=true pdftotext=true")
  includes: prisma/restauracion/verificarRestauracion.integration.spec.ts (6 tests, real Postgres 17)
  exit code: 0
  note: one transient "Chromium se quedó sin memoria" retry logged mid-run inside
  ContratosController.integration.spec.ts; the retry succeeded and the file still reports
  46/46 passed — flagged here as observed noise, not a failure, and not something sdd-verify
  should silently omit.

$ pnpm --filter @contratos/deploy test   (same 63 tests as the deploy slice of `pnpm -r test` above — one harness, not additional coverage)
  Test Files  9 passed (9)   Tests  63 passed (63)   exit code: 0

$ pnpm --filter @contratos/deploy lint:shell
  NOT RUN — shellcheck is not installed on this machine (`command -v shellcheck` exit 1),
  exactly as the launch context stated. Reported as unrun, not as a failure.
  Substitute evidence: CI's "Shellcheck the deploy scripts" job ran `pnpm --filter @contratos/deploy
  lint:shell` (the identical script) on both `2582a19` and `13e18ad` and both runs report
  conclusion "success" (`gh run list`). shellcheck itself is therefore proven green, just not
  by this machine.
```

Unit totals (125+63+784+571 = 1543) match the launch context's "last known-good local run" exactly. Integration total (144) also matches.

**Coverage**: Not available — no coverage tool is configured in `deploy/vitest.config.ts`, `apps/api/package.json`, or `apps/web/package.json`. Reported plainly, not treated as a failure (strict-tdd-verify.md: informational only).

### Spec Compliance Matrix

Legend: ✅ COMPLIANT (covering test passed), ⚠️ PARTIAL (test covers logic/plan only, spec text asked for more), ➖ UNVERIFIED-PRE-VPS (spec itself marks this "not verifiable before the VPS exists" — an honest gap, not a defect).

#### server-provisioning (4 requirements, 6 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Idempotent host setup | Static validation before a host exists | `provision.spec.ts` (8 tests) + `bash -n deploy/provision.sh` (exit 0, verified locally) + CI shellcheck (green on `2582a19`/`13e18ad`) | ✅ COMPLIANT |
| Idempotent host setup | Re-run on already-provisioned host | `provision.spec.ts:69` "skips every idempotent-guarded resource that is already provisioned" (dry-run simulation only) | ⚠️ PARTIAL — spec's own text says full proof needs a real host; dry-run/logic review is what pre-VPS allows, delivered exactly that |
| Correct Spanish-text font rendering | Package list review (pre-VPS) | `provision.sh:66-84` (fontconfig, fonts-dejavu-core, fonts-liberation) + `provision.spec.ts:117` "installs fontconfig explicitly..." | ✅ COMPLIANT |
| Correct Spanish-text font rendering | Render smoke test on the real host | none — spec marks this "not verifiable before the VPS exists" | ➖ UNVERIFIED-PRE-VPS (blocked on `vps-purchase`) |
| Chromium runtime libraries | Chromium launches without missing-library errors | none against `provision.sh`'s root `--install-deps` path — spec marks this host-only | ➖ UNVERIFIED-PRE-VPS (CI's integration job launches real Chromium successfully, but via the deploy-time `contratos`-user install command, not `provision.sh`'s root step; does not substitute for the real scenario) |
| Swap file | Idempotent swap creation | `provision.spec.ts:133` "does not accept a commented-out fstab line...", `:155` "reads the last fstab line even when the file has no trailing newline" | ✅ COMPLIANT |

#### release-deployment (5 requirements, 8 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Idempotent deploy script | Static validation before the VPS exists | `deploy.spec.ts` (9 tests) + `bash -n deploy/deploy.sh` (exit 0) + CI shellcheck green | ✅ COMPLIANT |
| Idempotent deploy script | End-to-end deploy on a real host | none — spec marks not verifiable before VPS | ➖ UNVERIFIED-PRE-VPS |
| Deploy-time migration, not boot-time | Unit file has no boot-time migration hook | `deploy/contratos-api.service` — confirmed no `ExecStartPre=` (grep, zero matches) | ✅ COMPLIANT |
| Deploy-time migration, not boot-time | Deploy script orders stop, migrate, seed, start | `deploy.sh:339-354` (`main()`: `do_stop → do_dump → do_checkout → do_install → do_migrate → do_seed → do_publish → do_start_and_verify`) + `deploy.spec.ts:96` plan-order test | ✅ COMPLIANT |
| Fail-closed técnico seed gate | Missing técnico password fails the seed | `seedDatabase.spec.ts` (part of the 784 apps/api unit tests) — production gate for `omitido` throws | ✅ COMPLIANT |
| Fail-closed técnico seed gate | Valid seed configuration still succeeds | `seedDatabase.spec.ts` — `already-present` regression guard never throws | ✅ COMPLIANT |
| Post-restart health verification | Health check fails after a bad deploy | none — spec marks not verifiable before VPS | ➖ UNVERIFIED-PRE-VPS (code path exists: `do_start_and_verify` with `/salud` retries + rollback recipe, `deploy.sh:295-316`, but the scenario itself needs a real bad deploy) |
| Asset-swap ordering | Publish order review | `publicar-assets.spec.ts` — additive copy → `index.html` → `sw.js` order test, passing | ✅ COMPLIANT |

#### tls-termination (3 requirements, 5 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Correct first-issue ordering | Script order review (pre-VPS) | `tls-bootstrap.spec.ts` — bootstrap conf + `nginx -t` before `certbot certonly`, full `nginx.conf` not referenced until after cert exists | ✅ COMPLIANT |
| Correct first-issue ordering | Real first-issue on the domain | none — spec marks not verifiable before VPS, blocked on `domain-dns` | ➖ UNVERIFIED-PRE-VPS |
| `nginx -t` as a hard gate | Config validation on a real host | none — spec marks not verifiable before VPS ("`nginx.conf` has never been run through `nginx -t`") | ➖ UNVERIFIED-PRE-VPS |
| Renewal reload hook | Hook script review (pre-VPS) | `renewal-hook-nginx.spec.ts` (2 tests) — hook calls `nginx -t && systemctl reload nginx` (mocked) + `bash -n` pass | ✅ COMPLIANT |
| Renewal reload hook | Forced renewal actually reloads nginx | none — spec marks not verifiable before VPS | ➖ UNVERIFIED-PRE-VPS |

#### contract-archive-backup (5 requirements, 7 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Database-before-PDFs backup ordering | Step order (pre-VPS, integration-tested) | `backup.spec.ts:153` "prints the backup plan with the pg_dump step strictly before the PDF-tree copy step" — **`--dry-run` plan-string assertion only** | ⚠️ PARTIAL — see Issues; spec.md's own scenario text says "run against CI's existing Postgres 17 container ... no VPS required," but no test invokes a real `pg_dump`/copy against CI's Postgres. Code order is real (`backup.sh:400-401`: `do_dump` then `do_copy_documents`, unconditional), just never executed end-to-end in a spec |
| Database-before-PDFs backup ordering | Row committed mid-backup produces only a harmless orphan | `apps/api/prisma/restauracion/verificarRestauracion.integration.spec.ts` — the dump-before-copy race fixture (task 8.2) reports `huerfanos` only, `faltantes` stays empty, real Postgres 17 | ✅ COMPLIANT (proven through the restore verifier's classification against a fixture that reproduces the race, not through a live `backup.sh` run) |
| Encryption at rest | Encrypt/decrypt round-trip | `encrypt-backup-archive.spec.ts` — real `gpg --recipient` round trip (byte-identical, and unreadable without the key), plus a mocked-`age`-on-PATH test proving tool preference | ✅ COMPLIANT (honest gap self-disclosed: `age` itself is not installed on this machine, so only the gpg fallback path is a real cryptographic proof here; both code paths are structurally tested) |
| 30-day retention | Prune beyond retention | `backup.spec.ts:209` "retains exactly the 30 most recent remote artifacts when 31+ are present" (`--prune-only` against a local stand-in for the remote) | ✅ COMPLIANT |
| Mechanically-proven restore | Successful restore drill | `verificarRestauracion.integration.spec.ts` — all-verified baseline, real Postgres 17 | ✅ COMPLIANT |
| Mechanically-proven restore | Corrupted restore is caught | `verificarRestauracion.integration.spec.ts` — `faltantes`/`desajustados` fixtures both force exit 1; `total === 0` also forces exit 1 | ✅ COMPLIANT |
| Credential hygiene | No credential in the repository | Repo-wide `git grep` for `AGE-SECRET-KEY-1`, `BEGIN PGP PRIVATE KEY BLOCK`, `BEGIN RSA PRIVATE KEY`, `rclone.conf` — one match, `deploy/README.md:651`, itself documentation describing the scan, not a secret | ✅ COMPLIANT (independently re-run, not just trusted from `apply-progress.md`) |

#### deployment-configuration (3 requirements, 4 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| `.env.example` completeness | Cross-check test | `apps/api/src/config/envExample.spec.ts` (part of the 784 apps/api unit tests, passing) | ✅ COMPLIANT — evidence is the passing test; `.env.example` itself was not opened directly, per the hard constraint on `.env*` files |
| `CONFIAR_EN_PROXY` documented for production | Doc content check | `envExample.spec.ts:118` "documents CONFIAR_EN_PROXY=true ... with the rate-limiter-collapse consequence stated" | ✅ COMPLIANT |
| Deploy aborts on missing required configuration | Static validation of the presence check | `deploy.sh:140-147` (`check_deploy_configuration`, `require_env_var DATABASE_URL`/`JWT_SECRET`) + `deploy.spec.ts` (3 missing-variable scenarios, named-error assertions) | ✅ COMPLIANT |
| Deploy aborts on missing required configuration | Real abort on a real host | none — spec marks not verifiable before VPS | ➖ UNVERIFIED-PRE-VPS |

**Compliance summary**: 20/30 scenarios COMPLIANT, 2/30 PARTIAL (both explained above, both self-disclosed in `apply-progress.md`), 8/30 UNVERIFIED-PRE-VPS (all explicitly named as such by the specs themselves, blocked on the three external dependencies — `vps-purchase`, `domain-dns`, `offsite-backup-destination` — not on any task in this repository).

### Correctness — the nine review-round defect fixes (static + test evidence)

| # | Fix | Evidence |
|---|---|---|
| 1 | `provision.sh` installs `fontconfig` explicitly; fstab guard parses first field of non-comment lines | `provision.sh:72` (package list), `:148-164` (`swap_entry_present`, comment-aware `case "$device" in '' \| '#'*) continue ;;`) — `provision.spec.ts:117,133,155` all pass |
| 2 | `renderVerdict.ts` `buildRenderVerdict` throws unless all three layers present exactly once; `evaluateFamilyResolution` fails when a requested family was never probed; `REQUESTED_FONT_FAMILIES` derived from both templates | `renderVerdict.ts:85-104` (missing/duplicated-layer throw), `:121-148` (`sinProbar` check) — `renderVerdict.spec.ts:46,56,109,125,236,246` all pass |
| 3 | `ci.yml` installs `fontconfig`/`poppler-utils`; `verificarRender.integration.spec.ts` requires all three tools when `CI=true` | `ci.yml:177-185`, `verificarRender.integration.spec.ts:70` (`process.env["CI"] === "true"`) — real run here confirmed `fc-match=true pdffonts=true pdftotext=true` |
| 4 | `deploy.sh` states `NODE_ENV=production` in `seed_command()` | `deploy.sh:259-260` (`printf "cd '%s/apps/api' && NODE_ENV=production pnpm prisma:seed"`) — `deploy.spec.ts:124` "seeds with NODE_ENV=production, without which every production gate in the seed is inert" |
| 5 | `publicar-assets.sh` refuses `RETENTION_COUNT` below 1 | `publicar-assets.sh:85-86` — `publicar-assets.spec.ts:219` "refuses a RETENTION_COUNT below 1, which would delete the release it just published" |
| 6 | `tls-bootstrap.sh` installs `certbot`; refuses a `CERTBOT_WEBROOT` disagreeing with `nginx-bootstrap.conf`'s ACME root | `tls-bootstrap.sh:165,188-190` (install), `:102-118` (`check_certbot_webroot_matches_bootstrap_conf`) — `tls-bootstrap.spec.ts:146` "refuses when \$CERTBOT_WEBROOT disagrees with the path the bootstrap conf serves" |
| 7 | `encrypt-backup-archive.sh`, `backup.sh`, `restore.sh` choose the tool from the configured recipient, not `$PATH` | `encrypt-backup-archive.sh:53-71` (`resolve_encryption_tool`, recipient checked before `command -v`), `backup.sh:126-131`, `restore.sh:162-182` — `encrypt-backup-archive.spec.ts:138,214`; `backup.spec.ts:403` "uses the encryption tool the operator configured, not whichever one is installed"; `restore.spec.ts:205` "picks the decryption tool from what the operator configured, not from what is installed" |
| 8 | `backup.sh` remote prune considers only `*.tar.enc` and refuses `RETENTION_REMOTE_COUNT` below 1; `restore.sh` refuses a non-empty document target | `backup.sh:302-306` (`sed -n '/\.tar\.enc$/p'`), `:159-160` (guard) — `backup.spec.ts:304,370`; `restore.sh:151-157` (`check_document_target_empty`) — `restore.spec.ts:173` |
| 9 | `contratos-backup.service` sets `GNUPGHOME` and `TimeoutStartSec`; `unidades-systemd.spec.ts` asserts both | `contratos-backup.service:59` (`Environment=GNUPGHOME=/etc/contratos/gnupg`), `:66,83` (`TimeoutStartSec=2h`, `ReadWritePaths` includes the GNUPGHOME dir) — `unidades-systemd.spec.ts:37` "tells gpg where its keyring is...", `:75` "bounds its own runtime..." |

All nine: every RED test named above traces to a real named `it(...)` block that currently passes; none is a tautology, an untriggered assertion, or a smoke-test-only check (checked directly by reading each file; zero `expect(true).toBe(true)`-class patterns found across the nine spec files).

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` (filesystem, Batches 1/5/6) + Engram obs #559 (canonical, Batches 1-8) both carry per-task RED/GREEN records |
| All tasks have tests | ✅ | 73/73 tasks; every GREEN task's claimed test file exists and is part of a passing suite |
| RED confirmed (tests exist) | ✅ | 9/9 spot-checked test files (the review-round defect fixes above) confirmed to contain the named `it(...)` blocks |
| GREEN confirmed (tests pass) | ✅ | 63/63 deploy tests, 784/784 apps/api unit tests, 144/144 apps/api integration tests all pass at HEAD |
| Triangulation adequate | ✅ | Every reviewed spec file triangulates present/fallback/missing or multiple guard scenarios (e.g. `renderVerdict.spec.ts` has 3 fixtures per layer: present, fallback, missing) |
| Safety Net for modified files | ✅ | `seedDatabase.ts` (the one application-code file this change modifies): `seedTecnico.spec.ts`/`seedAdministrador.spec.ts` confirmed still passing unmodified (task 4.5) |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 1543 | 144 | Vitest (all 4 workspaces) |
| Unit (shell, `execFile`) | 63 | 9 | Vitest `execFile`, no root/VPS (D8) |
| Integration | 144 | 13 | Vitest + real Postgres 17 (docker compose) + real Chromium |
| **Total** | **1687** | **157** | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in any workspace's `vitest.config.ts` or `package.json`.

### Assertion Quality
Scanned the 9 `deploy/*.spec.ts` files plus `renderVerdict.spec.ts`, `envExample.spec.ts`, `seedDatabase.spec.ts`, `verificarRestauracion.integration.spec.ts` for banned patterns (`expect(true).toBe(true)`, orphan empty-only checks, ghost loops, assertions with no production-code call, smoke-test-only `toBeInTheDocument`). Zero matches for tautology patterns (`git grep` across the set). These are shell/CLI/pure-function specs, not component tests, so the `render()`/`toBeInTheDocument()` smoke-test pattern does not apply here. Assertion-to-test ratios (`grep -c "expect("` per file) range 3-25 across the 9 deploy spec files, consistent with the multi-scenario triangulation each file's test names describe.

**Assertion quality**: ✅ All assertions verify real behavior (no tautologies, no untriggered-code-path patterns found in the sampled files)

### Quality Metrics
**Linter**: ✅ No errors (`eslint . --max-warnings 0`, exit 0)
**Type Checker**: ✅ No errors (`pnpm typecheck`, exit 0, all 4 workspaces)
**shellcheck**: ➖ Not available locally (confirmed `command -v shellcheck` exit 1) — substitute evidence: CI's shellcheck job green on `2582a19` and `13e18ad` (`gh run list`)

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 (Chromium: root installs libs, `contratos` installs browser) | ✅ Yes | `provision.sh` uses `--install-deps` into a scratch cache; deploy-time browser install is out of this change's file list per design (already existed) |
| D2 (three-layer render verdict) | ✅ Yes | `renderVerdict.ts` implements exactly the three labelled layers; verified real in CI integration job |
| D3 (seed gate lives in application, not deploy script) | ✅ Yes | `seedDatabase.ts` throws; `deploy.sh` keeps only a cheap preflight, never the guarantee |
| D4 (asset publish: additive → index.html → sw.js) | ✅ Yes, with one recorded deviation | Implemented via copy-to-temp-then-rename-within-target-directory rather than a literal cross-directory `mv` — same atomicity guarantee, more robust to a future `BUILD_DIR`/`WEB_ROOT` filesystem split; deviation explicitly recorded in `apply-progress.md` |
| D5 (deploy: stop first, migrate at deploy time) | ✅ Yes | `deploy.sh:339-354` order matches exactly; no `ExecStartPre=` |
| D6 (TLS bootstrap: HTTP-only block first) | ✅ Yes | `tls-bootstrap.sh` sequence matches; `nginx -t` gate with symlink-repoint-on-failure |
| D7 (backup: DB before PDFs, restore proven by hash) | ✅ Yes, with the ordering-scenario caveat above | Code order correct; the specific "integration-tested against CI's Postgres" scenario for `backup.sh` itself landed as dry-run only — see Issues |
| D8 (`deploy` workspace test harness) | ✅ Yes | `deploy/package.json`, `pnpm-workspace.yaml` entry, Vitest `execFile` specs across all 9 scripts |
| design.md open questions | ⚠️ Stale, not incorrect | Two of three open questions (`age` availability, exact font family) were resolved during implementation (Batches 2 and 7) but `design.md`'s own checkboxes were never updated to reflect that — a documentation-drift note, not a functional gap. Not fixed here: verify does not edit `design.md` |

### Issues Found

**CRITICAL**: None — zero implementation defects, zero failing tests, zero unmerged PRs.

**WARNING**:
1. `contract-archive-backup` / "Database-before-PDFs backup ordering" — the spec's "Step order (pre-VPS, integration-tested)" scenario text explicitly asks for a run "against CI's existing Postgres 17 container plus a scratch PDF directory," but the actual delivered test (`backup.spec.ts:153`) only asserts the printed `--dry-run` plan string order. No test invokes a real `pg_dump`/copy sequence against a live database, for `backup.sh` specifically (unlike `deploy.sh`'s migration ordering, which the release-deployment spec correctly scopes to "already exercised in CI's integration job" via `prisma migrate deploy` itself, not via `deploy.sh`). This is self-disclosed in `apply-progress.md` Batch 7 ("What this PR cannot prove") and is a real, low-risk gap — `pg_dump` was not installed on the apply-time development machine, and the code path itself (`backup.sh:400-401`, unconditional `do_dump` then `do_copy_documents`) is simple enough that dry-run-plus-source-review is a reasonable substitute, but it does not meet the letter of the spec scenario as written.
2. `server-provisioning` / "Idempotent host setup" — the "Re-run on an already-provisioned host" scenario is covered only by `provision.spec.ts:69`'s dry-run simulation of a second run; the spec's own text already flags that full proof needs a real host, so this is the mildest of the two WARNINGs (the spec explicitly anticipated it), but it still keeps the scenario from being fully COMPLIANT rather than partially so.

**SUGGESTION**:
1. `design.md`'s two remaining open-question checkboxes (`age` availability, exact font family) were resolved in the implementation (Batches 2 and 7) but never checked off in `design.md` itself — worth a follow-up edit outside this verify run.
2. `design.md`'s "37-package" Puppeteer troubleshooting-list figure was corrected to 36 in `deploy/README.md` (verified against Puppeteer's own docs via context7 at apply time) but `design.md`/`tasks.md` still say "37" — cosmetic, already flagged by `apply-progress.md` itself as out of scope for `apply`.
3. `apps/api`'s integration suite logged one transient "Chromium se quedó sin memoria" retry during this run (`ContratosController.integration.spec.ts`); the retry succeeded and the file reports 46/46 passed, but a memory-pressure retry on this development machine is worth a note for whoever provisions the real VPS's RAM headroom (proposal Risk table already tracks "Peak RAM during a render stays within the §10 headroom" as not verifiable before the VPS exists).

### Verdict
**FAIL — spec-completion gate, not an implementation defect**

This FAIL is about scenario coverage, not code quality: **zero CRITICAL findings**, all 73 tasks complete and merged to `master` (`HEAD=13e18ad`, confirmed via `gh pr list`/`gh run list`, not just trusted from `apply-progress.md`), all nine review-round defect fixes present with passing named tests, and the entire test matrix green (typecheck, lint, 1543 unit tests across 4 workspaces, 144 integration tests, 63 deploy-harness tests, 0 failures).

The gentle-ai verify-report contract admits `pass`/`pass_with_warnings` only when `requirements`/`scenarios` show 100% completion (verified empirically: `gentle-ai sdd-verify-validate` rejects any completed-below-total ratio for a passing verdict, and accepts it only for `fail`). This change's honest ratio is **20/30 scenarios, 10/20 requirements** — because:

- **8/30 scenarios are structurally impossible to verify before the VPS exists** (`server-provisioning` ×2, `release-deployment` ×2, `tls-termination` ×3, `deployment-configuration` ×1), exactly as each spec scenario's own title says ("not verifiable before/until the VPS exists"), blocked on the three external dependencies (`vps-purchase`, `domain-dns`, `offsite-backup-destination`) `state.yaml` already tracks. This is the proposal's own designed two-tier verification model (Success Criteria: "Not verifiable until the VPS exists — these gate 'done', not 'merged'"), not a defect in this change.
- **2/30 scenarios are genuine, low-risk partial gaps** (both WARNINGs above) — real but minor, and both self-disclosed by `apply-progress.md` at apply time rather than discovered fresh here.

Per `references/report-format.md`: "A canonical failure with blocker, critical, command-exit, or incomplete evidence is valid and persistable but not archive-ready." Recommend **not** running `sdd-archive` yet. There is no CRITICAL work for `sdd-apply` either — the delivered code is correct and complete for everything provable today. The two WARNING gaps are small, optional follow-up (a real `pg_dump`-backed integration test for `backup.sh`'s ordering; nothing further for the re-provisioning scenario, which is already at the limit of what pre-VPS testing can prove). The 8 UNVERIFIED-PRE-VPS scenarios close only when the VPS is purchased, DNS is pointed, and the offsite destination is credentialed — at which point a **new** `sdd-verify` pass against the real host (not a new `sdd-apply` batch) is what finishes this change.
