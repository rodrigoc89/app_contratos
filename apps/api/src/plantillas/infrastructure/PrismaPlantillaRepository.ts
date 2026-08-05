import type { PrismaClient } from "../../../generated/prisma/client";
import type { PlantillaRepository } from "../../contratos/application/ports/PlantillaRepository";
import type { Reloj } from "../../contratos/application/ports/Reloj";
import { DomainError } from "../../shared/domain/DomainError";
import { FechaCalendario } from "../../shared/domain/FechaCalendario";
import { columnaFechaDesde } from "../../shared/infrastructure/persistence/columnaFecha";
import type { PlantillaContrato } from "../domain/PlantillaContrato";
import { plantillaContratoDesdeFila } from "./mappers/PlantillaContratoMapper";

/**
 * Argentina runs on a single offset, but naming the zone keeps the intent
 * explicit: which template version is "in force today" is decided in
 * Argentina's calendar, not UTC's. This mirrors
 * `FirmarContrato.ZONA_HORARIA_CONTRATO` exactly, redeclared here rather than
 * imported so `plantillas/infrastructure` does not reach into
 * `contratos/application` for a constant — the two are independent bounded
 * contexts that happen to agree on one timezone.
 */
const ZONA_HORARIA_CONTRATO = "America/Argentina/Cordoba";

/**
 * Postgres implementation of `PlantillaRepository`.
 *
 * Read-only, matching the port: templates are published, never edited, by a
 * concern outside this repository's contract.
 */
export class PrismaPlantillaRepository implements PlantillaRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
  ) {}

  async vigente(): Promise<PlantillaContrato> {
    const hoy = FechaCalendario.enZona(this.reloj.ahora(), ZONA_HORARIA_CONTRATO);

    const fila = await this.prisma.plantillaContrato.findFirst({
      where: { vigenteDesde: { lte: columnaFechaDesde(hoy) } },
      orderBy: [{ vigenteDesde: "desc" }, { creadoEn: "desc" }],
    });

    if (fila === null) {
      throw new DomainError(
        "No hay ninguna versión de plantilla de contrato vigente hoy: hay que publicar una antes de poder firmar.",
      );
    }

    return plantillaContratoDesdeFila(fila);
  }
}
