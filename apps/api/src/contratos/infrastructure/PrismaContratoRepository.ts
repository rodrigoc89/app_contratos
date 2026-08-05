import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { ConflictoDeConcurrencia } from "../../shared/domain/ConflictoDeConcurrencia";
import type { ContratoRepository } from "../application/ports/ContratoRepository";
import type { Reloj } from "../application/ports/Reloj";
import type { Contrato } from "../domain/Contrato";
import { VERSION_SIN_PERSISTIR } from "../domain/Contrato";
import {
  contratoDesdeFila,
  filaContratoDesde,
  filaDocumentoDesde,
  filaEventoDesde,
  filaFirmaDesde,
} from "./mappers/ContratoMapper";

/**
 * Postgres implementation of `ContratoRepository`, through Prisma.
 *
 * `guardar` is the interesting method: the aggregate always carries its
 * *complete* state — every signature, every document, every event it has
 * ever had — so saving is not a plain insert-or-update. It has to work out,
 * on every call, which of that state is already on disk and only write what
 * is new. See the inline notes at each step for why.
 *
 * It is also where two simultaneous requests over one contract are settled.
 * Nothing above this class serialises them: two `POST /contratos/:id/firmar`
 * can both load a draft, both see `borrador`, both allocate a number and both
 * render. The write is conditioned on the version the aggregate was read at,
 * so the second one updates nothing and is refused with
 * `ConflictoDeConcurrencia` instead of landing on top of the first.
 */
