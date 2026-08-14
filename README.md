# Contratos de comodato — IES.NET

Digitises the *contrato de comodato* a customer signs when IES.NET installs an
antenna, PoE injector and mast tubing at their home: the equipment stays company
property, and the signature is what makes that explicit. A technician takes a
company tablet to the customer's house; the customer signs on screen.

Architecture, decisions and their reasoning live in [`DESIGN.md`](./DESIGN.md).
This file is only about getting it running on your own machine.

## Layout

| Path | What it is |
|---|---|
| `apps/api` | NestJS API — contracts, templates, signatories, identity |
| `apps/web` | React + Vite installable PWA — the técnico's tablet client |
| `packages/esquemas` | Zod schemas shared by both, so client and server agree by construction |
| `deploy/` | Nginx server block and the systemd unit |

## Requirements

- Node **≥ 22** (`engines.node`)
- pnpm **11.11.0** (`packageManager` — `corepack enable` is enough)
- Docker, for PostgreSQL 17
- Chromium's system dependencies, since PDFs are rendered with Puppeteer

## Running it locally

### 1. Install and start the database

```bash
pnpm install
docker compose up -d          # postgres:17-alpine on 5432
```

### 2. Provide the environment

**Nothing in the application loads a `.env` file.** That is deliberate:
`apps/api/src/config/configuracion.ts` validates the whole environment before
the HTTP server is created, so a missing `JWT_SECRET` kills the process on the
ground rather than in front of a technician at a customer's house. Supplying
the environment is the operator's job — systemd's `EnvironmentFile` in
production, your shell here.

Copy `.env.example` to `.env` and fill it in. Then, from the repository root:

```bash
set -a && . ./.env && set +a
```

`configuracion.ts` is the authoritative list of what must be set and what each
variable means; `.env.example` mirrors it.

Two values matter more than the rest while developing:

- `DATABASE_URL` — must match the credentials in `docker-compose.yml`
  (`contratos`/`contratos`/`contratos` by default).
- `ALMACEN_DOCUMENTOS_RUTA` — where signed PDFs are written. The default is the
  **relative** `var/documentos`, resolved against the API's working directory.
  Fine locally; set an absolute path in production.

Leave `CONFIAR_EN_PROXY` at `false` here. It exists for the Nginx deployment,
and turning it on with nothing proxying lets any client forge
`X-Forwarded-For` past the login rate limiter.

### 3. Migrate and seed

```bash
pnpm --filter @contratos/api prisma:migrate:dev
pnpm --filter @contratos/api prisma:seed
```

The seed is idempotent. It creates the contract templates, the comodante
signatory (with a placeholder signature image), one **admin** account —
`SEED_ADMIN_USERNAME` (default `admin`) with `SEED_ADMIN_PASSWORD` — and one
**técnico** account — `SEED_TECNICO_USERNAME` (default `tecnico`),
`SEED_TECNICO_NOMBRE` (default `Técnico`) with `SEED_TECNICO_PASSWORD`.

**Neither password has a default, on purpose.** Leave `SEED_ADMIN_PASSWORD` or
`SEED_TECNICO_PASSWORD` unset and the seed still runs — it creates the
template and signatory, skips the account, and says so loudly on stdout. Set
one to log in as that role; the técnico account is the one that can open
`apps/web`'s signing flow at all, since only `tecnico` sessions pass the
route guard. Both passwords need at least 12 characters — the técnico's is
not a smaller minimum than the admin's, because it authenticates the same
internet-facing login endpoint and it is the credential that signs a legally
binding contract on the company's behalf; see the comment beside
`LARGO_MINIMO_CONTRASENA_TECNICO` in `apps/api/src/seed/seedDatabase.ts` for
the full reasoning.

### 4. Run both processes

Two terminals, both with the environment loaded:

```bash
pnpm --filter @contratos/api start     # jiti src/main.ts → :3000
pnpm --filter @contratos/web dev       # vite → :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/auth`, `/contratos`
and `/salud` to the API (`apps/web/src/dev/proxyDeDesarrollo.ts`), so the app is
same-origin locally exactly as it is behind Nginx — the client never knows the
API's port, and there is no CORS anywhere.

## Reaching the signing flow

Set `SEED_TECNICO_PASSWORD` (step 3, above) and seed the database — that
creates the account the client's route guard actually admits into the signing
flow, since `/` is gated to the `tecnico` role. Log in with that account and
the whole flow is reachable: the borrador form, the reading gate, signature
capture, signing and delivery.

Logging in with the **admin** account instead lands on `/panel`, the office
panel: `rutaInicialPara` sends both `oficina` and `admin` there, and
`apps/web/src/rutas/rutas.tsx` mounts the contract list and the contract
detail (`/panel/contratos/:id`) behind a role guard for those two roles. The
*"Todavía no hay un panel disponible para su rol"* screen is still in the
tree, but only an unrecognized role reaches it now.
`AuthController` still exposes only `login`, `refresh` and `logout`; there is
no user-management UI yet, which is why both accounts are provisioned by the
seed rather than created at runtime.

## Checks

```bash
pnpm -r test            # unit suites: api, esquemas, web
pnpm -r typecheck
pnpm --filter @contratos/web build
pnpm --filter @contratos/api test:integration   # needs the database up
```

The domain and application layers run without a database or a browser by
design, so `pnpm -r test` needs neither. Only the integration suite does.

## What a laptop cannot tell you

The tablet is the real target, and two things never work here:

- **`navigator.share({ files })` does not exist on desktop Linux Chrome.**
  Document delivery falls back to downloading the PDFs, so the path the
  technician actually uses every day is the one you cannot see.
- **A mouse or trackpad reports no pressure**, so signatures are captured
  without it and the stylus branch stays untested.

Camera MAC scanning does work against a webcam — `BarcodeDetector` is available
in desktop Chromium — though not under the glare and angles of a real antenna
sticker. And note that a laptop screen is large enough that a contract may fit
without scrolling, which exercises the reading gate's *confirm-without-scrolling*
branch rather than the scroll branch. Narrow the window to see both.

## Conventions

- **Strict TDD.** The failing test comes first.
- Technical artifacts — code, comments, tests, commit messages, documentation —
  in English. Domain terms (*comodato*, *comodante*, *comodatario*), UI copy and
  contract content stay in Spanish, because the users and the legal source
  document are Spanish. `DESIGN.md` explains why.
- Conventional commits.
- Substantive changes go through the SDD cycle; see `CLAUDE.md`.
