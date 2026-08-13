# Digital Comodato Contracts — Design Document

> **Language note.** This document is written in English as technical
> documentation. All *domain terms* (comodato, comodante, comodatario), all
> *UI copy*, and all *contract content* stay in Spanish, because the end users
> (field technicians, office staff, customers) and the legal source document
> are Spanish. Do not translate them.

---

## 1. Context

IES.NET is a wireless ISP operating in Santiago del Estero, Argentina. The
antennas, PoE injectors and mast structure installed at a customer's home
remain company property. To make that ownership legally explicit, every
customer signs a **contrato de comodato** (bailment agreement) on paper today.

This system replaces the paper process with a tablet-based signing flow that
produces a legally defensible digital document.

### The source document

The paper document (`contrato2026.docx`) is **two separate documents** in one
file, each with its own signature block:

| Document | Signature block | Signed by |
|---|---|---|
| **Condiciones Generales de Uso** | `FECHA`, `FIRMA`, `ACLARACIÓN`, `Nº` | Customer only |
| **Contrato de Comodato** | `COMODANTE` + `COMODATARIO`, each with aclaración and DNI | Both parties |

The customer signs **twice**. This is a hard requirement, not an
implementation detail — modelling it as a single document with one signature
would misrepresent what the customer actually agreed to.

---

## 2. Decisions already closed

These were settled with the business owner and are not open for redesign:

| Decision | Value | Rationale |
|---|---|---|
| Client platform | Installable PWA on company-owned tablets | Controlled fleet, push updates without reinstalling |
| Connectivity | **Online**, not offline-first | The contract is signed *after* the service is live, so internet exists at the site; technicians also carry Starlink |
| Signing location | Customer's home, technician present | — |
| Comodante signature | **Pre-loaded** (signature image + aclaración + DNI of Sieira Guillermo Federico, DNI 27.582.030) | The owner is not present at installs |
| Contract term | Signature date + **10 years** (120 months) | Set by the business |
| Expiry date | **Derived**, never typed | It is the field that governs equipment restitution; a typo there is a legal problem |
| Contract number (`Nº`) | Assigned by the server | Online-only removes the offline collision problem entirely |
| Copy delivery | WhatsApp | Customers reliably have WhatsApp; many do not have email |
| Roles | Technician (field) + Office (back-office) | — |
| Out of scope | Any integration with external provisioning or billing systems | Explicitly excluded by the owner |

### What "online" buys us

Dropping offline-first removes a large amount of accidental complexity:

- No client-generated UUIDs, no sync queue, no conflict resolution.
- Server clock is authoritative for signing timestamps.
- The contract number is a real sequential number, allocated centrally.
- **PDFs are generated server-side**, so every contract renders identically
  regardless of tablet, font availability or zoom level, and the integrity
  hash is computed where the evidence lives.

The one thing retained from the offline design is **local draft autosave** —
not to work without connectivity, but so a flaky Wi-Fi moment does not force
the technician to ask the customer for their DNI a second time.

---

## 3. Domain model

### Aggregate: `Contrato`

A `Contrato` is the aggregate root. Once signed it is **immutable**.

**Comodatario (customer)**

| Field | Type | Notes |
|---|---|---|
| `nombreCompleto` | string | Also used as *aclaración* under the signature |
| `dni` | string | Argentine DNI, normalised without dots |
| `domicilioCalle` | string | Street address where the equipment lives |
| `ciudad` | string | |
| `provincia` | string | Fixed: `Santiago del Estero` |
| `whatsapp` | string (E.164) | **New field**, not on the paper form — needed for delivery |

**Equipos (clause PRIMERA)**

This is a **fixed structure, not a dynamic item list**:

| Field | Type | Notes |
|---|---|---|
| `antenaModelo` | string | |
| `antenaMac` | string | Normalised MAC; captured by camera scan, format-validated |
| `poe` | boolean | Rendered as `SI` / `NO` |
| `canoMetros` | numeric | Metres of mast tubing |

**Plazo (clause SEGUNDA)**

| Field | Type | Notes |
|---|---|---|
| `plazoMeses` | integer | `120` |
| `fechaInicio` | date | Signature date |
| `fechaVencimiento` | date | **Derived** = `fechaInicio + plazoMeses` |

