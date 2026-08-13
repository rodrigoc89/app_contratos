-- Records WHO performed a contract transition, closing the gap between
-- DESIGN.md §3 — "Annulment records a reason and an actor" — and a schema
-- that only ever stored the reason.
--
-- Terminating or annulling a contract is an operation with legal weight on
-- someone else's agreement. Until now nobody could answer who did it: not
-- the aggregate, not the event log, not the columns beside `motivo_baja`.
--
-- NULLABLE, and this one stays nullable forever — unlike
-- `comodatario_nombre_busqueda`, there is no later `SET NOT NULL` waiting:
--
--   * `creado` happens before the contract has any legal weight.
--   * `firmado` records its técnico in the signing context, together with the
--     device, the IP and the coordinates — a far richer record than one id.
--   * Every event written before this migration genuinely has no answer, and
--     inventing one would be worse than storing null.
--
-- `ADD COLUMN ... text` with no default is metadata-only on Postgres 11+, so
-- this is a fast, lock-light migration on a running 4 GB VPS.
--
-- Deliberately NOT a foreign key to `usuarios`: deleting a user must never
-- cascade into, or be blocked by, the audit trail of a signed contract. The
-- id is kept as a plain value, the way `contexto_tecnico_id` already is.

ALTER TABLE "contrato_eventos"
  ADD COLUMN "usuario_id" TEXT;
