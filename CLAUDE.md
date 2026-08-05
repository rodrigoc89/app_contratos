# Project instructions — Digital Comodato Contracts

## Workflow: Spec-Driven Development (default)

Substantive work in this repository goes through the SDD cycle whenever
practical. Do not ask whether to use SDD — it is the standing default here.

Cycle: `explore → propose → spec → design → tasks → apply → verify → archive`.

- Start a new change with `/sdd-new`, advance with `/sdd-continue`, check state
  with `/sdd-status`.
- Use `/sdd-ff` to fast-forward the planning phases when the change is already
  well understood.
- Implementation runs through `/sdd-apply`, then `/sdd-verify` before
  `/sdd-archive`.

Exceptions — work inline, no SDD artifacts:

- Typos, formatting, renames, and other mechanical edits that are already
  understood.
- Read-only questions about the codebase or its state.
- Single-file fixes with no unresolved design decision.

## Testing

Strict TDD: write the failing test first, then the implementation. The domain
and application layers must stay runnable without a database or a browser.

## Language

Technical artifacts (docs, code, comments, tests, commit messages) are written
in English. Domain terms (comodato, comodante, comodatario), UI copy, and
contract content stay in Spanish — see `DESIGN.md` for the rationale.