**Comodante**

Not customer input. Resolved from the active `Signatario` record at signing
time and **snapshotted onto the contract**, so a future change of signatory
never alters historical contracts.

### Contract states

The signed PDF is never modified. State lives **beside** the document, in the
record — not inside it.

```
borrador ──firma──▶ vigente ──baja──▶ dado_de_baja
                       │
                       └──anulación──▶ anulado ──▶ (superseded by a new contract)
```

| State | Meaning |
|---|---|
| `borrador` | Being filled in, nothing signed, no legal value |
| `vigente` | Signed and in force |
| `dado_de_baja` | Service terminated; the contract no longer applies |
| `anulado` | Signed with incorrect data; voided and replaced by a new contract |

`dado_de_baja` carries a **reason** and a **date**. It does not delete,
overwrite or edit anything.

### Correcting a mistake: annul and re-sign

**Confirmed rule.** A signed contract with wrong data — a mistyped DNI, a
wrong MAC — is **never edited**. It is marked `anulado` and a **new contract
is created and signed from scratch**.

- The annulled contract stays in the archive with its PDF and hash intact.
- The new contract stores `reemplaza_a` pointing at the annulled one, so the
  chain is visible from either end.
- Annulment records a reason and an actor.

This is deliberately inconvenient — it can mean a return trip to the
customer's home. That inconvenience is the price of the signature meaning
anything. If a signed contract could be edited afterwards, the signature would
prove nothing and hashing the PDF would be decoration.

**Design consequence:** since the cost of an error is a second visit, the
capture form must prevent errors rather than trust the technician. MAC scanned
from the sticker instead of typed, DNI format-validated, and a mandatory
on-screen review with the customer before the first signature.

Equipment restitution is tracked separately from contract state, because a
contract can be terminated with the equipment still at the customer's home.
That combination — `dado_de_baja` with no restitution recorded — is exactly
the report the office needs: **company hardware sitting in the house of
someone who is no longer a customer.** Clause NOVENA prices that at USD 130
per unrecovered installation.

### Event log

Every state change is an **append-only event**, never a mutation:

`creado`, `firmado`, `entregado`, `dado_de_baja`, `equipos_restituidos`

Each event records actor, timestamp and payload. The contract's current state
is a projection of its events.

---

## 4. Why the template must be versioned

The legal text contains **prices written inline**:

- ARS 20.000 — minimum on-site technical visit
- ARS 15.000 — remote password change
- ARS 35.000 — on-site password change
- USD 130 — penalty for unreturned equipment

Under Argentine inflation these change several times a year. A contract signed
in March must keep rendering ARS 20.000 forever, even when the current
template says ARS 60.000. Rendering historical contracts against the *current*
template destroys their evidentiary value.

**Model:**

- `plantillas_contrato` — immutable, versioned rows (`version`, `contenido`,
  `vigente_desde`, `checksum`).
- Every contract stores the `plantilla_version_id` it was signed against.
- Publishing a new template creates a new row. Existing rows are never edited.

The same rule applies to the **pre-loaded comodante signature**. It is
versioned like the template, so you always know which signature image was
stamped onto which contract.

> **Security note.** That signature image is a real person's handwritten
> signature. Treat it as a secret: never expose it through the public frontend
> bundle, serve it only server-side during PDF generation, and keep it out of
> any bucket with public read access. If it leaks, anyone can paste it on
> anything.

---

## 5. Architecture

Hexagonal, with a screaming top-level layout: folders name the business, not
the framework.

```
src/
  contratos/
    domain/          # Contrato, Comodatario, Equipos, Plazo, EstadoContrato
                     # ports: ContratoRepository, PdfRenderer, Reloj
    application/     # use cases: CrearBorrador, FirmarContrato,
                     # DarDeBajaContrato, RegistrarRestitucion
    infrastructure/  # Postgres repositories, Puppeteer renderer, storage
    interface/       # HTTP controllers, DTOs, validation
  plantillas/        # versioned contract templates
  firmantes/         # comodante signatories + their signature assets
  entrega/           # sealed-PDF download for the tablet to share (§8)
  identidad/         # users, roles, authentication
  shared/            # cross-cutting kernel
```

