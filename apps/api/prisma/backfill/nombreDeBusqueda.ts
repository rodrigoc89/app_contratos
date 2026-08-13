/**
 * Backfills `comodatario_nombre_busqueda` for every contract row written
 * before Migration A (DESIGN.md D7) — the ones that still hold NULL there.
 *
 *   pnpm --filter @contratos/api backfill:nombre-busqueda
 *
 * Imports the REAL `normalizarTexto` rather than re-implementing the rule
 * in SQL: a hand-written `lower(translate(...))` would be a second
 * implementation of the exact rule R-2.11 exists to keep from drifting, and
 * it is precisely the trap this module exists to avoid — the write path
 * (`ContratoMapper.ts`) and this backfill MUST agree byte-for-byte.
 *
 * Idempotent and safely re-runnable. Every page is selected
 * `WHERE comodatario_nombre_busqueda IS NULL`, so a row the live app has
 * already written (every insert and update populates the column from this
 * release onward) is never re-touched, no matter how many times this runs.
 *
 * Uses parameterised `$executeRaw`, never `prisma.contrato.update`:
 *   - `actualizado_en` is `@updatedAt` — an ORM-level update would bump it,
 *     making every backfilled contract look edited today.
 *   - It must not touch `version`: bumping it would invalidate any
 *     in-flight optimistic lock into a spurious 409 for a change the
 *     technician holding it never caused.
 *
 * Migration B (`SET NOT NULL`) is a separate, later release, gated on this
 * script reporting zero remaining NULLs — see the printed count below.
 */
// Prisma 7 no longer loads .env files automatically, and neither does Node.
// Same explicit load as prisma/seed.ts and prisma.config.ts, for the same
// reason.
import "dotenv/config";

import { normalizarTexto } from "../../src/shared/domain/normalizarTexto";
import { crearPrismaClient } from "../../src/shared/infrastructure/persistence/prismaClient";

/** Keeps one batch's lock window and memory footprint small on a 4 GB VPS. */
const TAMANO_DE_PAGINA = 500;

interface FilaPendiente {
  readonly id: string;
  readonly comodatarioNombreCompleto: string;
}

export interface ResultadoDeBackfill {
  readonly filasActualizadas: number;
  readonly nulosRestantes: number;
}

/**
 * Exported so `PrismaContratoRepository.integration.spec.ts` can drive the
 * exact same routine the CLI script below runs (R-2.11's backfill-agrees-
 * with-the-write-path scenario), rather than a second, parallel version of
 * it written for the test.
 */
export async function ejecutarBackfillDeNombreDeBusqueda(
  prisma: ReturnType<typeof crearPrismaClient>,
): Promise<ResultadoDeBackfill> {
  let filasActualizadas = 0;

  for (;;) {
    const pendientes = await prisma.$queryRaw<FilaPendiente[]>`
      SELECT id, comodatario_nombre_completo AS "comodatarioNombreCompleto"
      FROM contratos
      WHERE comodatario_nombre_busqueda IS NULL
      ORDER BY id
      LIMIT ${TAMANO_DE_PAGINA}
    `;

    if (pendientes.length === 0) {
      break;
    }

    for (const fila of pendientes) {
      const normalizado = normalizarTexto(fila.comodatarioNombreCompleto);
      await prisma.$executeRaw`
        UPDATE contratos
        SET comodatario_nombre_busqueda = ${normalizado}
        WHERE id = ${fila.id}
      `;
      filasActualizadas += 1;
    }
  }

  const conteo = await prisma.$queryRaw<Array<{ nulos: bigint }>>`
    SELECT COUNT(*)::bigint AS nulos
    FROM contratos
    WHERE comodatario_nombre_busqueda IS NULL
  `;

  return {
    filasActualizadas,
    nulosRestantes: Number(conteo[0]?.nulos ?? 0),
  };
}

// Only run as a CLI entry point — importing the function above for a test
// must not also kick off a real backfill against whatever DATABASE_URL the
// test process happens to have.
if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = crearPrismaClient();

  try {
    const resultado = await ejecutarBackfillDeNombreDeBusqueda(prisma);

    console.log(
      `Backfill de comodatario_nombre_busqueda: ${resultado.filasActualizadas} fila(s) actualizadas. Filas con NULL restantes: ${resultado.nulosRestantes}.`,
    );

    if (resultado.nulosRestantes > 0) {
      console.log(
        "ATENCIÓN: todavía quedan filas con comodatario_nombre_busqueda en NULL. No aplique la migración NOT NULL hasta que este número sea 0.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
