# Exploration — production-deployment

## Exploration: Production deployment to a HostGator VPS

### Current State

**1. What already exists (deploy-related artifacts, actual state)**

| Artifact | Path | State |
|---|---|---|
| Nginx reverse-proxy config | `deploy/nginx.conf` | Written (PR #35, commits `b756820`+`03271fb`, merged to `master`). **Never validated with `nginx -t`** — nginx isn't installed on the dev machine, and the file references `/etc/nginx/proxy_params` and Let's Encrypt paths that only exist on a real server. Uses placeholder hostname `contratos.iesnet.com.ar` and placeholder path `/var/www/contratos`, both flagged in the file's own header as "replace before installing." |
| systemd unit | `deploy/contratos-api.service` | Written, same PR. Passes `systemd-analyze verify` (only complaint: the `/usr/local/bin/pnpm` placeholder path — never confirmed against a real server's `which pnpm`). Never started under real systemd. |
| CI workflow | `.github/workflows/ci.yml` | Present and green — three jobs: `verify` (typecheck + `pnpm -r test`), `lint` (`eslint --max-warnings 0`), `integration` (Postgres 17-alpine + Chromium service containers, runs `prisma:migrate:deploy` then `test:integration`). **This supersedes an earlier Engram note (#192, 2026-08-14) that said "NO CI of any kind" — CI was added after that audit.** CI is test-only: no CD/deploy job, no SSH step, no artifact publishing to any server. |
| Docker | repo-root `docker-compose.yml` | Dev-only: spins up `postgres:17-alpine` for local Postgres (`contratos`/`contratos`, port 5432). **No Dockerfile anywhere in the repo** (confirmed via glob). Not usable as-is for production; conflicts with the systemd unit's implicit assumption of a natively-installed Postgres (`After=network-online.target postgresql.service`) — see Risks. |
| Provisioning / IaC | — | Absent. No `scripts/` directory, no Ansible/Terraform, no Dockerfile, no bash provisioning script. |
| Backup mechanism | — | Absent. DESIGN.md §10 repeats, under every hosting subsection (DonWeb *and* HostGator), that the offsite copy of the DB + PDF archive "still has to be built" — provider snapshots only protect against disk failure, not account loss. |
| Fonts bootstrap (`fonts-dejavu-core fonts-liberation` + `fc-cache -f -v`) | — | Documented as a required manual step in DESIGN.md §10 ("a bare Ubuntu Server has no TrueType fonts at all" → Chromium renders every glyph as a tofu box `□`). Not encoded in `deploy/`, CI, or any script. |
| 2 GB swap file | — | Documented as required in DESIGN.md §10 ("Operational guardrails"). Not scripted anywhere. |
| `.env.example` | — | Does not exist in the repo, despite `configuracion.ts`'s own comment pointing to it ("See `.env.example` for the full list"). Real gap for whoever writes `/etc/contratos/api.env`. |
| VPS itself | — | **Not purchased.** DESIGN.md §10's opening line: "Decided... Not yet purchased." |

**2. Runtime story**

- API: no `dist/`, by deliberate design (documented at the top of `apps/api/src/main.ts` and again in `deploy/contratos-api.service`'s comments — still current, re-verified this session). `pnpm start` = `jiti src/main.ts`, byte-identical command in dev and production. `tsc --noEmit` is the separate type gate, already wired into CI's `verify` job. No bundler substitutes for this; the reasoning (Prisma 7 emits TS outside `src`, NestJS needs `emitDecoratorMetadata`, no tool does both plain-ESM extensionless resolution and decorator metadata at once) still holds against the current `package.json` scripts.
- Web: `vite build` (apps/web/package.json `"build": "vite build"`) emits static assets consumed by `nginx.conf`'s `root /var/www/contratos` (comment: "where `apps/web/dist` is deployed"). No SSR, no second Node process. Nginx serves it as a static SPA with `try_files $uri $uri/ /index.html` fallback and immutable long-cache headers on hashed `/assets/`.
- Nginx is same-origin by design: proxies exactly `/auth`, `/contratos`, `/salud` (the three real `@Controller(...)` prefixes) to `127.0.0.1:3000`, serves everything else as the PWA. This is why the PWA has no configurable base URL — confirmed independently by Engram #64 (Vercel was rejected specifically because a separate frontend host would break same-origin and reintroduce CORS).
- **Undocumented**: how API code lands in `/opt/contratos` and how `apps/web/dist` gets copied into `/var/www/contratos` on deploy/update. No script exists for either — today this would be manual `git pull` + `pnpm install` + `vite build` + copy + `systemctl restart`.

**3. Database story**

- Local dev: `docker-compose.yml` → `postgres:17-alpine`.
- Migrations: Prisma 7, 6 migrations already committed (`init`, `plantilla_dos_documentos`, `identidad_usuarios`, `contratos_version_optimista`, `contratos_nombre_busqueda`, `evento_usuario`). Production command is `prisma migrate deploy` (`apps/api/package.json` → `prisma:migrate:deploy`), confirmed via current Prisma docs to be the correct non-interactive command for CI/CD and release steps (applies pending migrations only, never prompts, not `migrate dev`). Already exercised in CI's `integration` job against a throwaway container. **Not wired into the systemd unit or any deploy script** — running it against the real production DB is, today, an unscripted manual step.
- Seeding: `prisma:seed` = `jiti prisma/seed.ts`. Seeds the **real** comodante signatory (`SIGNATORY_VERSION = "v1"`, `SIGNATORY_FULL_NAME = "SIEIRA GUILLERMO FEDERICO"`, DNI `27.582.030` — the placeholder `v0-prueba` signature was replaced in August 2026 per `seedContent.ts`). `seedDatabase()` has a hard production guard: throws if `NODE_ENV==="production"` and the signatory version is still the provisional one, so a prod seed cannot accidentally install the fake signature. Idempotent by version-lookup — safe to re-run.
- **Six env vars outside the typed schema**: `prisma/seed.ts` reads `SEED_ADMIN_USERNAME`, `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_PASSWORD`, `SEED_TECNICO_USERNAME`, `SEED_TECNICO_NOMBRE`, `SEED_TECNICO_PASSWORD` directly via raw `process.env`, bypassing `configuracion.ts`'s Zod validation entirely. Passwords have no default and must be ≥12 chars (`LARGO_MINIMO_CONTRASENA_ADMIN`/`_TECNICO` = 12) or the account is silently not created (`seedDatabase` reports "omitido" loudly, but doesn't fail the seed) — and without `SEED_TECNICO_PASSWORD` specifically, the entire signing flow is unreachable (seed's own error message says so). An operator using `configuracion.ts` alone as "the list of required vars" (as this exploration's brief pointed to) will miss all six.
- Backups: **none built.** Repeated as a non-negotiable requirement under every hosting subsection of DESIGN.md §10, independent of which provider was chosen. §10's own worst-case framing: a 7-day backup gap at 20 installs/day ≈ 100 contracts lost, recoverable only by revisiting 100 customers' homes for a second signature.

**4. The Chromium/PDF constraint**

- `apps/api` depends on `puppeteer@^25.4.0`, which downloads its own bundled Chromium (CI's own comment: "the browser lives in `~/.cache/puppeteer` rather than in the pnpm store"). `GeneradorDeDocumentosPuppeteer.ts` launches with `headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"]` — required because the API runs as the non-root systemd user `contratos` without the namespaces Chromium's own sandbox needs. Accepted risk, documented inline: the browser only ever renders self-generated HTML (template + server-controlled values), never third-party or network content.
- Rendering runs through `ColaDeConcurrencia.ts` (confirmed present), concurrency 1–2 per DESIGN.md and `nginx.conf`'s comments — this is what justifies `proxy_read_timeout 120s`/`proxy_send_timeout 120s` on `/contratos`.
- Current (2026) system-dependency guidance for headless Chromium on Ubuntu: ~25-30 shared libraries (`libnss3`, `libatk-bridge2.0-0`, `libgbm1`, `libasound2`, `libx11-xcb1`, etc.) plus TrueType fonts must be present on the host — none of this is scripted in the repo.
- Measured footprint (DESIGN.md, backed by the real 2026-08-10 Android signing): Chromium package ~651 MB on disk, ~400 MB RAM per concurrent render. Combined with Node ~400 MB, Postgres ~512 MB, OS ~500 MB, nginx ~100 MB ≈ 1.9 GB used at boot — this 4 GB total is what ruled out HostGator's 2 GB NVMe-2 tier. Dropping Puppeteer for `pdfmake`/PDFKit (§7's documented, not-adopted fallback) would drop the requirement to 2 vCPU/2 GB/15 GB at a cost to fidelity against the paper original.

**5. Secrets and config** (from `apps/api/src/config/configuracion.ts`, the typed Zod source of truth — `.env`/`.env.*` were not opened)

| Var | Required? | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | No | `development` | enum `development`\|`test`\|`production` |
| `PORT` | No | `3000` | TCP port 1–65535 |
| `DATABASE_URL` | **Yes** | — | must start `postgresql://` or `postgres://` |
| `JWT_SECRET` | **Yes** | — (no fallback, deliberately) | ≥32 chars; generate via `openssl rand -base64 48` |
| `JWT_ACCESO_MINUTOS` | No | 15 | max 60 — access tokens aren't revocable, so short life is what makes revoking a device matter |
| `JWT_REFRESH_DIAS` | No | 30 | max 365 |
| `LOGIN_INTENTOS_POR_MINUTO` | No | 5 | login throttle |
| `CONFIAR_EN_PROXY` | No | `false` | **must become `true`** once nginx exists, or the login rate limiter counts every técnico as one client (all requests attributed to 127.0.0.1) |
| `ALMACEN_DOCUMENTOS_RUTA` | No | `var/documentos` (relative — wrong for prod) | signed-PDF archive root; must equal `ReadWritePaths=` in the systemd unit exactly |

Plus the 6 seed-only vars described above (`SEED_ADMIN_*`, `SEED_TECNICO_*`), which live entirely outside this table's schema.

**6. TLS, domain, reverse proxy**

- Decision of record (DESIGN.md §10 "Operational guardrails" + "Provider decision"): nginx terminates TLS and serves static assets, Let's Encrypt is named explicitly sufficient. `deploy/nginx.conf`'s ACME-challenge location block (`/.well-known/acme-challenge/` → `root /var/www/certbot`) implies **webroot mode**, though this isn't stated as a deliberate choice anywhere — `/var/www/certbot` doesn't exist yet. Current certbot guidance (2026): installing certbot creates a systemd timer that runs twice daily and only renews certs within 30 days of expiry — no cron needed, but a deploy hook under `/etc/letsencrypt/renewal-hooks/deploy/` is the idiomatic way to reload nginx post-renewal, and none exists in this repo.
- Domain: `contratos.iesnet.com.ar` is used throughout `nginx.conf`, explicitly flagged in the file's own header as a placeholder — no Engram record confirms it's purchased or DNS-pointed.
- Still genuinely undecided per DESIGN.md's own text: the HostGator instance's exact physical datacentre location ("not confirmed in writing" — explicitly and deliberately set aside by Guillermo Seira as his call, not re-argued in the document) and which regional HostGator entity sells to Argentina (pricing/support differ).

### Affected Areas
- `deploy/nginx.conf` — needs `nginx -t` validation on a real box; placeholder hostname/paths to fill before install
- `deploy/contratos-api.service` — needs a real `which pnpm` path and confirmed `/opt/contratos` deploy target
- `apps/api/src/config/configuracion.ts` — typed source of truth for the 9 app-runtime env vars
- `apps/api/prisma/seed.ts`, `apps/api/src/seed/seedDatabase.ts`, `apps/api/src/seed/seedContent.ts` — bootstrap data + the 6 undocumented `SEED_*` vars
- `apps/api/package.json` — `prisma:migrate:deploy`, `prisma:seed`, `start` scripts (all confirmed current)
- `apps/web/package.json` — `vite build` output consumed by nginx's static root
- `docker-compose.yml` — dev-only Postgres; conflicts with the systemd unit's native-`postgresql.service` assumption
- `.github/workflows/ci.yml` — test-only pipeline, no CD/deploy job
- `DESIGN.md` §10 — decision of record and the gaps it names but doesn't close
- Absent but load-bearing: `.env.example`, `scripts/`, backup tooling, fonts/swap provisioning

### Approaches

1. **Manual runbook over the existing `deploy/` artifacts** — SSH in, follow the header comments in `nginx.conf`/`contratos-api.service` by hand, run `migrate deploy` + seed manually, `git pull` for updates.
   - Pros: zero new code; fastest path to a first real deploy; doesn't touch the already-reviewed PR #35 artifacts.
   - Cons: no repeatability or drift detection; fonts/swap/backup stay tribal knowledge and are easy to skip on a rebuild; no rollback tooling; deploy quality depends on who's doing it under time pressure.
   - Effort: Low.

2. **Thin scripted provisioning + deploy layer over the existing `deploy/` artifacts** — a bash script (or two) checked into `deploy/` that codifies the apt installs (fonts, swap, nginx, certbot), wraps `migrate deploy` + seed + `systemctl restart` into one idempotent run, still no containers.
   - Pros: keeps the load-bearing jiti/systemd/nginx decisions untouched (lowest risk to what's already reviewed and decided); makes fonts/swap/backup executable and reviewable instead of prose in DESIGN.md; small enough to fit the 400-line review budget.
   - Cons: still bespoke, not general IaC; unproven until run against the real VPS, which doesn't exist yet.
   - Effort: Medium.

3. **Containerize the stack** (API + Postgres + nginx as Docker Compose in production) — would also resolve the docker-compose.yml/systemd `postgresql.service` mismatch by making Postgres consistently containerized in dev and prod.
   - Pros: environment parity; Chromium's system-library dependency becomes a pinned base image instead of host-level apt drift.
   - Cons: directly contradicts DESIGN.md §10's explicit, already-decided guidance ("Run Node under a process manager (systemd or PM2)... Put Nginx in front") and the systemd unit's own reasoning for leaving `RestrictNamespaces`/`PrivateUsers` unset (Chromium's sandbox needs those namespaces; containers add another namespace layer to reason about); would partly discard the already-reviewed PR #35 work.
   - Effort: High.

### Recommendation

Approach 2 — a thin scripted provisioning/deploy layer over the existing, already-reviewed `deploy/nginx.conf` + `deploy/contratos-api.service`. It's the only option that doesn't relitigate DESIGN.md §10's closed decisions (systemd + nginx, non-containerized, jiti runtime) while actually closing the "written but never run against a real server" gap and giving backups/fonts/swap a reviewable, repeatable home instead of leaving them as prose in a design doc.

### Risks
- VPS not purchased yet — `nginx.conf` has never passed `nginx -t`, and every automation decision is unverifiable against a real box until then.
- Backup mechanism is completely unbuilt — DESIGN.md treats it as non-negotiable regardless of provider; losing 7 days means revisiting ~100 customers' homes.
- Postgres deployment target undecided: `docker-compose.yml` (containerized) vs. the systemd unit's implicit native `postgresql.service` — nobody has chosen one for production, and picking wrong silently breaks the `After=` dependency.
- Fonts + swap provisioning exist only as prose in DESIGN.md §10 — a rebuild or second server has to remember them from memory, and a missed font install produces PDFs that render as tofu boxes but still hash and get signed as legal documents.
- `SEED_ADMIN_PASSWORD`/`SEED_TECNICO_PASSWORD` (+4 more) live outside `configuracion.ts`'s typed schema — a proposal that treats that file as the complete env-var list will miss them, and a missing técnico password makes the entire signing flow unreachable.
- No `.env.example` despite `configuracion.ts` pointing to one — first-deploy friction.
- No CD/deploy job in CI — deploying today is entirely manual and unwritten.
- Domain `contratos.iesnet.com.ar` unconfirmed as purchased/DNS-pointed.
- Datacentre physical location still not confirmed in writing (explicitly set aside as Guillermo Seira's call — not blocking, but a proposal shouldn't silently resolve it either).
- `deploy/contratos-api.service`'s `pnpm` path and `/opt/contratos` deploy target are unvalidated placeholders.

### Ready for Proposal
Yes. DESIGN.md §10 has already closed the hard architectural questions (HostGator VPS NVMe4, systemd+jiti, nginx same-origin, Puppeteer with `--no-sandbox`, concurrency queue). What remains is proposal-shaped: pick the deploy execution approach (recommend #2), and design the backup mechanism, migration/seed execution flow, TLS acquisition flow, and Postgres hosting choice (container vs. native) — scoped enough for a single proposal + design + tasks cycle. The one blocking real-world dependency is the VPS purchase itself, which sits outside the code change and should be sequenced as a proposal dependency, not modeled as an implementation task.

---

**Tooling note for the orchestrator**: this exploration is persisted to both halves of `hybrid` mode — Engram (`sdd/production-deployment/explore`, observation 540) and this file. The exploring executor had no Write/Edit/Bash tool, so the OpenSpec half was materialized by a follow-up writer from the Engram content verbatim; the body above is unmodified. DAG state lives in `state.yaml` and Engram (`sdd/production-deployment/state`). The native dispatcher reports this change as exploration-only until `proposal.md` exists, which is expected, not a fault.