The domain layer knows nothing about NestJS, TypeORM/Prisma, Puppeteer or
WhatsApp. Those live behind ports so the legal rules stay testable in
isolation — and the legal rules are the part that actually matters here.

### Stack

| Layer | Choice |
|---|---|
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL |
| Frontend | React + Vite, as an installable PWA (**see §5.1**) |
| PDF | Server-side HTML → PDF |
| Hosting | HostGator VPS, 2 vCPU / 4 GB (**see §10**) |

### 5.1 Frontend

**React + Vite**, built as an installable PWA. Not Next.js: there is no SSR to
exploit and no SEO at stake, and it would mean a second Node process competing
for RAM on a VPS already sized around Chromium.

| Concern | Choice | Note |
|---|---|---|
| Build / PWA | Vite + `vite-plugin-pwa` (Workbox) | Installable, app-shell cached |
| Server state | TanStack Query | Retries and cache; no Redux needed here |
| Forms | Component state + **Zod** `safeParse` | No form library — see below |
| Routing | React Router | |
| Structure | Atomic design + container/presentational | Matches existing team conventions |

**Shared validation schemas.** Define the Zod schemas once and consume them
from both sides — the client's form state on one, NestJS pipes on the other.
DNI format, MAC format and required fields then have exactly one definition.
A contract rejected by the server after the customer already signed is the
worst possible failure in this system, so client and server must agree by
construction, not by discipline.

**No form library.** An earlier version of this document specified React Hook
Form. Two slices were built without it before anyone noticed, which is the
useful evidence: these forms are short, single-step, and validated by a schema
that already exists and is already shared with the server. Component state plus
`safeParse` covers them without adding a dependency, and the property that
actually matters — client and server agreeing by construction — comes from the
shared schema, not from the library. Revisit only if a form appears that needs
field-level dirty/touched tracking these do not.

#### Signature capture — build it, do not install it

Off-the-shelf signature components return a **PNG**. This system needs the
**raw stroke data** — ordered points with timestamps — because that is the
forensic evidence that distinguishes a real signature from a pasted image
(§6). Most libraries also bind to mouse/touch events rather than Pointer
Events, losing stylus pressure and tilt.

It is roughly a hundred lines against the Canvas and Pointer Events APIs, and
it owns the most legally important artifact in the product. Write it as a
dedicated hook, keep it framework-agnostic, and unit-test it.

Required behaviour:

- `pointerdown` / `pointermove` / `pointerup` with `setPointerCapture`
- Capture `pressure` and `tiltX/tiltY` when reported
- `touch-action: none` on the canvas, or the browser scrolls instead of drawing
- Handle `devicePixelRatio` so signatures are not blurry on the tablet
- Emit **both** the rendered image and the raw stroke array

#### MAC capture by camera

`BarcodeDetector`, natively supported by Chromium on Android, which is the
target fleet. Ubiquiti devices carry the MAC as a barcode/QR on the sticker.

**No WASM decoder fallback.** An earlier version of this document called for
one on browsers without the API. It is not worth building: manual entry is
reachable in every scan state anyway, so a tablet without `BarcodeDetector`
degrades to a slower form, never to a blocked installation. Revisit only if
the fleet stops being Chromium-on-Android.

Always normalise and format-validate the decoded value, and always allow
manual entry as a fallback: a scratched or sun-faded sticker cannot block an
installation.

**A successful scan is not a correct scan.** A camera pointed at a rack or a
box of devices can decode a perfectly well-formed MAC belonging to a different
antenna. Format validation cannot catch that, and a contract sealed with the
wrong MAC cannot be edited — it has to be annulled and re-signed (§3). So a
decode never submits on its own: the value lands in the visible, editable
field for the technician to check against the sticker in front of them.

#### One application, two areas

The field app and the office panel ship as **one React application** with two
role-gated route trees, not two separate projects.

They share authentication, the API client, the domain types and the Zod
schemas — which is most of the code. The UX differences (huge touch targets
and a single linear flow on the tablet; tables, search and keyboard use in the
office) are handled with layouts and components, not with a second build.

Route-level code splitting keeps the tablet from downloading the office panel
bundle. If the two ever diverge enough to justify separate deployments, the
split is a packaging change, not a rewrite.

---

## 6. Signing flow

