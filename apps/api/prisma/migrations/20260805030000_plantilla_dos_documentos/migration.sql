-- A contract is two documents the customer signs separately — the general
-- conditions of use and the comodato agreement — each with its own legal text.
-- One template version has to carry both, so the single `contenido_html`
-- column is replaced by one column per document.
--
-- The existing column is renamed rather than dropped so any content already
-- loaded survives as the comodato text, which is what it was.

ALTER TABLE "plantillas_contrato"
  RENAME COLUMN "contenido_html" TO "comodato_html";

ALTER TABLE "plantillas_contrato"
  ADD COLUMN "condiciones_generales_html" TEXT NOT NULL DEFAULT '';

ALTER TABLE "plantillas_contrato"
  ALTER COLUMN "condiciones_generales_html" DROP DEFAULT;
