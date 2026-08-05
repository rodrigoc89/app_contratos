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
}