1. **Identify the technician.** Authenticated session on the tablet.
2. **Fill the form.** Customer data, equipment, WhatsApp number. The MAC is
   scanned from the device sticker via the camera and format-validated;
   the expiry date is computed and displayed read-only.
3. **Review on screen.** The customer reads the rendered documents — this is
   the digital equivalent of *"previa lectura y ratificación"* in the closing
   clause, and it must be a real step, not a checkbox.
4. **Signature 1** — Condiciones Generales de Uso.
5. **Signature 2** — Contrato de Comodato.
6. **Server seals the contract.** Allocates `Nº`, stamps the server timestamp,
   snapshots the template version and the comodante signatory, renders both
   PDFs, computes SHA-256 of each, persists everything, emits `firmado`.
7. **Deliver by WhatsApp.** The technician shares the sealed PDFs from the
   tablet, during the visit — outside the signing transaction, never a
   background job (§8).

### Signature capture

Canvas with **Pointer Events** — one code path that handles finger and stylus,
including pressure and tilt where the hardware reports them.

Persist **both**:

- the rendered signature image, for the PDF;
- the **raw stroke data** — ordered points with timestamps — as forensic
  evidence. A pasted image has no stroke timing. A real signature does. If the
  signature is ever challenged, that data is what distinguishes them.

Also record the signing context: device identifier, technician, IP,
user agent, and geolocation if granted.

### Integrity

- SHA-256 of each final PDF, stored alongside it, computed server-side.
- Any future verification re-hashes the stored file and compares.
- **Optional upgrade:** an RFC 3161 trusted timestamp on the hash. It proves
  the document existed at a given moment independently of your own server
  clock, which is a meaningfully stronger position if a contract is ever
  litigated. Not required for launch.

---

## 7. PDF generation

Server-side, from an HTML template rendered with the contract's snapshotted
template version.

**Recommended:** headless Chromium (Puppeteer). It gives the closest fidelity
to the existing paper layout, which matters because the office and any court
will expect the document to look like the contract they know.

**Cost to be aware of:** Chromium is heavy — roughly 300 MB on disk and
several hundred MB of RAM per render. On a small VPS that is the single
biggest resource consumer in the system. Size the server for it, or render
through a small queue with limited concurrency rather than on the request
thread.

**Lighter alternative:** a programmatic PDF library (pdfmake / PDFKit). Far
cheaper to run, but the layout is hand-built and drifts from the paper
original. Only worth it if the VPS turns out to be genuinely small.

### Storage

PDFs are the legal asset. **The only copy must never live on a single VPS
disk.** Store them on the server *and* replicate to automated offsite backup.
Losing the PDF archive is a business-ending event, not an incident.

---

## 8. WhatsApp delivery

The paper contract says *"firman las partes dos ejemplares"* — the customer is
entitled to their copy.

### The decision: the technician sends it, the app does not

**The WhatsApp Cloud API is not used, and this is not a deferral.** Automatic
delivery would require a verified WhatsApp Business account, a pre-approved
template message, and per-conversation pricing. IES.NET is not paying for it,
so the app never sends anything to anyone.

Instead: the tablet fetches both sealed PDFs and hands them to the operating
system's share sheet, where WhatsApp is one of the targets. The technician
picks the customer's chat and sends — standing in the customer's house, with
the customer watching. Where the share sheet is unavailable, the PDFs download
to the tablet and the technician attaches them by hand.

This is better than the Cloud API in two ways, not merely cheaper. **The
customer's phone number never leaves for a third-party processor**, which under
Ley 25.326 is one less data controller to account for. And the technician sees
the message leave, rather than trusting an asynchronous job to have run.

### What this costs, accepted deliberately

**There is no delivery record.** No target number, no timestamp, no provider
message id — the system has no concept of a contract having been delivered. If
a customer ever claims they never received their copy, the system cannot
answer.

This was weighed and accepted: the **signed contract is the legal artifact**,
and handing over a copy is a courtesy step around it. Revisit only if a real
dispute makes the record worth building; do not add a delivery flag on
speculation.

### Never do this

Do not use unofficial WhatsApp Web automation libraries. They work until Meta
bans the number. That number is IES.NET's customer service line.

### Delivery rules

- Delivery is **attempted during the visit**, from the tablet, by a person —
  never by a background job.
