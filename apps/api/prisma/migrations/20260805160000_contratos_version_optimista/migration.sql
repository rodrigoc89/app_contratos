-- Optimistic locking for the contract aggregate.
--
-- Two requests can hold the same contract at once — a slow PDF render on a
-- small VPS plus an impatient second tap, or a field connection retrying while
-- the first request is still in flight. Both read a draft, both allocate a
-- contract number, both render, both save. Nothing in the schema said the
-- second write had to notice the first, so it landed on top of it: one number
-- burned with orphaned PDFs behind it, and an event log describing a contract
-- that no longer matches the row it belongs to.
--
-- This column is what a write now has to agree with. Every UPDATE carries
-- `WHERE version = <the value the writer read>` and sets `version + 1` in the
-- same statement, so exactly one of two concurrent savers matches and the
-- other updates nothing at all and is refused.
--
-- DEFAULT 1 rather than 0: version 0 is reserved, in the application, for
-- "this aggregate has never been written". Every row already on disk *has*
-- been written, so 1 is the honest starting point for all of them, and the
-- backfill costs nothing beyond the column addition.
--
-- No index. The only query that reads this column also matches on the primary
-- key in the same predicate, so Postgres locates the row by `contratos_pkey`
-- and checks the version on the single tuple it already has in hand; a second
-- index would be written on every update and read by nothing.

ALTER TABLE "contratos"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
