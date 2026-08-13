# SDD artifacts — `contract-list-search`

The four planning artifacts for the office contract list and search, exported
from Engram (the SDD artifact store this change was run with) into the
repository.

| File | What it is | Engram observation |
|---|---|---|
| `proposal.md` | Intent, scope, settled decisions, non-goals | `#102` |
| `spec.md` | 29 requirements / 113 scenarios — the contract `sdd-verify` validates against | `#103` |
| `design.md` | D1–D17 architecture decisions, both PRs | `#104` |
| `tasks.md` | Work units, phases, and the implementation record | `#105` |

## Why these live here

Engram stores an observation in a local SQLite database on one developer's
machine. That is fine for working memory and wrong for this: `spec.md` is the
document every requirement in `apps/api` and `apps/web` cites by number, and it
was reachable only from one laptop.

Two concrete failures made the export necessary rather than tidy:

1. **Silent truncation.** `mem_save` cuts an observation at 50,000 characters
   and reports it as a warning, not an error. `spec.md` is 49,409 characters —
   591 short of losing its tail on the next revision, with no failure anyone
   would notice. `design.md` is 45,945 and heading the same way.
2. **Whole-document replacement.** `mem_update` replaces content rather than
   patching it. `tasks.md` lost phases 1–9 to exactly that during this change
   and had to be restored by hand.

A copy in version control removes both. Truncation stops being data loss when
the full text is in git, and a bad overwrite becomes a diff.

## These are exports, not the working copy

Each file is a **byte-exact** export of its observation, with only the tool's
own display header (`#NNN [architecture] <topic>`) and trailing metadata block
(`Session:`/`Project:`/`Scope:`/`Topic:`/`Created:`) removed. Nothing was
reworded, reformatted, or summarised.

Verify a copy against its source with:

```
sha256sum docs/sdd/contract-list-search/*.md
```

```
0f63a3fee75416f1013b3cb0b1ab89a7eac4c0822b606e4a99a1de39b81693b0  design.md
6a0e74620be01e495aa293166142fae06d359d4714c5545f7097ba3b64c9522e  proposal.md
4f8a302f7946e333ba86576c36eb687a56b2560a30dbf79840548028545fb4a3  spec.md
9b7ba07c5bac13f3a926120cd1a3fdb73b4ca26d638239827b2db68f3bf96cf5  tasks.md
```

The Engram observations remain the artifacts the SDD phases read and write. If
one of them changes, re-export it here and update the hash above — otherwise
this directory quietly becomes a stale second source of truth, which is worse
than having no copy at all.

## Independent check that the export is complete

`spec.md` declares its own totals in an "Authoritative counts" table: 29
requirements and 113 scenarios. Counting the headings in the exported file
gives the same numbers, so no section was lost in transit.

```
rg -c '^### Requirement:' spec.md   # 29
rg -c '^#### Scenario:'   spec.md   # 113
```

## Status of the change

`spec.md` is revision 3. It already resolves the five defects `sdd-verify`
found, including **W-3** — R-2.8's "office sees contracts they did not create"
scenario, which was unfalsifiable because no contract carries a creator. The
scenario was replaced, and row-visibility scoping is recorded as an explicit
non-goal: `contextoTecnicoId` exists but is written only at signing and is
never read by `buscar`, so no scoping rule is representable against this schema
today. It belongs to whichever change introduces a creator column, together
with DESIGN.md §9's deferred technician scoping.

The SDD cycle is not archived. `tasks.md` item 9.1 (Migration B, `SET NOT NULL`
on `comodatario_nombre_busqueda`) is still open and gated on the backfill
reporting zero remaining nulls in production.