- Delivery failure must **never** roll back a signature, and must never be
  presented as one. The contract is already legally complete at signing; a
  share that fails offers a retry of the share, nothing more.
- The share sheet **does** carry the PDFs themselves as attachments
  (`navigator.share({ files })`), not a link to them. An earlier version of
  this document claimed the manual path could only send a link; that was
  wrong.

---

## 9. Roles and access

| Role | Capabilities |
|---|---|
| `tecnico` | Create drafts, capture signatures, deliver copies. Sees only their own contracts. |
| `oficina` | Search all contracts, view PDFs, terminate contracts, record equipment restitution, resend copies. |
| `admin` | Manage users, publish template versions, manage the comodante signatory. |

No role can edit or delete a signed contract. That is enforced in the domain
layer, not just in the UI.

---

## 10. Hosting

**Decided: a DonWeb Cloud Server, 2 vCPU / 4 GB RAM / 20 GB SSD** (August 2026).

This section originally decided on HostGator, chosen over DonWeb on price. It
was reopened before anything was bought — two facts that comparison did not
have turned out to be measurable, and both pushed the other way — and then
settled on DonWeb. See "Provider decision" and the DonWeb catalogue check
below.

The deciding argument was not in any table: **the operator has used DonWeb for
years.** Knowing how a provider behaves when something breaks, and how its
support answers, outweighs a price delta on a system whose downtime means a
técnico standing in a customer's house unable to finish. Configurability and an
Argentine provider made it defensible on the recorded criteria too, but that
operational familiarity is the reason, and it is written here so it is not
mistaken later for a purely economic choice.

The one hard constraint behind that choice: shared web hosting (cPanel, aimed
at PHP/WordPress) **cannot run NestJS** — a Node application needs its own
long-lived process and a port to listen on. Any plan considered here must give
root access to a real instance.

### Required capabilities (non-negotiable)

