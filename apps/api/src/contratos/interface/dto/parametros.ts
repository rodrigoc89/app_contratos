import { EsquemaTipoDocumentoFirmado } from "@contratos/esquemas";
import { z } from "zod";

/**
 * The two things this API reads out of a URL path.
 *
 * Both are validated for the same reason the request bodies are: a path
 * segment is client input, it just happens to arrive somewhere a `@Body()`
 * pipe would not look at it.
 */

/** A UUID is 36 characters; the cap is slack, not a format rule. */
const LARGO_MAXIMO_ID = 64;

/**
 * The contract identifier.
 *
 * Not checked as a UUID: the column is plain text and an id that matches
 * nothing simply produces a 404, which is the right answer for both a typo
 * and a deleted contract. What the bound *does* buy is that a multi-kilobyte
 * path segment never becomes a database query.
 */
export const EsquemaIdDeContrato = z
  .string("Falta el identificador del contrato.")
  .trim()
  .min(1, "Falta el identificador del contrato.")
  .max(LARGO_MAXIMO_ID, "El identificador del contrato no es válido.");

/**
 * Which of the two documents to download.
 *
 * Reusing the shared enum is what makes path traversal structurally
 * impossible here rather than merely unlikely: `..%2F..%2Fetc%2Fpasswd`
 * arrives as one decoded path segment, is not one of the two allowed values,
 * and is rejected before anything looks at a filesystem. Even if it were not,
 * the download use case matches it against the documents the aggregate
 * carries and never builds a path from it — and the store checks containment
 * a third time.
 */
export const EsquemaTipoDeDocumento = EsquemaTipoDocumentoFirmado;
