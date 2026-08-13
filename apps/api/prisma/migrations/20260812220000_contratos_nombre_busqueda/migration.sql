-- Migration A of the office list search (DESIGN.md D7).
--
-- Adds the persisted, normalised name search column and its index, so the
-- office panel's "type a name, find the customer" search does not run
-- `normalizarTexto` client-side or re-derive it in SQL on every query.
--
-- NULLABLE, deliberately, and this is the entire reason A is nullable rather
-- than shipping `NOT NULL` in one step:
--
--   * `ADD COLUMN ... text` with no default is metadata-only on Postgres 11+
--     — no table rewrite, no long lock, safe on a running 4 GB VPS.
--   * The API release that ships this migration writes the column on every
--     insert and update from that instant on (ContratoMapper.ts D2), but
--     every row that existed BEFORE this migration still has it NULL.
--   * `prisma/backfill/nombreDeBusqueda.ts` fills those in afterwards,
--     importing the very same `normalizarTexto` the write path uses —
--     never hand-written SQL, which would be a second implementation of the
--     rule and free to drift from it (R-2.11).
--   * Only once that backfill confirms zero remaining NULLs does a LATER,
--     SEPARATE migration set `NOT NULL`. Shipping both in one release would
--     make `prisma migrate deploy` apply the `NOT NULL` migration before the
--     backfill ever runs, aborting the deploy on every pre-existing row.
--
-- No leading-wildcard `LIKE '%term%'` can use a plain btree index to skip
-- rows — Postgres still walks matching pages — but the index keeps this
-- column visible to `prisma migrate diff`/introspection like every other
-- index in this schema, and it is what a future trigram/GIN index would
-- replace if search volume ever demanded it (out of scope here — no
-- evidence of that need exists yet).

ALTER TABLE "contratos"
  ADD COLUMN "comodatario_nombre_busqueda" TEXT;

CREATE INDEX "idx_contratos_comodatario_nombre_busqueda"
  ON "contratos" ("comodatario_nombre_busqueda");