- **Root access** to a VPS or cloud instance — not shared/cPanel hosting
- Ubuntu LTS (or equivalent), with the ability to install arbitrary packages
- Node.js runtime running as a managed long-lived process
- PostgreSQL, self-hosted on the instance or managed
- A domain name and TLS certificate (Let's Encrypt is sufficient)
- Outbound HTTPS (general; no WhatsApp Cloud API is used — see §8)
- Automated, offsite, **restore-tested** backups of the database *and* the PDF
  archive

### Fonts must be installed before the first render

A bare Ubuntu Server has **no TrueType fonts at all**. Chromium then draws
every character as a `□` — the classic tofu box — and the contract renders as
a page of squares that still hashes fine and still gets signed.

The deploy must run, before the first contract is ever rendered:

```
apt-get install -y fonts-dejavu-core fonts-liberation
fc-cache -f -v
```

Spanish accents and `ñ` are what break first, so a smoke test after deploy
should render a contract and confirm the text extracts back correctly rather
than trusting that it looks right.

Chromium also needs `--no-sandbox --disable-setuid-sandbox` to launch as a
non-root user. That is acceptable here because the browser only ever renders
HTML this system generated itself — a stored template plus server-controlled
values — and never navigates to untrusted or network content.

### Sizing

Load is genuinely low — a handful of installations per day plus occasional
office queries. The sizing is driven almost entirely by **Chromium**, not by
traffic.

| Resource | Recommended | Absolute floor | Why |
|---|---|---|---|
| vCPU | **2** | 2 | PDF rendering is CPU-bursty; 1 vCPU makes a render block the API |
| RAM | **4 GB** | 2 GB | See breakdown below |
| Disk | **20 GB SSD/NVMe** | 15 GB | ~13 GB system footprint; the archive grows far more slowly than first estimated — see below |

**RAM breakdown at 4 GB:**

| Component | Approx. |
|---|---|
| OS | 500 MB |
| PostgreSQL | 512 MB |
| NestJS (Node) | 400 MB |
| Chromium, one concurrent render | 400 MB |
| Nginx + overhead | 100 MB |
| **Used** | **~1.9 GB** |
| Headroom | ~2 GB |

2 GB technically runs, but it leaves nothing spare: a second simultaneous
render, a `npm install` during deploy, or a Postgres vacuum can push it into
swap. 4 GB is the difference between a server you operate and a server you
babysit.

**Disk growth, measured rather than estimated.** This originally read "roughly
1 MB per contract … about 5 GB per year". A real contract was signed end to end
on an Android device in August 2026 and the result weighed:

| Per signed contract | Measured |
|---|---|
| Two sealed PDFs on disk | 112 KB (48 KB + 66 KB) |
| Signature PNGs and stroke data in Postgres | 49 KB |
| **Total** | **~161 KB** |

That is about **six times smaller** than the original estimate. At 20 contracts
per working day the archive grows roughly **800 MB per year**, not 5 GB.

The system footprint is what actually sizes the disk, and it is measured too:
`node_modules` 621 MB, Chromium 651 MB, the 2 GB swap file §10 requires, plus
roughly 8–10 GB for Ubuntu Server and PostgreSQL — about **13 GB before the
first contract exists**.

So **20 GB is comfortable and 10 GB is not**: at 10 GB the instance is near
capacity on day one, with nothing left for local backup staging. 20 GB leaves
around 7 GB of headroom, which at the measured rate is the better part of a
decade of contracts.

**Do not trade RAM for disk.** Disk is the cheap axis here and it turned out
cheaper still; RAM is the one that is genuinely constrained, and the breakdown
above already assumes only one concurrent render.

### Sizing if Puppeteer is dropped

If §7's lighter alternative (pdfmake/PDFKit) is chosen, Chromium disappears
and the requirement drops to **2 vCPU / 2 GB RAM / 15 GB disk**. That is a
real cost saving, paid for with a hand-built layout that will not match the
paper original as closely.

### DonWeb catalogue check (August 2026)

Quoted directly in DonWeb's Cloud Server configurator. Unlike HostGator's fixed
tiers, resources are chosen individually, which is what lets the measured
sizing above be bought exactly rather than rounded up.

| Resource | Quoted | Against §10's requirement |
|---|---|---|
| vCPU | 2 | ✅ matches |
| RAM | **4 GB** | ✅ matches — the one figure that must not be traded down |
| Disk | 20 GB SSD | ✅ matches the measured sizing |
| Transfer | 1 TB | ✅ far beyond need; a sealed PDF is 112 KB |
| Backup storage | 20 GB | Sized to the disk |
| Extra | Free domain for one year | Useful — TLS needs a domain |

Pricing quoted in Argentine pesos, VAT included, and **not converted to USD
here on purpose**: the exchange rate at the time of writing was not verified,
and an invented conversion in a purchasing decision is worse than none.

| Term | Per month | Note |
|---|---|---|
| List | $25.969 | Struck through in the configurator |
| 1 month | $19.477 | |
| 6 months | $18.178 | |
| **12 months** | **$11.686** | Total $140.236, VAT $24.338 included |

**The 12-month rate is almost certainly first-term promotional.** Budget
against the renewal figure, and confirm it before prepaying a year — the same
warning this document already carries for HostGator, and a prepaid year is a
year of not being able to act on the answer.

**Backup tier — change this before buying.** The configurator offers Estándar
Semanal (last copy), Premium Semanal (weekly, last 2) and Premium Diario
(daily, last 30). The quote had **Premium Semanal** selected, which means a
worst case of **seven days of signed contracts lost**. At 20 installations per
working day that is roughly 100 contracts, and they are not re-typed data:
recovering them means **returning to 100 customers' homes to have them sign
again**, which §3 identifies as the most expensive failure this system has.
**Premium Diario** bounds that at one day and pays for itself with a single
avoided visit.

Neither tier satisfies the requirement above on its own. Provider backup
protects against disk failure, not against an account problem — if the account
goes, the server and its backups go together. **The independent copy of the
database and the PDF archive, outside the provider, still has to be built.**

**Datacentre location — confirmed (August 2026).** This was the one thing that
had to be checked before paying, because the residency argument is the reason
an Argentine provider was attractive and it only holds if the machine is
actually in Argentina; some Argentine providers host in the United States or
Brazil.

DonWeb's own Cloud Server page states it plainly: *"Nuestros nodos de Cloud
Servers están localizados en Argentina, en alguno de nuestros cuatro
datacenter"*. The company operates from Rosario, Santa Fe. **The data stays in
the country**, which is what §10's residency reasoning needed.

**One nuance that must not be misread.** The same page also says: *"Las IPs
asignadas a cada Cloud Server pueden estar geolocalizadas en Argentina o
Estados Unidos. Esta asignación se realiza automáticamente, y no es posible
seleccionar una ubicación específica bajo pedido."*

That is **IP geolocation, not data location**. The machine and the stored
contracts are in Argentina; what may register as American is the address block
the instance answers on — a routing and registration detail. Ley 25.326 governs
where personal data is stored and processed, so this does not create an
international transfer. Recorded here explicitly because "our IP says United
States" is exactly the kind of line that gets read later as "the data left the
country" when it did not, and because the reverse mistake — ignoring it when
some future integration geolocates by IP — is also possible.

**Consequence for the clause.** With the data in Argentina, the art. 12
international-transfer consent stops being load-bearing:
`docs/borrador-clausula-datos-personales.md` is no longer *required* to make
the deployment lawful on residency grounds. It remains worth having — art. 6
still requires informing the data subject of purpose, responsible party and
their access/rectification/suppression rights — but it is now good practice
rather than a dependency. That reduction is itself a reason the provider choice
was worth revisiting before buying.

### Provider decision

The original choice was HostGator on price. Two things changed, and neither was
knowable when that comparison was made.

**1. The disk requirement collapsed.** The sizing above dropped from 80 GB to
20 GB on measured data. HostGator's line is fixed tiers — the entry tier ships
100 GB whether or not it is wanted, so the saving cannot be taken. A provider
that lets the instance be configured can be sized to what this system actually
needs, and that is where the price comparison now lives. **This is the fact
that reopened the decision.**

**2. Data residency stopped being free.** The subsection below explains the
legal position. The short version: a datacentre outside Argentina puts this
system on Ley 25.326's international-transfer rules, and the mitigation is a
consent clause in the contract the customer signs (drafted for review in
`docs/borrador-clausula-datos-personales.md`). That clause is worth having
regardless, but with a foreign datacentre the deployment *depends* on it, and
on the AAIP adequacy position holding.

**An Argentine datacentre removes that dependency entirely.** Nothing about
this system needs to leave the country: the users are in Santiago del Estero,
the customers are Argentine, and there is no foreign integration left now that
the WhatsApp Cloud API is cancelled (§8). Latency, the usual argument for a US
datacentre, was already dismissed above as invisible in this workflow.

**What to confirm before buying, whichever provider wins:**

- Root access to a real instance, not shared/cPanel — still the one hard
  constraint (a Node process needs its own port and lifetime).
- **4 GB RAM.** Non-negotiable while Puppeteer renders the PDFs. The only way
  to 2 GB is §7's pdfmake/PDFKit alternative, paid for in fidelity to the paper
  original.
- 2 vCPU, 20 GB disk.
- Physical datacentre location, in writing — not the company's address.
- Renewal price, not the promotional one, and whether a prepaid term is
  cheaper.
- Whether provider backups are restore-tested, and where the offsite copy of
  the PDF archive will live regardless of the answer.

**The DonWeb catalogue has not been checked here.** The HostGator table below
was recorded in this document's own dated-check convention; an equivalent
DonWeb check should be recorded beside it before committing, with current specs
and prices rather than remembered ones.

### HostGator catalogue check (August 2026) — alternative, not chosen

Kept as the record of what was compared against. DonWeb was chosen; see above.

HostGator's VPS line is fixed tiers, not build-to-order. The entry tier
already matches §10's sizing:

| Plan | Specs | Verdict |
|---|---|---|
| Shared / cPanel hosting | — | ❌ Cannot run NestJS |
| **Snappy 2000** | 2 vCPU / 4 GB RAM / 100 GB NVMe | ✅ Exactly the target sizing |
| Snappy 4000 | 4 vCPU / 8 GB RAM / 200 GB NVMe | Headroom, not needed today |

**Would have been Snappy 2000.** Around USD 35/mo promotional, renewing near USD 54 —
confirm both numbers at purchase, and confirm which regional HostGator entity
sells to Argentina, since pricing and support differ between them.

Confirmed capabilities: full root access, dedicated IP, AMD EPYC hardware,
free Let's Encrypt TLS.

**Do not buy the cPanel add-on.** It is roughly USD 12/mo and this deployment
has no use for it: the server is provisioned over SSH, and cPanel on the box
would only add an attack surface and a background service competing for the
RAM that Chromium needs.

**Renewal pricing is the real cost.** The promotional rate applies to the
first term only. Budget against the renewal figure, and check whether a longer
prepaid term is cheaper than monthly — that is usually where the saving
against DonWeb actually is or is not.

### Consequence of a foreign datacentre

Written when HostGator, whose datacentres are in the United States, was the
decision. **It no longer governs**: DonWeb's Cloud Server nodes are in
Argentina, confirmed against the provider's own page (see the catalogue check
above), so no international transfer takes place. Kept because the reasoning is
what made an Argentine datacentre worth paying attention to, and because it
applies again the day any part of this system is hosted abroad. Two things
followed.

