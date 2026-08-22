# Contract Archive Backup Specification

## Purpose

Produce offsite, encrypted, restore-proven daily copies of the Postgres database and the sealed-PDF archive, in an order that can never leave a `contrato_documentos` row pointing at a PDF missing from the backup.

## Requirements

### Requirement: Database-before-PDFs backup ordering

The backup script MUST complete the `pg_dump` (custom format) of the database before copying the sealed-PDF archive tree under `ALMACEN_DOCUMENTOS_RUTA`, never the reverse. This ordering can only ever produce a harmless orphan PDF, never a database row pointing at a missing file.

#### Scenario: Step order (pre-VPS, integration-tested)

- GIVEN the backup script
- WHEN run against CI's existing Postgres 17 container plus a scratch PDF directory
- THEN the `pg_dump` step completes before the PDF-copy step begins, verifiable by observing step completion order — no VPS required

#### Scenario: Row committed mid-backup produces only a harmless orphan

- GIVEN a backup in progress, and a new `contrato_documentos` row committed to Postgres after the `pg_dump` step but before the PDF-copy step completes
- WHEN the backup finishes
- THEN the resulting backup set contains, at worst, a PDF with no matching row (harmless) — never a row whose referenced PDF is absent from the backup
- Provable with CI's Postgres 17 container and a local scratch directory; no VPS required.

### Requirement: Encryption at rest

The offsite backup artifact MUST be encrypted before or during transfer; plaintext DNIs and signatures MUST NOT be stored unencrypted at the destination.

#### Scenario: Encrypt/decrypt round-trip (pre-VPS)

- GIVEN a fixture dump and PDF tree
- WHEN the backup script's encryption step runs, then the artifact is decrypted with the matching key
- THEN the decrypted bytes are identical to the source, and the encrypted artifact is not readable as plaintext without the key
- Actual transfer to the real offsite destination needs a chosen, credentialed destination (external dependency).

### Requirement: 30-day retention

The backup mechanism MUST retain the 30 most recent daily copies and prune older ones.

#### Scenario: Prune beyond retention

- GIVEN a destination listing with 31+ dated backup artifacts
- WHEN the retention step runs
- THEN exactly the 30 most recent are retained and the rest are removed
- Testable against a mocked/local destination listing; no VPS required.

### Requirement: Mechanically-proven restore

A restore-verification routine MUST restore a backup into a scratch database and directory, then re-hash every file referenced by `contrato_documentos.ruta` and compare it to the row's stored `sha256`; it MUST fail if any file is missing or its hash mismatches.

#### Scenario: Successful restore drill (pre-VPS, integration-tested)

- GIVEN a scratch Postgres 17 database (CI's container) seeded with `contrato_documentos` rows and a matching PDF tree with known SHA-256 hashes
- WHEN the restore-verification routine runs against a backup of that fixture
- THEN it reports success, and every restored file's SHA-256 equals its row's stored `sha256`

#### Scenario: Corrupted restore is caught, not silently passed

- GIVEN a restored file that is missing or whose content was altered after backup
- WHEN the restore-verification routine runs
- THEN it reports failure for that row with a nonzero exit

### Requirement: Credential hygiene

The offsite credential MUST be stored `0600` root-owned on the host, scoped to write/append where the provider supports it, and MUST NOT be committed to the repository.

#### Scenario: No credential in the repository (pre-VPS)

- GIVEN the repository
- WHEN scanned for the literal credential value or a checked-in secrets file
- THEN none is found
- Actual `0600` file permission on the host is host-only verifiable.
