# Tasks: Production deployment to a HostGator VPS

**Partition history.** Pass 1 produced 3 chained PRs (A/B/C, 58 tasks) and
forecast `400-line budget risk: High`. The user chose to split further
rather than thin any test. Pass 2 produced 6 chained PRs (67 tasks),
applying the one seam explicitly identified in Slice B (phases 4-5 vs. 6)
symmetrically to A and C, and naming — without applying — three further
seams inside what was then PR3. **Pass 3 (this document)** applies two of
those three named seams inside the old PR3, on explicit orchestrator
correction: "roughly 6" was the orchestrator's own approximation of the
user's actual bar, not the user's target. The user's actual instruction was
to split finely enough that every PR is genuinely reviewable against the
400-line budget while keeping every test intact. This document is now **8
chained PRs, 73 tasks**. No task's content, RED/GREEN pairing, or ordering
changed across any pass — only the PR grouping changed, plus the
mechanically-required close-out tasks each new PR boundary needs.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (pass 1, 3-slice) | A ~700-850, B ~1000-1250, C ~950-1100 — total ~2650-3200 |
| Estimated changed lines (pass 2, 6-slice) | PR1 ~450-560, PR2 ~330-410, PR3(old) ~950-1150, PR4(old) ~420-520, PR5(old) ~430-530, PR6(old) ~680-820 — total ~3260-3990 |
| Estimated changed lines (pass 3, this 8-slice partition) | PR1 ~450-560, PR2 ~330-410, PR3 ~190-220, PR4 ~630-750, PR5 ~365-455, PR6 ~420-520, PR7 ~430-530, PR8 ~680-820 — total ~3495-4265 |
| 400-line budget risk | PR1 Medium-High, PR2 Low, PR3 Low, PR4 **High** (atomic, stays over by design), PR5 Low-Medium, PR6 Medium, PR7 Medium, PR8 **High** (atomic, stays over by design) — overall still High |
| Chained PRs recommended | Yes |
| Chain strategy | feature-branch-chain (fixed by design.md's Rollout; PR #1 targets the tracker branch, each later PR targets the immediate previous PR's branch, only the tracker merges to `master` — not reopened by this pass) |
| Decision needed before apply | **No.** The orchestrator directed exactly which named seams to apply (both seams inside old PR3) and which to leave named-but-unapplied (old PR5's retention-pruning seam; no seam was found or invented for old PR6). |
| Go-live gate | **PR7 and PR8 together** (see "Hard sequencing constraint") |

**Why the total rose again, and why that is expected, not scope creep.**
Splitting one PR into three adds two more close-out packages (a focused
`pnpm test`/`typecheck`/`lint` run, a `deploy/README.md` subsection, and a
PR-open with evidence — roughly 80-110 lines each). That is the entire
delta: ~3260-3990 → ~3495-4265 is the previous total plus two close-out
packages, nothing else. No estimate for any implementation task (`.env.example`,
any `.sh` script, any `.ts` module, any spec) was re-derived in this pass.

## Re-slicing notes (read before Phase 1)

1. **Task 8.2 moves from Phase 8 into Phase 9.** Unchanged from pass 2, and
   explicitly preserved by orchestrator instruction in pass 3. Its RED
   assertion targets `apps/api/prisma/restauracion/verificarRestauracion.integration.spec.ts`
   — the exact same not-yet-created file that task 9.3 also RED-tests, both
   satisfied by the **single** GREEN task 9.4. 8.2 sits in Phase 9,
   immediately before 9.3, with a pointer left at its original Phase 8
   position. This is an atomic-unit constraint the phases-4-5-vs-6 seam in
   Slice B never had to deal with, which is why that seam split cleanly and
   this one needed a relocation instead of a straight cut.
2. **Task 4.1's line citation is corrected**, unchanged from pass 2: "lines
   126-133" → orchestrator-verified **"lines 122-133"** — the only
   production `throw` in `seedDatabase.ts` today, guarding the
   provisional-signature case.
3. **Two seams named-but-unapplied in pass 2 are APPLIED in this pass:**
   - **Seed gate (Phase 4) vs. deploy+publish (Phase 5)** — now separate
     PRs (PR3 and PR4/PR5). Pass 2's own task 7.3 had already flagged the
     seed-gate change as "live application code, distinct in risk from the
     deploy scripts"; that observation is the justification, not a line
     count.
   - **`deploy.sh` (now PR4, tasks 5.1-5.5) vs. `publicar-assets.sh`
     (now PR5, tasks 5.6-5.10)** — no RED/GREEN cross-coupling: `deploy.sh`'s
     dry-run plan names "publish" as a step **string**, but that assertion
     never requires `publicar-assets.sh` to exist. Tasks 5.9 (static
     verification) and 5.10 (no-proof-pre-VPS notes) cover *both* scripts in
     their original text and are placed wholesale in PR5 — the point in the
     stack where both scripts already exist — rather than split into halves,
     so neither task's content changed.

   These were not applied in pass 2 because the orchestrator's "roughly 6"
   was its own approximation of the user's bar, mistakenly treated as the
   user's actual target; the user's real bar was "genuinely reviewable
   against 400 while keeping every test intact," which these two seams
   satisfy for PR3 and PR5 (PR4 stays over, honestly, as an atomic unit —
   see below).

4. **`deploy.sh` (PR4, ~630-750 including its close-out) stays over budget
   on purpose.** It is one atomic 4-RED/1-GREEN unit: tasks 5.1-5.4 (order
   plan, git-repository-selection threat, commit-state threat, env-var
   preflight) are four RED specs against the **single** GREEN in 5.5 — one
   script satisfies all four at once. Splitting it further would separate a
   RED test from the GREEN that satisfies it. Left over, and said so, per
   orchestrator instruction, rather than forced under 400.
5. **One seam remains named-but-unapplied, unchanged from pass 2:** inside
   **PR7** (was PR5/old Slice C1), dump+encrypt+push (8.1, 8.3, 8.4 — one
   atomic RED×2/GREEN×1 cluster) vs. retention pruning (8.5, 8.6 — a
   separate RED/GREEN pair added on top of the already-created `backup.sh`).
   PR7 is only ~430-530, barely over budget; splitting it buys little review
   relief and adds another sequential link to an already 8-long chain. Kept
   named, not applied, by explicit orchestrator instruction.
6. **No atomicity-safe seam was identified inside PR8** (Phase 9 + Phase 10:
   restore.sh, the shared hash-verifier cluster, timer units, and the
   go-live gate documentation). It stays a single ~680-820 line PR. No seam
   is invented here to force it under budget.

## Hard sequencing constraint — go-live gate

**PR7 (backup ordering & encryption) and PR8 (restore, hash verification,
timer, and the go-live gate documentation) together must be merged, deployed
to the VPS, and pass one real backup-then-restore drill before the first
real customer *comodato* is signed on that server.** Comodato PDFs are
legally-binding documents; until both PR7 and PR8 land there is no offsite
copy of anything signed on the box, and the offsite copy that PR7 alone
produces is unproven until PR8's hash verifier confirms a restore actually
reconstructs it. Task 10.4 records this explicitly in `deploy/README.md`,
not as an implied consequence of PR ordering.

## Chain diagram

```
master
  └─ tracker branch (draft, no-merge)
       └─ PR1 (A1: env + provisioning)
            └─ PR2 (A2: render verdict)
                 └─ PR3 (seed fail-closed gate — D3, app code)
                      └─ PR4 (deploy sequence — D5, deploy.sh)        ← atomic, ~630-750
                           └─ PR5 (asset publish — D4, publicar-assets.sh)
                                └─ PR6 (TLS bootstrap — D6)
                                     └─ PR7 (backup — D7)              ─┐ go-live gate
                                          └─ PR8 (restore + verify)    ─┘ (PR7 + PR8)  ← atomic, ~680-820

Only the tracker merges to master, and only after PR8 is integrated.
Each PR body created at apply time marks its own position with 📍
per the chained-pr skill's per-PR requirement.
```

### Suggested Work Units

| PR | Contents (tasks) | Base branch | Est. lines | Independently proves |
|----|-------------------|-------------|-----------|----------------------|
| PR1 | 1.1-1.6, 1B.1-1B.3 | tracker (draft, no-merge) | ~450-560 | Every config key the app or seed reads is documented in `.env.example`, and the host can be provisioned idempotently (packages, PostgreSQL 17, Chromium+fonts, swap, service user) — proven in CI via `execFile --dry-run`, no VPS needed |
| PR2 | 2.1-2.5, 2B.1-2B.3 | PR1's branch | ~330-410 | The rendered PDF carries the right font, embeds real glyphs, and round-trips the right codepoints — not a tofu fallback — proven by a real Puppeteer render in the CI integration job plus a unit-tested three-layer verdict parser |
| PR3 | 4.1-4.5, 4B.1-4B.3 | PR2's branch | ~190-220 | The application itself refuses to boot in production when a seed account resolves to a placeholder credential (fail-closed, never fail-silent), and never regresses on a routine redeploy where accounts are already present |
| PR4 | 5.1-5.5, 5B.1-5B.3 | PR3's branch | ~630-750 | `deploy.sh` performs the D5 sequence safely — right order, refuses on the wrong repo, refuses on a dirty worktree, refuses on missing config — before it ever stops the live service. One atomic 4-RED/1-GREEN unit; stays over budget by design |
| PR5 | 5.6-5.10, 5D.1-5D.3 | PR4's branch | ~365-455 | Asset publish is additive, then swaps `index.html`, then `sw.js`, in that order, and prunes release manifests to the 2-newest policy — independently testable from `deploy.sh` via its own `--dry-run` plan |
| PR6 | 6.1-6.7, 6B.1-6B.3 | PR5's branch | ~420-520 | TLS bootstraps on a fresh host without the chicken-and-egg nginx failure the literal `nginx.conf` would cause, and a forced renewal reloads nginx instead of leaving an expired certificate served from memory |
| PR7 | 8.1, 8.3-8.7, 8B.1-8B.3 | PR6's branch | ~430-530 | Every backup dumps the database before copying PDFs — a race can only orphan a PDF, never lose a row — encrypts so the VPS itself never holds a working decryption key, and prunes to the retention policy |
| PR8 | 9.1-9.2, 8.2 (relocated), 9.3-9.8, 10.1-10.4 | PR7's branch | ~680-820 | A restore actually reconstructs a byte-identical, complete set of documents — proven by hash comparison against a deliberately corrupted fixture, not merely "the restore command exited 0" — and the go-live gate is recorded as blocking prose |

| PR | Focused test command | Runtime harness | Rollback boundary |
|----|----------------------|------------------|--------------------|
| PR1 | `pnpm --filter @contratos/api test`, `pnpm --filter @contratos/deploy test` | `deploy/provision.sh --dry-run` under Vitest `execFile` (temp dir, no VPS) — this dry-run spec **is** the runtime harness; real package install, Chromium, fonts, and swap remain unverifiable pre-VPS (1.6 covers syntax only) | `git revert` PR1's branch — nothing downstream depends on these files yet |
| PR2 | `pnpm --filter @contratos/api test` | `pnpm --filter @contratos/api test:integration` — real render probe through `GeneradorDeDocumentosPuppeteer`, Chromium present in CI; real host fonts remain unverifiable pre-VPS | `git revert` PR2's branch — render verdict is consumed only by the post-deploy manual checklist, nothing automated depends on it |
| PR3 | `pnpm --filter @contratos/api test` | `seedDatabase.spec.ts` exercises the fail-closed gate directly, no server needed | `git revert` PR3's branch; if a production deploy already ran with the seed gate live, the documented recovery is `pnpm --filter @contratos/api prisma:seed` by hand, not a code rollback |
| PR4 | `pnpm --filter @contratos/deploy test` | `deploy/deploy.sh --dry-run` under Vitest `execFile` against a fabricated temp git repo (real dry-run, no VPS) | `git revert` PR4's branch — nothing invokes `deploy.sh` in production yet pre-VPS |
| PR5 | `pnpm --filter @contratos/deploy test` | `deploy/publicar-assets.sh --dry-run` under Vitest `execFile` (real dry-run, no VPS); `shellcheck`+`bash -n` now cover both `deploy.sh` and `publicar-assets.sh` (5.9) | `git revert` PR5's branch — nothing downstream depends on these files yet |
| PR6 | `pnpm --filter @contratos/deploy test` | `deploy/tls-bootstrap.spec.ts` `execFile --dry-run` plans (real, no VPS); `nginx -t`/certbot/systemd start are N/A pre-VPS, tracked in 6.7/README | `git revert` PR6's branch; if TLS already bootstrapped on the host, also manually repoint the nginx symlink to the bootstrap conf (the script itself does this on `nginx -t` failure; a git-revert after a *successful* bootstrap needs the same manual step) |
| PR7 | `pnpm --filter @contratos/deploy test` | `deploy/backup.spec.ts` `execFile --dry-run` plan (real, no VPS); encrypt/decrypt round-trip runs for real against a local fixture, no network | `git revert` PR7's branch — nothing schedules `backup.sh` yet (the timer lands in PR8), so rollback is git-only |
| PR8 | `pnpm --filter @contratos/api test`, `pnpm --filter @contratos/deploy test` | `pnpm --filter @contratos/api test:integration` — restore verifier vs. CI's Postgres 17 + a deliberately corrupted fixture, real; `systemd-analyze verify` on the timer units, real, no root/VPS; full offsite drill is N/A pre-VPS, blocked on `offsite-backup-destination` (9.8) | `git revert` PR8's branch; if `contratos-backup.timer` is already enabled on the host, also `systemctl disable --now contratos-backup.timer` there — rollback is not git-only once deployed |

---

## Phase 1 — PR1: env contract & provisioning foundation

- [x] 1.1 RED: `apps/api/src/config/envExample.spec.ts` asserts every key in `EsquemaConfiguracion` (9 vars) plus the 6 `SEED_*` vars read in `prisma/seed.ts` appears in `.env.example`, and no extra keys exist there. Must fail — `.env.example` does not exist yet. **Deviation, recorded at apply time:** `.env.example` already existed (tracked since `6a7cad3`, 2026-08-07, an ancestor of this branch) — the "does not exist yet" premise was factually wrong for this repo. RED instead failed on the real gap: `ALMACEN_DOCUMENTOS_RUTA` and the 3 `SEED_TECNICO_*` vars were undocumented, and `CONFIAR_EN_PROXY=true` was not yet stated for production. See apply-progress for full evidence.
- [x] 1.2 GREEN: **modified** (not created) the existing `.env.example` with the missing vars, provenance comments, and `CONFIAR_EN_PROXY=true` documented for production with the rate-limiter-collapse consequence (127.0.0.1) stated. Existing content (base de datos, servidor, autenticación, semilla/admin sections) preserved verbatim.
- [x] 1.3 Add the `deploy` workspace: `deploy` entry in `pnpm-workspace.yaml`, `deploy/package.json` (`@contratos/deploy`, private, Vitest devDependency).
- [x] 1.4 RED: `deploy/provision.spec.ts` — `execFile("deploy/provision.sh", ["--dry-run"])` in a temp dir asserts the idempotent-guard plan (skip-if-exists messages for user/dirs/swap/exclude). Must fail — script does not exist. Confirmed: `ENOENT — spawn .../provision.sh`.
- [x] 1.5 GREEN: create `deploy/provision.sh` — apt packages, PostgreSQL 17 pin, Chromium libs via `npx puppeteer@25.4.0 browsers install chrome --install-deps` into a scratch `PUPPETEER_CACHE_DIR` (D1), `fonts-dejavu-core fonts-liberation` + `fc-cache -f -v`, 2 GB swapfile + `/etc/fstab` entry, `contratos` user/dirs/perms, `.cache/` appended to `/opt/contratos/.git/info/exclude`.
- [x] 1.6 Static verification (no VPS needed): `shellcheck deploy/provision.sh` and `bash -n deploy/provision.sh` — record pass/fail in the PR. `bash -n`: **pass**, no syntax errors. `shellcheck`: **not installed** on this machine (`command -v shellcheck` found nothing) — reported plainly, not silently skipped, no system package installed.

## Phase 1B — PR1 close out

- [x] 1B.1 `deploy/README.md`: install order (`provision.sh` → `deploy.sh` → `tls-bootstrap.sh`), the apt fallback list (audit/offline reference only, per D1's rejected-primary-mechanism decision — verified against Puppeteer's current troubleshooting docs via context7: **36 packages**, not the planning docs' approximate "37"), and cross-reference where the two still-open items resolve (`age` availability in PR7/8.3; the restore drill in PR8/9.8).
- [x] 1B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the PR1 diff; record results. All three green — see apply-progress for full output.
- [x] 1B.3 Open PR #1 targeting the tracker/feature branch (feature-branch-chain, draft/no-merge tracker). Evidence: focused test command output, `provision.sh --dry-run` result, rollback boundary from the Work Units table. **Excluded from this apply run by explicit instruction — not authorized to publish.**

## Phase 2 — PR2: render verdict (D2)

- [x] 2.1 RED: `apps/api/scripts/renderVerdict.spec.ts` — fixtures for `fc-match`/`pdffonts`/`pdftotext` stdout (present/fallback/missing per layer) assert the parser returns pass/fail + reason per layer. Must fail — module does not exist.
- [x] 2.2 GREEN: create `apps/api/scripts/renderVerdict.ts` (pure parser, three layers: family resolution, glyph embedding, text round-trip) and `apps/api/scripts/verificarRender.ts` (jiti driver: renders a probe doc via `GeneradorDeDocumentosPuppeteer`, runs the three tools, feeds stdout to the parser).
- [x] 2.3 Read the contract template's CSS to record the exact font family requested (open question) and hardcode it as the `fc-match` argument in `verificarRender.ts`, with a comment naming the source line.
- [x] 2.4 Add `verify:render` script to `apps/api/package.json`.
- [x] 2.5 Exercise the real render + verdict in the existing `integration` job (`pnpm --filter @contratos/api test:integration`, Chromium present in CI). Real host fonts remain unverifiable pre-VPS — note this explicitly, do not claim otherwise.

## Phase 2B — PR2 close out

- [x] 2B.1 `deploy/README.md`: render verdict section — the three-layer check (family resolution, glyph embedding, text round-trip), the hardcoded font family from 2.3 with its source comment, and the explicit caveat that real host fonts remain unverifiable pre-VPS (2.5).
- [x] 2B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1+PR2 diff; record results.
- [x] 2B.3 Open PR #2 targeting PR #1's branch (feature-branch-chain). Evidence: focused test command output, `verify:render` integration result (real render probe, Chromium present in CI), rollback boundary from the Work Units table.

## Phase 4 — PR3: seed fail-closed gate (D3)

*Live application code, distinct in risk from the deploy/publish infra scripts in PR4/PR5 — the seam this PR applies.*

- [x] 4.1 RED: `apps/api/src/seed/seedDatabase.spec.ts` — new case: `nodeEnv: "production"` with `tecnico` input resolving `action: "omitido"` (no `SEED_TECNICO_PASSWORD`) makes `seedDatabase` throw a named error. Must fail today — the function only throws for the provisional-signature case (**lines 122-133**, orchestrator-verified — the only production `throw` in the file today); the `omitido` path returns silently.
- [x] 4.2 RED: same file, same pattern, for `administrador` resolving `omitido` in production. Must fail for the same reason.
- [x] 4.3 RED: same file — `nodeEnv: "production"` with either account resolving `already-present` does NOT throw. This is the load-bearing regression guard design D3 calls out: without it, every redeploy fails once passwords are rotated out of the env file. Must currently pass trivially (no throw exists at all yet) but must stay green after 4.4.
- [x] 4.4 GREEN: modify `apps/api/src/seed/seedDatabase.ts` — after computing `administrador`/`tecnico` results, when `nodeEnv === "production"` and either resolves `"omitido"`, throw an `Error` naming the missing account and its env var (`SEED_ADMIN_PASSWORD` / `SEED_TECNICO_PASSWORD`), mirroring the existing provisional-signature guard's message style.
- [x] 4.5 Confirm `apps/api/src/seed/seedTecnico.spec.ts` and `seedAdministrador.spec.ts` still pass unmodified (they exercise `sembrarCuenta` directly, not the new gate).

## Phase 4B — PR3 close out

- [x] 4B.1 `deploy/README.md`: seed-gate section — the fail-closed guarantee, and why `already-present` never throwing is load-bearing for routine redeploys.
- [x] 4B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1+PR2+PR3 diff; record results.
- [x] 4B.3 Open PR #3 targeting PR #2's branch (feature-branch-chain). Evidence per Work Units table; call out explicitly that this PR is live application code (auth/seed path), distinct in risk from the deploy scripts that follow in PR4/PR5.

## Phase 5 — PR4: deploy sequence (D5)

*One atomic 4-RED/1-GREEN unit — tasks 5.1-5.4 are four RED specs against the single GREEN in 5.5. Cannot be split further without separating a RED test from the GREEN that satisfies it. Stays over the 400-line budget (~630-750 including close-out) by design — see Re-slicing note 4.*

- [x] 5.1 RED: `deploy/deploy.spec.ts` — `execFile("deploy/deploy.sh", ["--dry-run"])` asserts the printed plan lists stop → dump → checkout → install → migrate → seed → publish → start in that literal order. Must fail — script does not exist.
- [x] 5.2 RED (threat matrix — git repository selection, **Applicable**): `execFile` against a temp git repo at a path other than `$APP_DIR` asserts non-zero exit with a named error ("must run against `$APP_DIR`, not cwd"). Must fail — script does not exist.
- [x] 5.3 RED (threat matrix — commit state, **Applicable**): a temp worktree with `git status --porcelain` non-empty asserts `deploy.sh` refuses (non-zero exit) and never invokes `--force` or `reset --hard`. Must fail — script does not exist.
- [x] 5.4 RED (deployment-configuration spec): a temp env file missing `DATABASE_URL` (or `JWT_SECRET`, or a seed password when seeding) asserts `deploy.sh` aborts before stopping the service, naming the missing variable. Must fail — script does not exist.
- [x] 5.5 GREEN: create `deploy/deploy.sh` implementing D5 — always `git -C "$APP_DIR"`, `rev-parse --show-toplevel` + remote check, `git status --porcelain` guard, env-var preflight, `pg_dump -Fc` before checkout, `pnpm install --frozen-lockfile` + puppeteer install + build as `contratos`, `prisma migrate deploy`, `prisma:seed`, asset publish call, restart, `GET /salud` retries, rollback recipe on failure, `--dry-run`.

## Phase 5B — PR4 close out

- [x] 5B.1 `deploy/README.md`: deploy sequence section (`deploy.sh`'s stop→dump→...→start order, the two threat-matrix guards, the env-var preflight), and the `CONFIAR_EN_PROXY` production note cross-linked from 1.2.
- [x] 5B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1+PR2+PR3+PR4 diff; record results.
- [x] 5B.3 Open PR #4 targeting PR #3's branch (feature-branch-chain). Evidence per Work Units table; note explicitly that this PR is one atomic 4-RED/1-GREEN unit and is over the 400-line budget by design (Re-slicing note 4) — not an oversight.

## Phase 5C — PR5: asset publish (D4)

*Independently testable from `deploy.sh` (PR4) — no RED/GREEN cross-coupling. Tasks 5.9 and 5.10 (unchanged content, covering both `deploy.sh` and `publicar-assets.sh`) sit here because both scripts already exist at this point in the stack.*

- [x] 5.6 RED: `deploy/publicar-assets.spec.ts` — `--dry-run` plan asserts additive asset copy, then `mv index.html`, then `mv sw.js`, in that order. Must fail — script does not exist. Confirmed: `spawn .../deploy/publicar-assets.sh ENOENT`.
- [x] 5.7 RED: same file — 3+ dated `.releases/*.files` manifests assert exactly the 2 newest are retained, older pruned. Must fail — script does not exist. Confirmed: `spawn .../deploy/publicar-assets.sh ENOENT`.
- [x] 5.8 GREEN: create `deploy/publicar-assets.sh` implementing D4 — additive copy, atomic `index.html`/`sw.js` swap, manifest write, 2-newest retention prune.
- [x] 5.9 Static verification: `shellcheck` + `bash -n` on `deploy.sh` and `publicar-assets.sh`. `bash -n`: **pass** on both. `shellcheck`: **not installed** on this machine (`command -v shellcheck` exit 1) — reported plainly, no system package installed, same gap PR1/PR4 already declared.
- [x] 5.10 No proof available pre-VPS: real vN→vN+1 deploy, post-restart `/salud` failure path, asset-swap ordering under live traffic. Added to `deploy/README.md`'s post-VPS checklist and its "What this PR cannot prove yet" section. Also recorded, unresolved and named (not fixed here): the API restart still drops an in-flight `POST /contratos/:id/firmar` — a drain needs a second instance a 4 GB box cannot host; mitigation stays operator scheduling.

## Phase 5D — PR5 close out

- [x] 5D.1 `deploy/README.md`: asset publish section (`publicar-assets.sh`'s additive-then-atomic-swap order, why `sw.js` publishes last — the poisoned-precache mechanism, not just the rule — and the 2-release retention policy).
- [x] 5D.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1-PR5 diff; record results. All three green — see apply-progress for full output.
- [ ] 5D.3 Open PR #5 targeting PR #4's branch (feature-branch-chain). **Excluded from this apply run — the orchestrator opens the PR, not `sdd-apply`.**

## Phase 6 — PR6: TLS bootstrap (D6)

- [ ] 6.1 Modify `deploy/nginx.conf`: replace the literal `contratos.iesnet.com.ar` (`server_name`, `ssl_certificate`/`ssl_certificate_key` paths) and `/var/www/contratos` (`root`) with placeholder tokens (e.g. `__CONTRATOS_HOST__`, `__WEB_ROOT__`) so `tls-bootstrap.sh` can render it as a template.
- [ ] 6.2 RED: `deploy/tls-bootstrap.spec.ts` — rendering with a value that still contains a literal `__..__` token in the output asserts the script FAILs (non-zero exit) before touching nginx. Must fail — script does not exist.
- [ ] 6.3 RED: same file — `--dry-run` plan asserts the HTTP-only bootstrap conf installs and `nginx -t` runs BEFORE `certbot certonly` is invoked, and the full `nginx.conf` template is not referenced until after the cert exists. Must fail — script does not exist.
- [ ] 6.4 GREEN: create `deploy/nginx-bootstrap.conf` (ACME location + `503` catch-all) and `deploy/tls-bootstrap.sh` implementing the D6 sequence, with `nginx -t` as a hard gate that repoints the symlink back to the bootstrap conf and reloads on failure — nginx must never end a run unable to start.
- [ ] 6.5 RED then GREEN: `deploy/renewal-hook-nginx.spec.ts` asserts the hook calls `nginx -t && systemctl reload nginx` (mocked); create `deploy/renewal-hook-nginx.sh` to satisfy it.
- [ ] 6.6 Static verification: `shellcheck` + `bash -n` on `tls-bootstrap.sh` and `renewal-hook-nginx.sh`.
- [ ] 6.7 No proof available pre-VPS: real ACME issuance against a DNS-resolvable domain, forced-renewal drill checked via `openssl s_client`, `nginx -t` on a real install. Add to `deploy/README.md`'s post-VPS checklist.

## Phase 6B — PR6 close out

- [ ] 6B.1 `deploy/README.md`: TLS bootstrap section (HTTP-only bootstrap conf first, `nginx -t` gate before `certbot`, renewal hook).
- [ ] 6B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1-PR6 diff; record results.
- [ ] 6B.3 Open PR #6 targeting PR #5's branch (feature-branch-chain).

## Phase 8 — PR7: backup ordering & encryption (D7)

*Task 8.2 relocated to Phase 9 — see Re-slicing note 1. `backup.sh`'s core (8.1, 8.3, 8.4) is one atomic RED×2/GREEN×1 unit; retention pruning (8.5, 8.6) is a separate, later-addable RED/GREEN pair — named-but-unapplied seam, Re-slicing note 5.*

- [ ] 8.1 RED: `deploy/backup.spec.ts` — `--dry-run` plan asserts the `pg_dump` step is listed strictly before the PDF-tree copy step. Must fail — script does not exist.
- [ ] ~~8.2~~ **Relocated to Phase 9** (immediately before 9.3) — it shares a single GREEN (9.4) with 9.3, both targeting the not-yet-created `verificarRestauracion.integration.spec.ts`.
- [ ] 8.3 RED: encrypt/decrypt round-trip on a fixture — byte-identical after round-trip, unreadable without the key. Must fail — encryption step does not exist. Resolve the `age`-availability open question here: check `age` package presence for the target Ubuntu release during implementation; fall back to `gpg --recipient` (asymmetric, decrypt key never touches the VPS) if absent — either satisfies D7's "no decryption key on the box" property.
- [ ] 8.4 GREEN: create `deploy/backup.sh` — `pg_dump -Fc` → PDF-tree copy → encrypt (age or gpg fallback per 8.3) → `rclone` push using `/etc/contratos/backup.env` (root `0600`).
- [ ] 8.5 RED: same file — 31+ dated remote artifacts asserts exactly the 30 most recent are retained (mocked/local listing, no VPS). Must fail.
- [ ] 8.6 GREEN: implement retention pruning in `deploy/backup.sh` (30 remote, 2 local) to satisfy 8.5.
- [ ] 8.7 Static verification: `shellcheck` + `bash -n` on `backup.sh`; repo scan confirms no committed credential/secrets file.

## Phase 8B — PR7 close out

- [ ] 8B.1 `deploy/README.md`: backup section (dump-before-PDF-copy ordering rationale, encryption choice — `age` or the `gpg` fallback per 8.3 — and retention policy).
- [ ] 8B.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1-PR7 diff; record results.
- [ ] 8B.3 Open PR #7 targeting PR #6's branch (feature-branch-chain).

## Phase 9 — PR8: restore & hash verification (D7 cont.)

*No atomicity-safe seam was identified inside this PR — see Re-slicing note 6.*

- [ ] 9.1 RED: `deploy/restore.spec.ts` — target `DATABASE_URL` or `ALMACEN_DOCUMENTOS_RUTA` equal to the production value asserts `restore.sh` refuses (non-zero exit, no writes). Must fail — script does not exist.
- [ ] 9.2 GREEN: create `deploy/restore.sh` — restores into a scratch database and directory only, enforces the refusal guard, then invokes `verify-restore.sh`.
- [ ] **8.2** (relocated from Phase 8) RED: `apps/api/prisma/restauracion/verificarRestauracion.integration.spec.ts` (against CI's Postgres 17 container) — a row committed after the dump completes but before the PDF copy finishes results in a `huerfanos` warning only, never a missing row. Must fail — verifier does not exist.
- [ ] 9.3 RED: same file (CI's Postgres 17 + a deliberately corrupted fixture) asserts: `faltantes` (row, no file) and `desajustados` (file, wrong sha256) both cause exit 1; `huerfanos` (file, no row) only warns; `total === 0` fails outright — a drill that verifies nothing must not report success. Must fail — verifier does not exist. **8.2 and 9.3 are two RED scenarios against the same module, both satisfied by 9.4's single GREEN.**
- [ ] 9.4 GREEN: create `apps/api/prisma/restauracion/verificarRestauracion.ts` (streaming orchestrator + sha256 comparator), following `prisma/backfill/nombreDeBusqueda.ts`'s exported-pure-function-plus-jiti-CLI pattern; streams every `DocumentoContrato` row's file and compares against the stored lowercase-hex `sha256` (`schema.prisma:279`). Satisfies both 8.2 and 9.3.
- [ ] 9.5 GREEN: create `deploy/verify-restore.sh` — thin wrapper that runs `pnpm --filter @contratos/api verify:restore` against the scratch DB/dir after `restore.sh` completes.
- [ ] 9.6 Add `verify:restore` script to `apps/api/package.json`.
- [ ] 9.7 Create `deploy/contratos-backup.service` + `deploy/contratos-backup.timer` (daily schedule); verify with `systemd-analyze verify` — this runs without root and without a VPS; record pass/fail.
- [ ] 9.8 No proof available pre-VPS: real offsite transfer via a credentialed `rclone` remote, full restore drill against a real scratch host. Blocked on the `offsite-backup-destination` external dependency (`state.yaml`) — not blocked on any task in this file. Add to `deploy/README.md`'s post-VPS checklist.

## Phase 10 — PR8 close out & go-live gate

- [ ] 10.1 `deploy/README.md`: restore drill walkthrough, retention policy, credential rotation note.
- [ ] 10.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint` against the cumulative PR1-PR8 (full chain) diff; record results.
- [ ] 10.3 Open PR #8 targeting PR #7's branch (feature-branch-chain).
- [ ] 10.4 **Go-live gate.** Record explicitly in `deploy/README.md`: **PR7 and PR8 together** must be merged, deployed to the VPS, and pass one real backup-then-restore drill before the first real customer *comodato* is signed on that server. Until then, every signed contract on the box has no offsite copy.

## Non-goals / deferred (explicit, not silent)

- **VPS purchase** — external dependency (`state.yaml` `vps-purchase`); not a task here, blocks host-only tasks (1.6/5.10/6.7/9.8) and `sdd-verify` only.
- **Domain DNS** — external dependency (`domain-dns`); blocks real ACME issuance (6.7) only.
- **Offsite backup destination** — external dependency (`offsite-backup-destination`); blocks the real transfer/drill (9.8) only, not the fixture-level tests in 8.1/8.3-8.6/9.1-9.4.
- **API restart drops an in-flight `POST /contratos/:id/firmar`** — named in 5.10, not solved by this change. A drain needs a second instance; a 4 GB box cannot host one. Mitigation stays operator scheduling.

## New close-out tasks (structural, not scope creep)

Eight chained PRs need eight evidence-and-PR-open close-outs; pass 2's six
PRs needed six, pass 1's three PRs needed three. This pass adds two more
close-out groups (Phase 4B, Phase 5D) versus pass 2, because the old
combined "seed gate + deploy + publish" PR and its single close-out (pass
2's "5B") is now three PRs (PR3, PR4, PR5) each needing its own. Net: 58
original tasks (unchanged in content, RED/GREEN pairing, and order across
all three passes) + 15 net new close-out tasks = **73 tasks total** across
16 phase blocks / 8 chained PRs.