**Latency** is not a problem. Signing is a handful of requests and the office
panel is low-traffic; a few hundred milliseconds is invisible in this
workflow.

**Data residency deserves one deliberate decision.** These contracts are the
personal data of Argentine customers — name, DNI, home address — under Ley
25.326, whose default rule is that personal data may not be transferred to a
country without an adequate level of protection, as declared by the AAIP. The
United States has historically not been on that list; a joint declaration in
November 2025 announced recognition of the US as adequate, but what governs is
the formal AAIP instrument, so this should be checked at deploy time rather
than assumed.

This is not a blocker, and the mitigation is cheap. Ley 25.326 admits the
transfer with the data subject's consent or under the AAIP's model contractual
clauses — and this system already has the customer signing a document. **Add a
clause to the template covering storage and international transfer**, which is
good practice regardless of where the server ends up. Publish it as a new
template version (§4), so contracts signed before and after remain
distinguishable.

**Backup caveat.** Provider-level backup protects against disk failure, not
against an account problem. Keep an independent copy of the database and the
PDF archive outside HostGator entirely — and given the residency point above,
an Argentine location for that copy is the better default.

### Operational guardrails

- Render PDFs through a **queue with concurrency 1–2**, never directly on the
  request thread. This is what keeps a modest VPS predictable.
