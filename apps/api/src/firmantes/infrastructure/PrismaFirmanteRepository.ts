import type { PrismaClient } from "../../../generated/prisma/client";
import type { FirmanteRepository } from "../../contratos/application/ports/FirmanteRepository";
import { DomainError } from "../../shared/domain/DomainError";
import type { FirmanteComodante } from "../domain/FirmanteComodante";
import { firmanteComodanteDesdeFila } from "./mappers/FirmanteComodanteMapper";

/**
 * Postgres implementation of `FirmanteRepository`.
 *
 * Read-only, matching the port. `activo = true` is guaranteed unique by the
 * partial unique index `ux_firmantes_comodante_activo` (see migration.sql),
 * so `findFirst` here can never return the wrong row — at most one exists.
 *
 * Decision: when no signatory is active, `activo()` throws `DomainError`
 * rather than returning null. The port's return type is
 * `Promise<FirmanteComodante>`, not `... | null`, and "no comodante
 * configured" is a real business situation the technician needs to see
 * before they can sign anything — not an infrastructure failure to hide
 * behind a generic error.
 */
export class PrismaFirmanteRepository implements FirmanteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async activo(): Promise<FirmanteComodante> {
    const fila = await this.prisma.firmanteComodante.findFirst({
      where: { activo: true },
    });

    if (fila === null) {
      throw new DomainError(
        "No hay ningún firmante comodante activo configurado: no se puede firmar ningún contrato hasta que se cargue uno.",
      );
    }

    return firmanteComodanteDesdeFila(fila);
  }

  /** Installation-side lookup, by the signatory's unique version label. */
  async buscarPorVersion(version: string): Promise<FirmanteComodante | null> {
    const fila = await this.prisma.firmanteComodante.findUnique({
      where: { version },
    });

    return fila === null ? null : firmanteComodanteDesdeFila(fila);
  }

  /**
   * Adds a signatory version and makes it the active one, in a single
   * transaction.
   *
   * Superseded versions are deactivated rather than deleted: contracts point
   * at the exact signatory row they were stamped with, and that row must
   * survive for as long as the contract does. Doing both writes in one
   * transaction is what keeps `ux_firmantes_comodante_activo` — "at most one
   * active" — from rejecting the insert.
   *
   * The DNI is stored as bare digits (`Dni.valor`), the same normalised form
   * the contracts table uses, so the two are comparable.
   */
  async instalarComoActivo(firmante: FirmanteComodante): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.firmanteComodante.updateMany({
        where: { activo: true },
        data: { activo: false },
      });

      await tx.firmanteComodante.create({
        data: {
          id: firmante.id,
          version: firmante.version,
          nombreCompleto: firmante.nombreCompleto,
          dni: firmante.dni.valor,
          imagenFirmaPng: firmante.imagenFirmaPng,
          activo: true,
        },
      });
    });
  }
}