export class PrismaContratoRepository implements ContratoRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
  ) {}

  async porId(id: string): Promise<Contrato | null> {
    const fila = await this.prisma.contrato.findUnique({
      where: { id },
      include: {
        firmas: true,
        documentos: true,
        // No ordinal column exists to sort by; `registradoEn` is written
        // explicitly increasing on every save (see filaEventoDesde), and
        // `id` only breaks a tie that write path is designed never to create.
        eventos: { orderBy: [{ registradoEn: "asc" }, { id: "asc" }] },
      },
    });

    if (fila === null) {
      return null;
    }

    return contratoDesdeFila(fila, {
      firmas: fila.firmas,
      documentos: fila.documentos,
      eventos: fila.eventos,
    });
  }

  async guardar(contrato: Contrato): Promise<void> {
    const fila = filaContratoDesde(contrato);
    const versionLeida = contrato.versionAlmacenada;
    const versionNueva = versionLeida + 1;

    // Trap: contract, signatures, documents and events must commit together
    // or not at all — a render or write failure partway through must never
    // leave a contract that looks numbered and signed but is missing its
    // evidence.
    await this.prisma.$transaction(async (tx) => {
      if (versionLeida === VERSION_SIN_PERSISTIR) {
        // Never read from storage, so there is nothing to collide with yet.
        // A plain insert, not an upsert: if a row with this id somehow does
        // exist, it belongs to a contract this one knows nothing about, and
        // overwriting it — which is what the upsert used to do — would erase
        // a real contract to make room for a brand-new draft.
        await tx.contrato.create({ data: { ...fila, version: versionNueva } });
      } else {
        // Compare-and-set, and the first statement in the transaction on
        // purpose: it takes the row lock before anything else is read or
        // written, so a second saver holding the same contract waits here,
        // re-checks the predicate against the committed row, and finds the
        // version already moved. Everything below — the signatures, the
        // documents, the `count()` that derives the new event tail — is
        // therefore reached by at most one of two concurrent writers.
        //
        // `updateMany`, not `update`. Both can carry a non-unique predicate,
        // but they report "nothing matched" differently: `update` throws
        // P2025, a code that also means "a related record was not found", so
        // telling a lost race apart from a missing foreign key would come
        // down to matching on an error code's message. `updateMany` answers
        // with a count, which is the plain fact this decision needs, and the
        // aggregate is written whole here with no nested writes — the one
        // thing `updateMany` cannot do.
        const { count } = await tx.contrato.updateMany({
          where: { id: fila.id, version: versionLeida },
          data: { ...fila, version: versionNueva },
        });

        if (count === 0) {
          // Zero rows matched: between this aggregate being read and this
          // save running, somebody else wrote the same contract. Throwing
          // rolls the whole transaction back — no half-signed row, no event
          // appended — and the request is answered 409 by `respuestaDeError`.
          throw new ConflictoDeConcurrencia(
            "Otra persona guardó este contrato mientras usted trabajaba, así que no se guardaron sus cambios. Recargue la pantalla para ver cómo quedó y, si hace falta, vuelva a intentar.",
          );
        }
      }

      // Firmas and documentos are not append-only tables at the database
      // level, but the domain only ever sets each one once per document
      // type (`firmar`/`registrarDocumentos` both refuse to run twice), so
      // an upsert on the (contratoId, documento) unique key is exactly as
      // safe as an insert and also makes re-saving an unchanged aggregate a
      // no-op instead of a unique-constraint violation.
      for (const firma of contrato.firmas) {
        const datos = filaFirmaDesde(contrato.id, firma);
        // filaFirmaDesde's return type documents the row's real shape for
        // the mapper's own tests; Prisma's Json input type only accepts it
        // through this boundary cast, which is where a Prisma-shaped type is
        // allowed to appear — the mapper itself stays Prisma-free.
        const trazos = datos.trazos as unknown as Prisma.InputJsonValue;
        await tx.firmaCapturada.upsert({
          where: {
            contratoId_documento: {
              contratoId: contrato.id,
              documento: datos.documento,
            },
          },
          create: { ...datos, trazos },
          update: { ...datos, trazos },
        });
      }

      for (const documento of contrato.documentos) {
        const datos = filaDocumentoDesde(contrato.id, documento);
        await tx.documentoContrato.upsert({
          where: {
            contratoId_documento: {
              contratoId: contrato.id,
              documento: datos.documento,
            },
          },
          create: datos,
          update: datos,
        });
      }

      // Trap: contrato_eventos is append-only, enforced by a database
      // trigger — any UPDATE or DELETE raises. The aggregate carries its
      // full event list on every save, so only the tail beyond what is
      // already stored may ever be inserted.
      const yaGuardados = await tx.eventoContrato.count({
        where: { contratoId: contrato.id },
      });
      const nuevos = contrato.eventos.slice(yaGuardados);

      if (nuevos.length > 0) {
        // Postgres evaluates CURRENT_TIMESTAMP once for the whole
        // transaction, so the column default alone cannot order events
        // appended in the same call — they are stamped explicitly instead.
        //
        // The anchor is the later of "now" and one millisecond past the
        // last event already stored for this contract, not "now" alone:
        // relying on the clock alone would only be safe if it were
        // guaranteed to advance by at least the size of the previous batch
        // between two calls to guardar() — true in practice for the real
        // clock, but not a guarantee this code should depend on.
        const ultimoGuardado = await tx.eventoContrato.findFirst({
          where: { contratoId: contrato.id },
          orderBy: { registradoEn: "desc" },
          select: { registradoEn: true },
        });
        const piso =
          ultimoGuardado === null
            ? 0
            : ultimoGuardado.registradoEn.getTime() + 1;
        const ancla = Math.max(this.reloj.ahora().getTime(), piso);

        await tx.eventoContrato.createMany({
          data: nuevos.map((evento, indice) =>
            filaEventoDesde(contrato.id, evento, new Date(ancla + indice)),
          ),
        });
      }
    });

    // Only after the commit. The row now holds `versionNueva`, so this
    // instance has to as well — otherwise the deliberate no-op re-save of an
    // unchanged aggregate would compare against a version its own previous
    // save had already replaced, and be refused as somebody else's write.
    contrato.confirmarVersionAlmacenada(versionNueva);
  }

  async siguienteNumero(): Promise<number> {
    // Trap: this has to be the `contrato_numero_seq` sequence via `nextval`,
    // never max(numero) + 1 — two technicians signing at the same time would
    // read the same max and collide.
    const filas = await this.prisma.$queryRaw<
      Array<{ nextval: bigint }>
    >`SELECT nextval('contrato_numero_seq') AS nextval`;

    const fila = filas[0];
    if (fila === undefined) {
      throw new Error(
        "No se pudo asignar el siguiente número de contrato: la secuencia no devolvió ningún valor.",
      );
    }

    return Number(fila.nextval);
  }
}