- Configure **swap** (2 GB) as a safety net, not as a substitute for RAM.
- Run Node under a process manager (systemd or PM2) with restart-on-failure.
- Put Nginx in front for TLS termination and static assets.

---

## 11. Known legal observation

Clause SEGUNDA states the contract *"se extingue de manera automática plena y
definitiva"* on the expiry date. With a 10-year term this is not urgent, but
it does mean that a decade from now every contract lapses while the customer
is still connected and still holding company equipment.

This is a drafting matter for whoever wrote the contract, not something the
software should paper over. The system's contribution is to **surface upcoming
expiries** so the business can act deliberately rather than discover it.

---

## 12. Build order

**Phase 1 — Core signing (the product).**
Contract entity, versioned templates, signing flow with dual signatures,
server-side PDF, SHA-256, storage. Delivered value: the technician stops
carrying paper.

**Phase 2 — Office panel.**
Search, contract detail, termination with reason, equipment restitution,
unreturned-equipment report, resend copy.

**There is no automatic-WhatsApp-delivery phase.** An earlier version of this
document planned one, and listed Meta business verification as the project's
longest-lead item. Both are cancelled — see §8. Delivery ships complete in
Phase 1: the technician shares the sealed PDFs from the tablet during the
visit.

---

## 13. Open questions

1. Does the contract template need a personal-data clause covering storage and
   international transfer, now that the server is outside Argentina? (§10)

### Resolved

- Correcting a signed contract → **annul and re-sign**, never edit (§3).
- Frontend stack → **React + Vite** as a PWA (§5.1).
- Hosting → **HostGator VPS (Snappy 2000)**, not shared hosting (§10).
- Typos in the source contract (`ósea`, `El incumpliendo`, …) → **left
  verbatim** at the client's decision. The template transcribes the paper
  document as it is.
- **No photo of the DNI.** The transcribed number is sufficient. The system
  therefore never stores an image of an identity document, which keeps it out
  of the heavier custody obligations that holding scanned ID documents would
  bring under Ley 25.326 — and keeps a camera step out of the technician's
  flow.
